#!/bin/bash
set -euo pipefail

# NorteShopMoz - Restore Script
# Usage: ./restore.sh [backup_file] [target_db] [target_user]

BACKUP_FILE="${1:-}"
DB_NAME="${2:-norteshopmoz}"
DB_USER="${2:-norteshopmoz}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${3:-norteshopmoz}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"; }

# Verificar argumentos
if [[ -z "${BACKUP_FILE}" ]]; then
    error "Uso: $0 <backup_file> [target_db] [target_user]"
    error "Exemplo: $0 /backups/norteshop_full_20260825_120000.sql.gz norteshopmoz norteshopmoz"
    exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
    error "Arquivo de backup não encontrado: ${BACKUP_FILE}"
    exit 1
fi

log "Iniciando restore do backup: ${BACKUP_FILE}"
log "Banco alvo: ${DB_NAME} | Usuário: ${DB_USER} | Host: ${DB_HOST}:${DB_PORT}"

# Verificar se arquivo existe e é válido
if [[ ! -f "${BACKUP_FILE}" ]]; then
    error "Arquivo não encontrado: ${BACKUP_FILE}"
    exit 1
fi

log "Verificando integridade do backup..."
if ! gunzip -t "${BACKUP_FILE}" 2>/dev/null; then
    error "Arquivo de backup corrompido ou inválido!"
    exit 1
fi
log "Integridade do backup verificada."

# Verificar conexão
log "Verificando conexão com banco..."
if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "postgres" -q; then
    error "Não foi possível conectar ao PostgreSQL em ${DB_HOST}:${DB_PORT}"
    exit 1
fi

# Confirmar operação (exceto se FORCE=1)
if [[ "${FORCE:-0}" != "1" ]]; then
    warn "ATENÇÃO: Esta operação vai SUBSTITUIR o banco de dados '${DB_NAME}'!"
    warn "Todos os dados atuais serão PERDIDOS."
    read -p "Tem certeza que deseja continuar? (digite 'SIM' para confirmar): " CONFIRM
    if [[ "${CONFIRM}" != "SIM" ]]; then
        log "Operação cancelada pelo usuário."
        exit 0
    fi
fi

# Desconectar usuários ativos (exceto o nosso)
log "Desconectando usuários ativos do banco '${DB_NAME}'..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "postgres" -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

# Dropar e recriar banco
warn "Removendo banco de dados existente '${DB_NAME}'..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "postgres" -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" > /dev/null

log "Criando novo banco '${DB_NAME}'..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "postgres" -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";" > /dev/null

# Restaurar backup
log "Restaurando backup (pode levar alguns minutos)..."
if [[ "${BACKUP_FILE}" == *.dump.gz ]] || [[ "${BACKUP_FILE}" == *.dump ]]; then
    # Formato custom (pg_dump -Fc)
    log "Restaurando dump customizado..."
    gunzip -c "${BACKUP_FILE}" | pg_restore \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --no-owner \
        --no-privileges \
        --verbose \
        --jobs=4 \
        2>&1 | tail -10
else
    # Formato SQL puro
    log "Restaurando dump SQL..."
    gunzip -c "${BACKUP_FILE}" | psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --quiet \
        2>&1 | tail -5
fi

# Verificar restore
log "Verificando restore..."
TABLE_COUNT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
log "Tabelas restauradas: ${TABLE_COUNT}"

ROW_COUNT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT sum(n_live_tup) FROM pg_stat_user_tables;" | xargs)
log "Total de linhas (aprox): ${ROW_COUNT}"

# Recriar índices e estatísticas
log "Atualizando estatísticas..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "ANALYZE;" > /dev/null

log "Restore concluído com sucesso!"
log "Banco: ${DB_NAME} | Tabelas: ${TABLE_COUNT} | Linhas: ${ROW_COUNT}"

# Notificação
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Restore concluído: ${BACKUP_FILE} -> ${DB_NAME} (${TABLE_COUNT} tabelas, ${ROW_COUNT} linhas)\"}" > /dev/null
fi

log "Restore finalizado com sucesso!"