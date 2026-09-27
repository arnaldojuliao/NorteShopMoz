#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — Script de Deploy Rápido (VPS único)
# Uso: ./deploy.sh [prod|staging]
#
# Variáveis opcionais:
#   SKIP_BACKUP=1     não faz o dump pré-deploy (não recomendado: as migrações
#                     Flyway correm no arranque da API e não têm rollback)
#   SKIP_PORT_CHECK=1 não verifica se as portas publicadas estão livres (não
#                     recomendado: um contentor arranca SEM rede e sem porta)
#   BACKUP_DIR        destino dos dumps (por omissão ./backups)
#
# BACKUP OFF-SITE (OBRIGATÓRIO):
#   Um dump guardado só no mesmo VPS não é um backup — quando o host se perde
#   (disco, ransomware, corrupção), perde-se TAMBÉM a única cópia. Por isso o
#   deploy só avança depois de confirmar uma cópia FORA da máquina. Configure no
#   .env.prod uma das duas vias:
#     BACKUP_S3_BUCKET=<bucket>          (requer o CLI 'aws' no PATH)
#     OFFSITE_BACKUP_CMD='<comando>'     (recebe o caminho do dump como $1)
#   Para forçar a avançar sem cópia off-site (NÃO recomendado):
#     SKIP_OFFSITE_BACKUP=1
# =============================================================================

set -euo pipefail

ENV="${1:-prod}"
COMPOSE_FILE="docker-compose.${ENV}.yml"
ENV_FILE=".env.${ENV}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

