#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — Script de Deploy Rápido (VPS único)
# Uso: ./deploy.sh [prod|staging]
# =============================================================================

set -euo pipefail

ENV="${1:-prod}"
COMPOSE_FILE="docker-compose.${ENV}.yml"
ENV_FILE=".env.${ENV}"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $*"; }
err() { echo -e "${RED}[ERRO]${NC} $*" >&2; }

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

# Verificar variáveis críticas
source "$ENV_FILE"
critical_vars=(
    "JWT_SECRET"
    "DB_PASSWORD"
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
# Build & Deploy
# -----------------------------------------------------------------------------
log "A fazer build das imagens..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --pull

log "A subir serviços (db, redis, api)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db redis

log "A aguardar base de dados ficar saudável..."
sleep 10
until docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
    sleep 2
done

log "A subir API..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d api

log "A aguardar API ficar saudável..."
sleep 15
until curl -sf "http://localhost:8080/actuator/health" | grep -q '"status":"UP"'; do
    sleep 3
done

log "A subir Frontend + Nginx..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d frontend nginx

# -----------------------------------------------------------------------------
# Pós-deploy
# -----------------------------------------------------------------------------
log "Deploy concluído! Verificando saúde dos serviços..."
sleep 5

docker compose -f "$COMPOSE_FILE" ps

echo
log "Endpoints:"
echo "  Frontend:  $APP_BASE_URL"
echo "  API:       $NEXT_PUBLIC_API_URL"
echo "  Health:    $NEXT_PUBLIC_API_URL/actuator/health"
echo
warn "Não esqueça de:"
echo "  1. Substitua SEU_IP_VPS no .env.prod pelo IP real do VPS"
echo "  2. Configurar backups automáticos da base de dados"
echo "  3. Monitorar logs: docker compose -f $COMPOSE_FILE logs -f"
echo "  4. Quando tiver domínio: configure DNS, volte nginx para HTTPS, rode certbot"