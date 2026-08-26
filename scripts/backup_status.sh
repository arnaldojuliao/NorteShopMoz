#!/bin/bash
# NorteShopMoz - Backup Status Report
# Gera relatório de status dos backups

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/norteshop}"
WAL_DIR="${WAL_DIR:-/backups/wal_archive}"

log() { echo -e "\033[0;32m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"; }
warn() { echo -e "\033[1;33m[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:\033[0m $1"; }
error() { echo -e "\033[0;31m[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:\033[0m $1"; }

BACKUP_DIR="${BACKUP_DIR:-/backups/norteshop}"
WAL_DIR="${WAL_DIR:-/backups/wal_archive}"

echo "========================================"
echo "  NorteShopMoz - Backup Status Report"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# Verificar diretórios
echo "📁 Diretórios:"
echo "  Backup dir: ${BACKUP_DIR} $([ -d "${BACKUP_DIR}" ] && echo "✅" || echo "❌")"
echo "  WAL dir:    ${WAL_DIR} $([ -d "${WAL_DIR}" ] && echo "✅" || echo "❌")"
echo ""

# Backups recentes
echo "📦 Backups Recentes:"
RECENT_BACKUPS=$(find "${BACKUP_DIR}" -name "norteshop_*.sql.gz" -type f -mtime -7 -printf "%T@ %p\n" 2>/dev/null | sort -rn | head -10)
if [[ -n "${RECENT_BACKUPS}" ]]; then
    echo "${RECENT_BACKUPS}" | while read timestamp filepath; do
        date_str=$(date -d "@${timestamp%.*}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "unknown")
        size=$(du -h "${filepath}" | cut -f1)
        echo "  ✅ $(basename ${filepath}) - ${date_str} (${size})"
    done
else
    warn "Nenhum backup encontrado nos últimos 7 dias!"
fi
echo ""

# Backup mais antigo e mais recente
OLDEST=$(find "${BACKUP_DIR}" -name "norteshop_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | head -1)
NEWEST=$(find "${BACKUP_DIR}" -name "norteshop_*.sql.gz" -type f -printf '%T@ %p\n' | sort -rn | head -1)

if [[ -n "${OLDEST}" ]] && [[ -n "${NEWEST}" ]]; then
    OLDEST_DATE=$(date -d "@${OLDEST%% *}" '+%Y-%m-%d %H:%M' 2>/dev/null)
    NEWEST_DATE=$(date -d "@${NEWEST%% *}" '+%Y-%m-%d %H:%M' 2>/dev/null)
    COUNT=$(find "${BACKUP_DIR}" -name "norteshop_*.sql.gz" -type f | wc -l)
    TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)
    
    echo "📊 Estatísticas:"
    echo "  Total de backups: ${COUNT}"
    echo "  Tamanho total: ${TOTAL_SIZE}"
    echo "  Mais antigo: ${OLDEST_DATE}"
    echo "  Mais recente: ${NEWEST_DATE}"
    
    # Verificar se há backup nas últimas 24h
    RECENT_COUNT=$(find "${BACKUP_DIR}" -name "norteshop_*.sql.gz" -type f -mtime -1 | wc -l)
    if [[ ${RECENT_COUNT} -gt 0 ]]; then
        log "✅ Backup nas últimas 24h: ${RECENT_COUNT}"
    else
        warn "⚠️  Nenhum backup nas últimas 24h!"
    fi
fi

echo ""

# WAL Archive status
echo "📜 WAL Archive:"
WAL_COUNT=$(find "${WAL_DIR}" -name "*.backup" -type f 2>/dev/null | wc -l)
WAL_SIZE=$(du -sh "${WAL_DIR}" 2>/dev/null | cut -f1)
echo "  Arquivos WAL: ${WAL_COUNT}"
echo "  Tamanho total: ${WAL_SIZE:-0}"

# Verificar se há WALs recentes (últimos 30 min)
RECENT_WAL=$(find "${WAL_DIR}" -name "*.backup" -type f -mmin -30 2>/dev/null | wc -l)
if [[ ${RECENT_WAL} -gt 0 ]]; then
    log "✅ WAL archive ativo (${RECENT_WAL} arquivos nos últimos 30 min)"
else
    warn "⚠️  Nenhum WAL arquivado nos últimos 30 min!"
fi
echo ""

# Verificar espaço em disco
echo "💾 Espaço em Disco:"
df -h /backups 2>/dev/null | tail -1 | awk '{print "  Disponível: " $4 " / " $2 " (" $5 " usado)"}' || warn "Não foi possível verificar espaço em /backups"

# Verificar PostgreSQL
echo ""
echo "🐘 PostgreSQL:"
if pg_isready -q -h localhost -p 5432 -U norteshopmoz -d norteshopmoz 2>/dev/null; then
    log "✅ PostgreSQL acessível"
    
    # Info do banco
    DB_SIZE=$(psql -h localhost -U norteshopmoz -d norteshopmoz -t -c "SELECT pg_size_pretty(pg_database_size('norteshopmoz'));" 2>/dev/null | xargs)
    TABLE_COUNT=$(psql -h localhost -U norteshopmoz -d norteshopmoz -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    echo "  Tamanho DB: ${DB_SIZE}"
    echo "  Tabelas: ${TABLE_COUNT}"
else
    error "❌ PostgreSQL inacessível!"
fi

echo ""
echo "========================================"
echo "  Relatório gerado em: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"