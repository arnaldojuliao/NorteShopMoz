#!/usr/bin/env bash
# =============================================================================
# NorteShopMoz — Deploy Unificado: Render (API) + Vercel (Frontend)
# Uso: ./deploy-all.sh
#
# Pré-requisitos:
#   - Serviço já criado no Render (Blueprint render.yaml) com as env vars
#   - vercel CLI instalado e autenticado (vercel login)
#   - Opcional: RENDER_DEPLOY_HOOK_URL (Render Dashboard → Settings → Deploy Hook)
#   - Opcional: .env.render com APP_DOMAIN/RENDER_SERVICE_URL (ver .env.render.example)
#
# O script:
#   1. Dispara deploy da API no Render (via Deploy Hook), se configurado
#      (sem hook, o Render faz deploy automático em push para main)
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

if [[ -f "$PROJECT_ROOT/.env.render" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env.render"
    set +a
fi

RENDER_SERVICE_URL="${RENDER_SERVICE_URL:-https://norteshop-api.onrender.com}"
RENDER_SERVICE_URL="${RENDER_SERVICE_URL%/}"
API_HEALTH_URL="${API_HEALTH_URL:-${RENDER_SERVICE_URL}/actuator/health/liveness}"
APP_DOMAIN="${APP_DOMAIN:-seudominio.com}"
MAX_WAIT_SECONDS=600 # cold start no Render (free tier) pode demorar vários minutos
POLL_INTERVAL=10

# -----------------------------------------------------------------------------
# 1. Deploy Render (API)
# -----------------------------------------------------------------------------
log "=== DEPLOY RENDER (API) ==="

if [[ -n "${RENDER_DEPLOY_HOOK_URL:-}" ]]; then
    log "A disparar deploy via Deploy Hook..."
    curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL" >/dev/null \
        || { err "Falhou o deploy hook do Render."; exit 1; }
    log "Deploy disparado."
else
    warn "RENDER_DEPLOY_HOOK_URL não definido."
    warn "Sem hook, o Render faz deploy automático em push para main —"
    warn "certifica-te de que o último commit já chegou ao GitHub."
fi

log "A aguardar API ficar saudável (${RENDER_SERVICE_URL})..."
waited=0
until curl -sf --max-time 10 "$API_HEALTH_URL" | grep -q '"status":"UP"'; do
    if (( waited >= MAX_WAIT_SECONDS )); then
        err "Timeout à espera da API (${MAX_WAIT_SECONDS}s). Verifica os logs:"
        err "  Render Dashboard → norteshop-api → Events / Logs"
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
log "  API:      ${RENDER_SERVICE_URL}"
log "  Health:   ${RENDER_SERVICE_URL}/actuator/health/liveness"
log ""
warn "Próximos passos:"
echo "  1. Vercel env: API_PROXY_TARGET=${RENDER_SERVICE_URL}"
echo "  2. Vercel env: API_INTERNAL_BASE_URL=${RENDER_SERVICE_URL}"
echo "  3. Vercel env: API_PROXY_SECRET=<igual a PROXY_TOKEN no Render>"
echo "  4. Domínio próprio: Render Dashboard → norteshop-api → Settings →"
echo "     Custom Domains → Add api.${APP_DOMAIN} (o Render cria o certificado)"
echo "  5. DNS: CNAME api → <serviço>.onrender.com e CNAME @ → cname.vercel-dns.com"
echo "  6. Vercel: Dashboard → Settings → Domains"
echo "  7. Webhooks (PaySuite, OAuth) para ${RENDER_SERVICE_URL}/..."
