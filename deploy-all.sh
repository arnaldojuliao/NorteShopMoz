#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — Deploy Unificado: Railway (API) + Vercel (Frontend)
# Uso: ./deploy-all.sh
#
# Pré-requisitos:
#   - Serviço já criado no Railway a partir do GitHub (Root Directory=backend,
#     config backend/railway.json) com as env vars e domínio público gerado
#   - vercel CLI instalado e autenticado (vercel login)
#   - Opcional: RAILWAY_DEPLOY_HOOK_URL (Railway → Service → Settings →
#     Networking/Deploy → Deploy Hook)
#   - Opcional: .env.railway com APP_DOMAIN/RAILWAY_SERVICE_URL
#     (ver .env.railway.example)
#
# O script:
#   1. Dispara deploy da API no Railway (via Deploy Hook), se configurado
#      (sem hook, o Railway faz deploy automático em push para main)
#   2. Aguarda o health check da API
#   3. Deploy do Frontend no Vercel (produção)
# =============================================================================

set -euo pipefail

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $*"; }
err() { echo -e "${RED}[ERRO]${NC} $*" >&2; }
info() { echo -e "${BLUE}[INFO]${NC} $*"; }

# Configuração
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$PROJECT_ROOT/.env.railway" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env.railway"
    set +a
fi

RAILWAY_SERVICE_URL="${RAILWAY_SERVICE_URL:-https://norteshop-api-production.up.railway.app}"
RAILWAY_SERVICE_URL="${RAILWAY_SERVICE_URL%/}"
API_HEALTH_URL="${API_HEALTH_URL:-${RAILWAY_SERVICE_URL}/actuator/health}"
APP_DOMAIN="${APP_DOMAIN:-seudominio.com}"
MAX_WAIT_SECONDS=900 # o primeiro build Docker no Railway pode demorar ~10 min
POLL_INTERVAL=10

# -----------------------------------------------------------------------------
# 1. Deploy Railway (API)
# -----------------------------------------------------------------------------
log "=== DEPLOY RAILWAY (API) ==="

if [[ -n "${RAILWAY_DEPLOY_HOOK_URL:-}" ]]; then
    log "A disparar deploy via Deploy Hook..."
    curl -fsS -X POST "$RAILWAY_DEPLOY_HOOK_URL" >/dev/null \
        || { err "Falhou o deploy hook do Railway."; exit 1; }
    log "Deploy disparado."
else
    warn "RAILWAY_DEPLOY_HOOK_URL não definido."
    warn "Sem hook, o Railway faz deploy automático em push para main —"
    warn "certifica-te de que o último commit já chegou ao GitHub."
fi

log "A aguardar API ficar saudável (${RAILWAY_SERVICE_URL})..."
waited=0
until curl -sf --max-time 10 "$API_HEALTH_URL" | grep -q '"status":"UP"'; do
    if (( waited >= MAX_WAIT_SECONDS )); then
        err "Timeout à espera da API (${MAX_WAIT_SECONDS}s). Verifica os logs:"
        err "  Railway Dashboard → norteshop-api → Deployments / Logs"
        exit 1
    fi
    sleep "$POLL_INTERVAL"
    waited=$((waited + POLL_INTERVAL))
    info "  Aguardando... (${waited}s/${MAX_WAIT_SECONDS}s)"
done

log "API saudável! ✓"

# -----------------------------------------------------------------------------
# 2. Deploy Vercel (Frontend)
# -----------------------------------------------------------------------------
log ""
log "=== DEPLOY VERCEL (FRONTEND) ==="
# Num monorepo com Root Directory=frontend, a CLI da Vercel corre na raiz do
# repositório e usa VERCEL_ORG_ID/VERCEL_PROJECT_ID (ver workflow frontend-ci).
cd "$PROJECT_ROOT"
if [[ -n "${VERCEL_ORG_ID:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
    command -v vercel >/dev/null 2>&1 || { err "vercel CLI não encontrado: npm i -g vercel"; exit 1; }
    vercel whoami >/dev/null 2>&1 || { err "Não autenticado no Vercel: vercel login"; exit 1; }
    log "A fazer deploy do Frontend no Vercel (produção)..."
    vercel --prod --yes
else
    warn "VERCEL_ORG_ID/VERCEL_PROJECT_ID não definidos."
    warn "O frontend será deployado pelo git push (integração Git da Vercel)."
fi

log ""
log "=== DEPLOY CONCLUÍDO COM SUCESSO! ==="
log ""
log "Endpoints:"
log "  Frontend: https://${APP_DOMAIN}"
log "  API:      ${RAILWAY_SERVICE_URL}"
log "  Health:   ${RAILWAY_SERVICE_URL}/actuator/health"
log ""
warn "Próximos passos:"
echo "  1. Vercel env: API_PROXY_TARGET=${RAILWAY_SERVICE_URL}"
echo "  2. Vercel env: API_INTERNAL_BASE_URL=${RAILWAY_SERVICE_URL}"
echo "  3. Vercel env: API_PROXY_SECRET=<igual a PROXY_TOKEN no Railway>"
echo "  4. Domínio próprio (plano pago): Railway → Service → Settings →"
echo "     Networking → Custom Domain → Add api.${APP_DOMAIN}"
echo "  5. DNS: CNAME api → <servico>.up.railway.app e CNAME @ → cname.vercel-dns.com"
echo "  6. Vercel: Dashboard → Settings → Domains"
echo "  7. Webhooks (PaySuite, OAuth) para ${RAILWAY_SERVICE_URL}/..."
