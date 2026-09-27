#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# NorteShopMoz — Backup da base de dados
#
# Uso:
#   ./scripts/backup.sh                       # dump completo (retenção 7 dias)
#   ./scripts/backup.sh full 30               # completo, mantém 30 dias
#   ./scripts/backup.sh --verify-only         # verifica o último dump e sai
#
# Variáveis de ambiente:
#   MODE            docker (omissão) | host
#                   docker → dump DENTRO do contentor do PostgreSQL: não precisa
#                            de pg_dump no host nem de password em claro, e a
#                            versão do cliente é sempre igual à do servidor;
#                   host   → pg_dump do host (requer PGPASSWORD ou ~/.pgpass).
#   COMPOSE_FILE    (omissão ./docker-compose.prod.yml)
#   ENV_FILE        (omissão .env.prod) — só para o `docker compose`
#   DB_SERVICE      (omissão db)
#   DB_NAME/DB_USER/DB_PASSWORD, DB_HOST/DB_PORT (modo host)
#   BACKUP_DIR      (omissão /backups/norteshop)
#   BACKUP_S3_BUCKET   destino OFF-SITE (OBRIGATÓRIO — requer o CLI 'aws')
#                      ou OFFSITE_BACKUP_CMD='<comando que recebe o dump em $1>'
#   SKIP_OFFSITE_BACKUP=1  permite um backup só LOCAL (NÃO recomendado)
#   SLACK_WEBHOOK_URL (opcional)
#
# Nota: "incremental" não existe no PostgreSQL sem WAL archiving. Este script faz
# sempre dump completo; a verificação de integridade (--verify-only) é o que o
# cron usa para garantir que os backups existem e abrem.
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-/backups/norteshop}"
MODE="${MODE:-docker}"
COMPOSE_FILE="${COMPOSE_FILE:-./docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_NAME="${DB_NAME:-norteshopmoz}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
RETENTION_DAYS="7"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2; }

# -----------------------------------------------------------------------------
# --verify-only: confirma que o dump mais recente existe, abre e tem conteúdo.
# O cron usa-o como teste de fumo — sem ele, "os backups correm" podia ser falso.
# -----------------------------------------------------------------------------
verify_only() {
    local target="${1:-}"
    if [[ -z "$target" ]]; then
        target="$(ls -1t "${BACKUP_DIR}"/norteshop_*.sql.gz 2>/dev/null | head -1 || true)"
    fi
    if [[ -z "$target" || ! -f "$target" ]]; then
        error "Nenhum ficheiro de backup em ${BACKUP_DIR} — os backups NÃO estão a correr."
        exit 1
    fi
    if ! gunzip -t "$target" 2>/dev/null; then
        error "Backup corrompido (gunzip -t falhou): ${target}"
        exit 1
    fi
    # Um dump válido tem instruções SQL; ~vazio significa pg_dump sem permissões
    # ou a apontar para a base errada.
    local size
    size=$(gunzip -c "$target" | wc -c)
    if (( size < 1024 )); then
        error "Backup suspeito (${size} bytes): ${target}"
        exit 1
    fi
    log "Backup verificado: ${target} ($(du -h "$target" | cut -f1), ${size} bytes de SQL)"
}

if [[ "${1:-}" == "--verify-only" ]]; then
    verify_only "${2:-}"
    exit 0
fi

BACKUP_TYPE="${1:-full}"
RETENTION_DAYS="${2:-7}"

if [[ ! "$BACKUP_TYPE" =~ ^(full|incremental)$ ]]; then
    error "Tipo de backup inválido: $BACKUP_TYPE. Use 'full', 'incremental' ou '--verify-only'."
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/norteshop_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"
LATEST_SYMLINK="${BACKUP_DIR}/latest.sql.gz"

mkdir -p "${BACKUP_DIR}"

# -----------------------------------------------------------------------------
# Dump
# -----------------------------------------------------------------------------
log "Iniciando backup ${BACKUP_TYPE} de ${DB_NAME} (modo ${MODE})..."

dump_to_stdout() {
    if [[ "$MODE" == "docker" ]]; then
        if [[ ! -f "$COMPOSE_FILE" ]]; then
            error "COMPOSE_FILE=${COMPOSE_FILE} não existe (modo docker)."
            exit 1
        fi
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
            exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges
    else
        if [[ -z "${PGPASSWORD:-}" && ! -f "${HOME}/.pgpass" ]]; then
            error "Modo host sem PGPASSWORD nem ~/.pgpass — o pg_dump vai falhar a pedir password."
            error "Exporte PGPASSWORD no ambiente (ou use MODE=docker, o valor por omissão)."
            exit 1
        fi
        pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges
    fi
}