# Teto de espera por serviço (segundos). Antes os `until … sleep` não tinham
# limite: com o Redis em baixo (o /actuator/health dependia dele) o deploy ficava
# pendurado indefinidamente.
DB_WAIT_SECONDS="${DB_WAIT_SECONDS:-120}"
API_WAIT_SECONDS="${API_WAIT_SECONDS:-300}"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $*"; }
err() { echo -e "${RED}[ERRO]${NC} $*" >&2; }

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Carrega um ficheiro .env SEM o executar como shell.
#
# Antes usava-se `source "$ENV_FILE"`: qualquer valor com $(...) ou backticks era
# executado como código — um ficheiro de segredos não é código. Este leitor aceita
# KEY=VALUE, linhas comentadas, `export KEY=VALUE` e remove aspas envolventes;
# nunca faz expansão de comandos ou de variáveis.
load_env_file() {
    local file="$1" line key value dq='"' sq="'"
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"                             # CRLF
        line="${line#"${line%%[![:space:]]*}"}"           # trim à esquerda
        [[ -z "$line" || "$line" == \#* ]] && continue
        [[ "$line" == export[[:space:]]* ]] && line="${line#export }"
        [[ "$line" == *=* ]] || continue                 # linha sem '='
        key="${line%%=*}"
        value="${line#*=}"
        key="${key//[[:space:]]/}"                       # 'KEY = value' tolerado
        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
        if [[ ${#value} -ge 2 ]]; then
            if [[ "${value:0:1}" == "$dq" && "${value: -1}" == "$dq" ]]; then value="${value:1:${#value}-2}"; fi
            if [[ "${value:0:1}" == "$sq" && "${value: -1}" == "$sq" ]]; then value="${value:1:${#value}-2}"; fi
        fi
        printf -v "$key" '%s' "$value"
        export "${key}"
    done < "$file"
}

# Host de um URL (sem esquema, caminho nem porta): https://loja.exemplo.com/x → loja.exemplo.com
host_of_url() {
    local host="${1#*://}"
    host="${host%%/*}"
    printf '%s' "${host%%:*}"
}

# -----------------------------------------------------------------------------
# Verificações prévias
# -----------------------------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
    err "Ficheiro $ENV_FILE não encontrado. Copie .env.prod.template para $ENV_FILE e preencha."
    exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
    err "Ficheiro $COMPOSE_FILE não encontrado."
    exit 1
fi

# Verificar variáveis críticas (leitura segura — sem executar o ficheiro)
load_env_file "$ENV_FILE"
critical_vars=(
    "JWT_SECRET"
    "DB_PASSWORD"
    "REDIS_PASSWORD"
    "RESEND_API_KEY"
    "CLOUDINARY_CLOUD_NAME"
    "CLOUDINARY_API_KEY"
    "CLOUDINARY_API_SECRET"
    "APP_BASE_URL"
    "CORS_ALLOWED_ORIGINS"
    "NEXT_PUBLIC_API_URL"
)
for var in "${critical_vars[@]}"; do
    value="${!var:-}"
    if [[ -z "$value" || "$value" == CHANGE_ME* || "$value" == SEU_IP_VPS* ]]; then
        err "Variável crítica $var não definida ou usa valor padrão em $ENV_FILE"
        exit 1
    fi
done

# -----------------------------------------------------------------------------
# Coerência TLS ↔ cookies
#
# Sem esta verificação, um APP_BASE_URL https:// com a conf HTTP do nginx (o
# mount por omissão deste compose) deixava a loja sem HTTPS e o browser
# descartava os cookies de sessão (flag Secure) — login quebrado sem erro no
# servidor. Se o esquema não for https, os cookies Secure têm de estar off.
# -----------------------------------------------------------------------------
if [[ "$APP_BASE_URL" == https://* ]]; then
    # O domínio é derivado de APP_BASE_URL se não for indicado à parte. A conf SSL
    # tinha o domínio fixo (norteshopmoz.com) enquanto o APP_BASE_URL apontava
    # para outro: com o valor fixo o nginx não arrancava (certificado
    # inexistente); se divergissem os nomes, servia o certificado errado.
    APP_DOMAIN="${APP_DOMAIN:-$(host_of_url "$APP_BASE_URL")}"
    export APP_DOMAIN
    CERTBOT_CERTS="${CERTBOT_CERTS:-./certbot/conf}"
    export CERTBOT_CERTS

    if [[ -z "$APP_DOMAIN" ]]; then
        err "Não foi possível determinar o domínio: defina APP_DOMAIN (ex.: APP_DOMAIN=loja.exemplo.com)."
        exit 1
    fi

    cert_dir="$CERTBOT_CERTS/live/$APP_DOMAIN"
    for cert_file in fullchain.pem privkey.pem; do
        if [[ ! -r "$cert_dir/$cert_file" ]]; then
            err "Certificado em falta: $cert_dir/$cert_file"
            err "Emita-o com: certbot certonly --webroot -w ${CERTBOT_WWW:-./certbot/www} -d $APP_DOMAIN"
            err "Ou aponte CERTBOT_CERTS para a pasta que contém live/$APP_DOMAIN/."
            err "Sem certificado válido o nginx não arranca e a loja fica sem HTTPS."
            exit 1
        fi
    done

    # A conf SSL é um template: ${APP_DOMAIN} é resolvido aqui, não no contentor.
    mkdir -p nginx/.generated
    NGINX_CONF="./nginx/.generated/default.conf"
    export NGINX_CONF
    sed "s|\${APP_DOMAIN}|$APP_DOMAIN|g" nginx/nginx.conf.template > "$NGINX_CONF"
    if grep -qF '${APP_DOMAIN}' "$NGINX_CONF"; then
        err "Ficaram placeholders por resolver em $NGINX_CONF — a abortar."
        exit 1
    fi

    if [[ "${APP_COOKIE_SECURE:-true}" != "true" ]]; then
        warn "APP_BASE_URL é https:// mas APP_COOKIE_SECURE=${APP_COOKIE_SECURE}. Os cookies de sessão"
        warn "vão sem a flag Secure. Use APP_COOKIE_SECURE=true (por omissão)."
    fi
    log "TLS: domínio $APP_DOMAIN, conf SSL gerada em $NGINX_CONF, cookies Secure."
else
    if [[ "${APP_COOKIE_SECURE:-true}" == "true" ]]; then
        err "APP_BASE_URL='$APP_BASE_URL' não é https:// e APP_COOKIE_SECURE=true."
        err "O backend recusa arrancar nesta combinação (cookies Secure são descartados em HTTP)."
        err "Configure HTTPS, ou defina APP_COOKIE_SECURE=false enquanto a loja servir HTTP."
        exit 1
    fi
    warn "Loja em HTTP: os cookies de sessão viajam em claro. Configure HTTPS assim que possível."
fi

if [[ "$CORS_ALLOWED_ORIGINS" == *localhost* ]]; then
    warn "CORS_ALLOWED_ORIGINS contém 'localhost' ($CORS_ALLOWED_ORIGINS) — defina o domínio real da loja."
fi

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
# Espera limitada por uma condição. Aborta com diagnóstico em vez de pendurar.
wait_for() {
    local description="$1"
    local max_seconds="$2"
    shift 2
    local waited=0
    until "$@" >/dev/null 2>&1; do
        if (( waited >= max_seconds )); then
            err "Timeout à espera de: $description (${max_seconds}s). Deploy abortado."
            compose ps >&2 || true
            exit 1
        fi
        sleep 3
        waited=$((waited + 3))
    done
    log "$description — OK (${waited}s)"
}

# Dump da base de dados antes de migrar. As migrações Flyway correm no arranque
# da API e não têm rollback: sem uma cópia prévia, um problema no schema não tem
# como ser revertido.
#
# Envia um dump para um destino FORA do VPS. Aborta o deploy se não houver
# destino configurado ou se o envio falhar: sem isto, um problema nas migrações
# (que não têm rollback) só teria como rede o próprio host que pode ter falhado.
#
offsite_backup() {
    local file="$1"

    if [[ -n "${OFFSITE_BACKUP_CMD:-}" ]]; then
        log "A enviar o backup para o destino off-site (OFFSITE_BACKUP_CMD)…"
        if ! bash -c "$OFFSITE_BACKUP_CMD" _ "$file"; then
            err "O comando de backup off-site falhou — a abortar (as migrações não têm rollback)."
            return 1
        fi
        log "Backup off-site confirmado (OFFSITE_BACKUP_CMD)."
        return 0
    fi

    if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
        err "Sem destino de backup off-site configurado em $ENV_FILE."
        err "Um backup só no mesmo VPS não protege contra a perda do host."
        err "Defina BACKUP_S3_BUCKET=<bucket> (requer o CLI 'aws') ou"
        err "OFFSITE_BACKUP_CMD='<comando que recebe o dump em \$1>'."
        err "Para avançar mesmo assim (NÃO recomendado): SKIP_OFFSITE_BACKUP=1"
        return 1
    fi

    if ! command -v aws >/dev/null 2>&1; then
        err "BACKUP_S3_BUCKET definido mas o CLI 'aws' não está instalado no host."
        return 1
    fi

    log "A enviar o backup para s3://$BACKUP_S3_BUCKET/norteshop/ …"
    if ! aws s3 cp "$file" "s3://$BACKUP_S3_BUCKET/norteshop/$(basename "$file")" \
            --storage-class STANDARD_IA; then
        err "Falha no upload para S3 — a abortar (as migrações não têm rollback)."
        return 1
    fi
    log "Backup off-site confirmado (s3://$BACKUP_S3_BUCKET)."
}

backup_before_deploy() {
    if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then
        warn "SKIP_BACKUP=1 — a avançar SEM backup. As migrações não têm rollback."
        return 0
    fi
    mkdir -p "$BACKUP_DIR"
    local file="${BACKUP_DIR}/pre-deploy_$(date +%Y%m%d_%H%M%S).sql.gz"
    log "Backup pré-deploy da base de dados → $file"

    if ! compose exec -T db pg_dump -U "${DB_USER:-postgres}" -d "${DB_NAME:-norteshopmoz}" \
            --no-owner --no-privileges 2>/dev/null | gzip > "$file"; then
        rm -f "$file"
        err "Falha no backup pré-deploy — a abortar (use SKIP_BACKUP=1 para forçar)."
        exit 1
    fi
    # Um dump truncado não é um backup: só conta depois de abrir.
    if ! gunzip -t "$file" 2>/dev/null; then
        rm -f "$file"
        err "O backup pré-deploy está corrompido (gunzip -t falhou) — a abortar."
        exit 1
    fi
    log "Backup guardado e verificado ($(du -h "$file" | cut -f1))."

    if [[ "${SKIP_OFFSITE_BACKUP:-0}" == "1" ]]; then
        warn "SKIP_OFFSITE_BACKUP=1 — backup só LOCAL. Se o VPS se perder, perde também o backup."
        return 0
    fi

    offsite_backup "$file" || exit 1
    log "Para repor o dump: gunzip -c $file | compose exec -T db psql ..."
}

# -----------------------------------------------------------------------------
# Build & Deploy
# -----------------------------------------------------------------------------
# Portas publicadas: se alguma já estiver ocupada, o Docker reverte o endpoint do
# contentor e ele fica a correr SEM rede e SEM porta publicada — o healthcheck
# (que corre dentro do contentor) continua "healthy", o nome do serviço deixa de
# resolver-se para a API e a loja degrada sem nenhum aviso. Melhor descobri-lo
# agora do que 12 h depois.
if [[ "${SKIP_PORT_CHECK:-0}" != "1" ]]; then
    log "A verificar as portas publicadas (evita contentores sem rede)..."
    if [[ ! -x ./scripts/docker-net-check.sh ]]; then
        warn "scripts/docker-net-check.sh não encontrado — verificação de portas ignorada."
    elif ! COMPOSE_FILE="$COMPOSE_FILE" ./scripts/docker-net-check.sh --preflight; then
        err "Há portas já ocupadas: o contentor correspondente arrancaria sem rede (ver acima)."
        err "Liberte a porta ou arranque com SKIP_PORT_CHECK=1 (não recomendado)."
        exit 1
    fi
fi

log "A fazer build das imagens..."
compose build --pull

log "A subir serviços de estado (db, redis, redis-cache)..."
compose up -d db redis redis-cache

wait_for "base de dados saudável" "$DB_WAIT_SECONDS" \
    compose exec -T db pg_isready -U "${DB_USER:-postgres}" -d "${DB_NAME:-norteshopmoz}"

backup_before_deploy

log "A subir API (aplica as migrações Flyway no arranque)..."
compose up -d api

# Liveness e não /actuator/health: a API é funcional mesmo com o Redis em baixo
# (rate limit e idempotência falham abertos), e não faz sentido abortar o deploy
# por causa de uma dependência que a aplicação tolera.
wait_for "API saudável (liveness)" "$API_WAIT_SECONDS" \
    bash -c 'curl -sf http://localhost:8080/actuator/health/liveness | grep -q "\"status\":\"UP\""'

# Diagnóstico de dependências (não bloqueia o deploy, por desenho: a aplicação
# degrada em vez de morrer sem Redis).
#
# Porque é preciso: um contentor pode ficar a correr SEM endpoint de rede quando o
# Docker não consegue programar a porta publicada no arranque
# ("failed to set up container networking ... address already in use"), e o
# healthcheck — que corre DENTRO do contentor — continua "healthy". A loja fica
# com o rate limit, o bloqueio de brute-force, o idle e a revogação de sessões
# desligados, e só o /actuator/health/readiness sabe disso.
if curl -sf --max-time 5 http://localhost:8080/actuator/health/readiness >/dev/null 2>&1; then
    log "Dependências alcançáveis a partir da API (readiness UP)"
else
    warn "readiness DOWN: a API não alcança o Redis ou a base de dados."
    warn "Continue: rate limit, bloqueio de brute-force e revogação de sessões DESLIGADOS."
    warn "Suspeita de contentor 'healthy' mas fora da rede. Diagnóstico: ./scripts/docker-net-check.sh"
    warn "Correção sem perder dados: ./scripts/docker-net-check.sh --fix"
fi

# Bloqueio de negócio silencioso — tem de estar no output do deploy, onde alguém
# o vê. Com PAYMENTS_MODE=simulated (o valor por omissão) e o perfil `prod`, o
# gateway simulado NÃO é registado (ver SimulatedPaymentGateway): M-Pesa, e-Mola e
# cartão respondem 503. O checkout desativa-os no UI, pelo que a loja PARECE
# normal e só cobra à cobrança ou por transferência.
if [[ "${PAYMENTS_MODE:-simulated}" != "live" ]]; then
    warn "PAYMENTS_MODE=${PAYMENTS_MODE:-simulated}: pagamentos online (M-Pesa/e-Mola/cartão) DESATIVADOS (503)."
    warn "A loja só cobra 'Pagamento na entrega' e 'Transferência bancária'. Implemente um gateway real e use PAYMENTS_MODE=live."
fi

log "A subir Frontend + Nginx..."
compose up -d frontend nginx

# -----------------------------------------------------------------------------
# Pós-deploy
# -----------------------------------------------------------------------------
log "Deploy concluído! Verificando saúde dos serviços..."
sleep 5

compose ps

echo
log "Endpoints:"
echo "  Frontend:  $APP_BASE_URL"
echo "  API:       $NEXT_PUBLIC_API_URL"
echo "  Health:    http://localhost:8080/actuator/health (interno)"
echo
warn "Não esqueça de:"
echo "  1. Configurar os backups automáticos COM destino off-site (scripts/install-backup-cron.sh + BACKUP_S3_BUCKET)"
echo "  2. Monitorizar logs: docker compose -f $COMPOSE_FILE logs -f"
echo "  3. Rever os avisos [PROD] do arranque da API: docker compose -f $COMPOSE_FILE logs api | grep '\[PROD\]'"
echo "  4. Subir a monitorização COM alertas — sem destino, as regras disparam e ninguém é avisado:"
echo "       ALERT_WEBHOOK_URL='<webhook>' docker compose -f monitoring/docker-compose.monitoring.yml --profile alerting up -d"
echo "     (a aplicação degrada em vez de cair: uma avaria parcial só se vê nos alertas)"
echo "  5. Confirmar o travão do checkout (ORDERS_MAX_PER_CONTACT / ORDERS_MAX_GLOBAL_PER_HOUR) e a retenção"
echo "     de pedidos — ORDERS_RETENTION_DAYS (por omissão 730 dias; 0 = desligado, nunca apaga pedidos em curso)"
