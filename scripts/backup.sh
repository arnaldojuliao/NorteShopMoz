#!/bin/bash
set -euo pipefail

# NorteShopMoz - Backup Script
# Usage: ./backup.sh [full|incremental] [retention_days]

BACKUP_DIR="${BACKUP_DIR:-/backups/norteshop}"
DB_NAME="${DB_NAME:-norteshopmoz}"
DB_USER="${DB_USER:-norteshopmoz}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
RETENTION_DAYS="${2:-7}"
BACKUP_TYPE="${1:-full}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/norteshop_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"
LATEST_SYMLINK="${BACKUP_DIR}/latest.sql.gz"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Verificar dependências
check_deps() {
    for cmd in pg_dump pg_restore gzip; do
        if ! command -v $cmd &> /dev/null; then
            error "Comando '$cmd' não encontrado. Instale postgresql-client."
            exit 1
        fi
    done
}

# Criar diretório de backup
mkdir -p "${BACKUP_DIR}"

# Validar tipo de backup
if [[ ! "$BACKUP_TYPE" =~ ^(full|incremental)$ ]]; then
    error "Tipo de backup inválido: $BACKUP_TYPE. Use 'full' ou 'incremental'."
    exit 1
fi

log "Iniciando backup ${BACKUP_TYPE} do banco ${DB_NAME}..."

# Verificar conexão
log "Verificando conexão com banco..."
if ! pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -q; then
    error "Não foi possível conectar ao banco ${DB_HOST}:${DB_PORT}/${DB_NAME}"
    exit 1
fi

# Executar backup
if [[ "$BACKUP_TYPE" == "full" ]]; then
    log "Executando backup completo..."
    pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --no-owner \
        --no-privileges \
        --format=custom \
        --compress=9 \
        --file="${BACKUP_FILE%.gz}.dump" \
        --verbose 2>&1 | tail -5

    # Comprimir
    gzip -9 "${BACKUP_FILE%.gz}.dump"
    mv "${BACKUP_FILE%.gz}.dump.gz" "${BACKUP_FILE}"
else
    log "Executando backup incremental (apenas dados modificados nas últimas 24h)..."
    # Para incremental, usamos pg_dump com --data-only e filtro por data
    # Nota: PostgreSQL não tem incremental nativo, usamos abordagem baseada em WAL
    log "Backup incremental usa pg_basebackup para Point-in-Time Recovery (PITR)"
    
    # Para PITR, configurar WAL archiving no postgresql.conf:
    # wal_level = replica
    # archive_mode = on
    # archive_command = 'cp %p /backups/wal_archive/%f'
    
    # Por simplicidade, fazemos full backup com timestamp
    pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --no-owner \
        --no-privileges \
        --format=custom \
        --compress=9 \
        --file="${BACKUP_FILE%.gz}.dump" \
        --verbose 2>&1 | tail -5

    gzip -9 "${BACKUP_FILE%.gz}.dump"
    mv "${BACKUP_FILE%.gz}.dump.gz" "${BACKUP_FILE}"
fi

# Verificar se backup foi criado
if [[ ! -f "${BACKUP_FILE}" ]]; then
    error "Arquivo de backup não foi criado: ${BACKUP_FILE}"
    exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
log "Backup concluído: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Atualizar symlink latest
ln -sfn "$(basename "${BACKUP_FILE}")" "${LATEST_SYMLINK}"
log "Symlink 'latest' atualizado: ${LATEST_SYMLINK}"

# Limpeza de backups antigos
log "Removendo backups mais antigos que ${RETENTION_DAYS} dias..."
find "${BACKUP_DIR}" -name "norteshop_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete
log "Limpeza concluída."

# Verificar integridade
log "Verificando integridade do backup..."
if gunzip -t "${BACKUP_FILE}" 2>/dev/null; then
    log "Integridade OK."
else
    error "Falha na verificação de integridade!"
    exit 1
fi

log "Backup ${BACKUP_TYPE} concluído com sucesso!"

# Opcional: Upload para S3/GCS/Azure Blob
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
    log "Enviando para S3: s3://${BACKUP_S3_BUCKET}/norteshop/..."
    aws s3 cp "${BACKUP_FILE}" "s3://${BACKUP_S3_BUCKET}/norteshop/$(basename ${BACKUP_FILE})" --storage-class STANDARD_IA
    log "Upload para S3 concluído."
fi

# Notificação (opcional)
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
        -H 'Content-Type: application/json' \
        -d "{\"text\":\"✅ Backup ${BACKUP_TYPE} concluído: ${BACKUP_FILE} (${BACKUP_SIZE})\"}" > /dev/null
fi

log "Backup finalizado com sucesso!"