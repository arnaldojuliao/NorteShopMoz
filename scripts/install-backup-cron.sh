#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# NorteShopMoz — Instala os cron jobs de backup
#
# Uso: sudo ./scripts/install-backup-cron.sh
#
# O ficheiro scripts/cron_jobs é um MODELO: tem o caminho do projeto por
# substituir e não é instalado por ninguém. Sem este passo, não havia backups
# automáticos nenhuns (só scripts que ninguém chamava).
#
# Este script escreve /etc/cron.d/norteshop-backups com o caminho absoluto real
# do projeto (citado — o caminho pode ter espaços, o que parte a sintaxe do cron)
# e as variáveis que os scripts de backup precisam.
# =============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="/etc/cron.d/norteshop-backups"
LOG_DIR="${LOG_DIR:-/var/log}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log() { echo -e "${GREEN}[cron]${NC} $*"; }
warn() { echo -e "${YELLOW}[cron]${NC} $*"; }
err() { echo -e "${RED}[cron]${NC} $*" >&2; }

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    err "Precisa de root para escrever em /etc/cron.d (use sudo)."
    exit 1
fi

if [[ ! -f "${PROJECT_DIR}/scripts/backup.sh" ]]; then
    err "Não encontrei scripts/backup.sh em ${PROJECT_DIR}."
    exit 1
fi

if [[ ! -f "${PROJECT_DIR}/.env.prod" ]]; then
    warn "Não existe ${PROJECT_DIR}/.env.prod — confirme DB_NAME/DB_USER antes de confiar nos backups."
fi

# Carrega .env.prod SEM o executar como shell (mesma política do deploy.sh).
load_env_file() {
    local file="$1" line key value dq='"' sq="'"
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        line="${line#"${line%%[![:space:]]*}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue
        [[ "$line" == export[[:space:]]* ]] && line="${line#export }"
        [[ "$line" == *=* ]] || continue
        key="${line%%=*}"
        value="${line#*=}"
        key="${key//[[:space:]]/}"
        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        if [[ ${#value} -ge 2 ]]; then
            if [[ "${value:0:1}" == "$dq" && "${value: -1}" == "$dq" ]]; then value="${value:1:${#value}-2}"; fi
            if [[ "${value:0:1}" == "$sq" && "${value: -1}" == "$sq" ]]; then value="${value:1:${#value}-2}"; fi
        fi
        printf -v "$key" '%s' "$value"
        export "${key}"
    done < "$file"
}

[[ -f "${PROJECT_DIR}/.env.prod" ]] && load_env_file "${PROJECT_DIR}/.env.prod"

# Backup off-site OBRIGATÓRIO: sem destino, os dumps ficam só no VPS e perdem-se
# com o host — o mesmo princípio que o deploy.sh aplica. Recusar instalar é
# preferível a instalar backups que não protegem nada.
OFFSITE_TAG=""
if [[ "${SKIP_OFFSITE_BACKUP:-0}" == "1" ]]; then
    warn "SKIP_OFFSITE_BACKUP=1 — vou instalar backups só LOCAIS (NÃO recomendado)."
elif [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
    if ! command -v aws >/dev/null 2>&1; then
        err "BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET} em .env.prod, mas o CLI 'aws' não está instalado."
        err "Instale o awscli e configure credenciais para root (ex.: 'sudo aws configure')."
        exit 1
    fi
    OFFSITE_TAG="BACKUP_S3_BUCKET='${BACKUP_S3_BUCKET}'"
    log "Destino off-site: s3://${BACKUP_S3_BUCKET}"
elif [[ -n "${OFFSITE_BACKUP_CMD:-}" ]]; then
    OFFSITE_TAG="OFFSITE_BACKUP_CMD='${OFFSITE_BACKUP_CMD}'"
    log "Destino off-site: OFFSITE_BACKUP_CMD"
else
    err "Sem destino de backup off-site em ${PROJECT_DIR}/.env.prod."
    err "Defina BACKUP_S3_BUCKET=<bucket> ou OFFSITE_BACKUP_CMD='<comando que recebe o dump em \$1>'."
    err "Um backup só no mesmo VPS não protege contra a perda do host."
    err "Para instalar mesmo assim (NÃO recomendado): SKIP_OFFSITE_BACKUP=1 sudo $0"
    exit 1
fi
warn "As credenciais do 'aws' NÃO são escritas no cron — configure-as para root (ex.: 'sudo aws configure')."

log "Caminho do projeto: ${PROJECT_DIR}"

cat > "$TARGET" <<EOF
# NorteShopMoz — backups automáticos (gerado por scripts/install-backup-cron.sh)
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash
# O dump corre DENTRO do contentor do PostgreSQL (MODE=docker), por isso não é
# preciso pg_dump no host nem password no ambiente.
MODE=docker
COMPOSE_FILE='${PROJECT_DIR}/docker-compose.prod.yml'
ENV_FILE='${PROJECT_DIR}/.env.prod'
BACKUP_DIR=/backups/norteshop
# Destino off-site obrigatório (ver backup.sh). Escolhido a partir de .env.prod
# no momento da instalação; o backup diário FALHA se não conseguir copiar para fora.
${OFFSITE_TAG}

# Backup completo diário às 02:30 (tráfego baixo).
30 2 * * * root '${PROJECT_DIR}/scripts/backup.sh' full 30 >> ${LOG_DIR}/norteshop-backup.log 2>&1

# Verificação diária: o dump mais recente existe e abre (falha fica no log).
0 4 * * * root '${PROJECT_DIR}/scripts/backup.sh' --verify-only >> ${LOG_DIR}/norteshop-verify.log 2>&1

# Limpeza semanal de dumps antigos (retenção principal fica no backup.sh).
0 3 * * 0 root find /backups/norteshop -name '*.sql.gz' -type f -mtime +30 -delete >> ${LOG_DIR}/norteshop-cleanup.log 2>&1
EOF

chmod 0644 "$TARGET"
log "Instalado: ${TARGET}"

echo
log "Teste imediato (recomendado):"
echo "  sudo -u root '${PROJECT_DIR}/scripts/backup.sh' full 30"
echo "  sudo -u root '${PROJECT_DIR}/scripts/backup.sh' --verify-only"
echo
warn "Confirme que /backups existe e tem espaço: df -h /backups"
