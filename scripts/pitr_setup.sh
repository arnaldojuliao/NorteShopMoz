#!/bin/bash
# NorteShopMoz - Point-in-Time Recovery (PITR) Setup
# Configura WAL archiving para Point-in-Time Recovery

set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/backups/wal_archive}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

log() { echo -e "\033[0;32m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"; }
warn() { echo -e "\033[1;33m[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:\033[0m $1"; }
error() { echo -e "\033[0;31m[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:\033[0m $1"; }

mkdir -p "${WAL_ARCHIVE_DIR}"
chown -R postgres:postgres "${WAL_ARCHIVE_DIR}"
chmod 700 "${WAL_ARCHIVE_DIR}"

log() { echo -e "\033[0;32m[$(date '+%Y-%m-%d %H:%M:%S')]\033[0m $1"; }
warn() { echo -e "\033[1;33m[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:\033[0m $1"; }
error() { echo -e "\033[0;31m[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:\033[0m $1"; }

log "Configurando WAL Archiving para Point-in-Time Recovery..."

# Gerar configuração do postgresql.conf para WAL archiving
cat > /tmp/wal_archive.conf <<EOF
# === WAL Archiving para Point-in-Time Recovery ===
wal_level = replica
archive_mode = on
archive_command = 'test ! -f ${WAL_ARCHIVE_DIR}/%f && cp %p ${WAL_ARCHIVE_DIR}/%f'
archive_timeout = 300  # Força switch de WAL a cada 5 min se inativo

# Configurações de Checkpoint para PITR
checkpoint_timeout = 10min
max_wal_size = 2GB
min_wal_size = 512MB
checkpoint_completion_target = 0.9

# Hot Standby (para read replicas)
hot_standby = on
max_standby_streaming_delay = 30s
wal_receiver_status_interval = 10s
hot_standby_feedback = on

# Logging para auditoria
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000  # log queries > 1s
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_temp_files = 0
log_autovacuum_min_duration = 0
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

EOF

log "Arquivo de configuração WAL gerado em /tmp/wal_archive.conf"
log "Copie para postgresql.conf e reinicie o PostgreSQL:"
echo "  cat /tmp/wal_archive.conf >> \${PGDATA}/postgresql.conf"
echo "  systemctl restart postgresql  # ou docker restart postgres"

# Script de recuperação PITR
cat > /tmp/restore_pitr.sh <<'EOF'
#!/bin/bash
# Restore to Point-in-Time
# Uso: ./restore_pitr.sh <target_time> <backup_base_dir> <target_dir>

TARGET_TIME="${1:-}"
BACKUP_BASE="${2:-/backups/norteshop}"
TARGET_DIR="${3:-/var/lib/postgresql/data_restore}"

if [[ -z "$1" ]]; then
    echo "Uso: \$0 'YYYY-MM-DD HH:MM:SS' [backup_base_dir] [target_dir]"
    echo "Exemplo: \$0 '2026-08-25 14:30:00' /backups/norteshop /var/lib/postgresql/data_restore"
    exit 1
fi

log() { echo -e "\033[0;32m[\$(date '+%Y-%m-%d %H:%M:%S')]\033[0m \$1"; }
error() { echo -e "\033[0;31m[\$(date '+%Y-%m-%d %H:%M:%S')] ERROR:\033[0m \$1"; }

TARGET_TIME="\${1:-}"
BACKUP_BASE="\${2:-/backups/norteshop}"
TARGET_DIR="\${3:-\/var\/lib\/postgresql\/data_restore}"

if [[ -z "\$1" ]]; then
    echo "Uso: \$0 'YYYY-MM-DD HH:MM:SS' [backup_base_dir] [target_dir]"
    echo "Exemplo: \$0 '2026-08-25 14:30:00' /backups/norteshop /var/lib/postgresql/data_restore"
    exit 1
fi

log() { echo -e "\033[0;32m[\$(date '+%Y-%m-%d %H:%M:%S')]\033[0m \$1"; }
error() { echo -e "\033[0;31m[\$(date '+%Y-%m-%d %H:%M:%S')] ERROR:\033[0m \$1"; }

TARGET_TIMESTAMP=\$(date -d "\${TARGET_TIME}" +%s 2>/dev/null) || { error "Formato de data inválido. Use: 'YYYY-MM-DD HH:MM:SS'"; exit 1; }

# Encontrar backup base mais próximo ANTES do target time
LATEST_BACKUP=\$(find /backups/norteshop -name "norteshop_full_*.sql.gz" -type f -printf '%T@ %p\n' | awk -v target="\$TARGET_TIMESTAMP" '\$1 <= target {print \$2}' | tail -1)

if [[ -z "\${LATEST_BACKUP}" ]]; then
    error "Nenhum backup encontrado antes de \${TARGET_TIME}"
    exit 1
fi

log "Backup base selecionado: \${LATEST_BACKUP}"
log "Restaurando até: \${TARGET_TIME}"

# Parar PostgreSQL
systemctl stop postgresql || docker stop postgres

# Limpar diretório de dados
rm -rf /var/lib/postgresql/data/*

# Restaurar backup base
log "Restaurando backup base: \${LATEST_BACKUP}"
gunzip -c "\${LATEST_BACKUP}" | pg_restore -d postgres -C -j 4

# Configurar recovery.signal para PITR
cat > /var/lib/postgresql/data/recovery.signal <<EOF
# PITR Recovery
recovery_target_time = '\${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# Configurar restore_command para WAL archive
cat > /var/lib/postgresql/data/postgresql.auto.conf <<EOF
restore_command = 'cp /backups/wal_archive/%f %p'
recovery_target_time = '\${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# Iniciar PostgreSQL em modo recovery
systemctl start postgresql

log "Aguardando recuperação até \${TARGET_TIME}..."
while systemctl is-active --quiet postgresql; do
    sleep 5
done

log "Recuperação PITR concluída até \${TARGET_TIME}"
log "Verificando banco..."
psql -c "SELECT now(); SELECT count(*) FROM users;"

EOF

chmod +x /tmp/restore_pitr.sh

log "Scripts PITR criados:"
echo "  /tmp/restore_pitr.sh - Recuperação Point-in-Time"
echo "  /tmp/wal_archive.conf - Configuração WAL archiving"
echo ""
echo "Para usar:"
echo "  1. Copie /tmp/wal_archive.conf para postgresql.conf e reinicie PostgreSQL"
echo "  2. Para PITR: ./restore_pitr.sh '2026-08-25 14:30:00'"