if ! dump_to_stdout | gzip -9 > "$BACKUP_FILE"; then
    rm -f "$BACKUP_FILE"
    error "O dump falhou — nenhum backup foi guardado."
    exit 1
fi

# -----------------------------------------------------------------------------
# Verificação (o backup só conta depois de abrir)
# -----------------------------------------------------------------------------
verify_only "$BACKUP_FILE"
ln -sfn "$(basename "${BACKUP_FILE}")" "${LATEST_SYMLINK}"
log "Symlink 'latest' atualizado: ${LATEST_SYMLINK}"

# -----------------------------------------------------------------------------
# Retenção (inclui os dumps pré-deploy do deploy.sh)
# -----------------------------------------------------------------------------
log "Removendo backups com mais de ${RETENTION_DAYS} dias..."
find "${BACKUP_DIR}" -name 'norteshop_*.sql.gz' -type f -mtime +"${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -name 'pre-deploy_*.sql.gz' -type f -mtime +"${RETENTION_DAYS}" -delete

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
log "Backup concluído: ${BACKUP_FILE} (${BACKUP_SIZE})"

# -----------------------------------------------------------------------------
# Cópia off-site (OBRIGATÓRIA)
#
# Um dump guardado só no MESMO VPS não é um backup: quando o host se perde
# (disco, ransomware, corrupção), perde-se a única cópia. Por isso o backup só
# se considera concluído depois de confirmar uma cópia FORA da máquina.
#   BACKUP_S3_BUCKET    → envia para S3 (requer o CLI 'aws' autenticado);
#   OFFSITE_BACKUP_CMD  → corre um comando seu com o dump em $1.
# Escape explícito (não recomendado): SKIP_OFFSITE_BACKUP=1
# -----------------------------------------------------------------------------
offsite_backup() {
    local file="$1"

    if [[ -n "${OFFSITE_BACKUP_CMD:-}" ]]; then
        log "Enviando o backup para o destino off-site (OFFSITE_BACKUP_CMD)..."
        if ! bash -c "${OFFSITE_BACKUP_CMD}" _ "${file}"; then
            error "O comando de backup off-site falhou."
            return 1
        fi
        log "Cópia off-site confirmada (OFFSITE_BACKUP_CMD)."
        return 0
    fi

    if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
        error "Sem destino de backup off-site."
        error "Defina BACKUP_S3_BUCKET=<bucket> (requer o CLI 'aws' autenticado) ou"
        error "OFFSITE_BACKUP_CMD='<comando que recebe o dump em \$1>'."
        error "Um backup só no mesmo VPS não protege contra a perda do host."
        error "Para permitir um backup só local (NÃO recomendado): SKIP_OFFSITE_BACKUP=1"
        return 1
    fi

    if ! command -v aws >/dev/null 2>&1; then
        error "BACKUP_S3_BUCKET definido mas o CLI 'aws' não está instalado no host."
        return 1
    fi

    local key="norteshop/$(basename "${file}")"
    log "Enviando para s3://${BACKUP_S3_BUCKET}/${key} ..."
    if ! aws s3 cp "${file}" "s3://${BACKUP_S3_BUCKET}/${key}" --storage-class STANDARD_IA; then
        error "Falha no upload para S3 — o backup NÃO foi copiado off-site."
        return 1
    fi
    # Confirma que o objeto existe mesmo em S3 (o `cp` pode sair 0 e não gravar).
    if ! aws s3api head-object --bucket "${BACKUP_S3_BUCKET}" --key "${key}" >/dev/null 2>&1; then
        error "O upload terminou mas o objeto não foi encontrado: s3://${BACKUP_S3_BUCKET}/${key}"
        return 1
    fi
    log "Cópia off-site confirmada: s3://${BACKUP_S3_BUCKET}/${key}"
}

if [[ "${SKIP_OFFSITE_BACKUP:-0}" == "1" ]]; then
    warn "SKIP_OFFSITE_BACKUP=1 — backup só LOCAL. Se o VPS se perder, perde também o backup."
elif ! offsite_backup "${BACKUP_FILE}"; then
    error "Backup NÃO concluído: falta a cópia off-site (o dump local ficou em ${BACKUP_FILE})."
    exit 1
fi

if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Backup ${BACKUP_TYPE} concluído: ${BACKUP_FILE} (${BACKUP_SIZE})\"}" > /dev/null
fi

log "Backup finalizado com sucesso!"
