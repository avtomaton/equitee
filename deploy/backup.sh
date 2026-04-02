#!/usr/bin/env bash
# =============================================================================
# backup.sh — Daily SQLite backup with 30-day retention
#
# Install as a cron job:
#   sudo crontab -e
#   0 3 * * * /opt/equitee/deploy/backup.sh >> /var/log/equitee/backup.log 2>&1
# =============================================================================

set -euo pipefail

DB_SOURCE="/var/lib/equitee/real_estate.db"
BACKUP_DIR="/var/backups/equitee"
KEEP_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/real_estate_$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

# Use SQLite's online backup API via the .backup command — safe while the app
# is running, no read locks that would block API requests.
if [[ ! -f "$DB_SOURCE" ]]; then
  echo "[backup] ERROR: database not found at $DB_SOURCE"
  exit 1
fi

sqlite3 "$DB_SOURCE" ".backup '$BACKUP_FILE'"
gzip "$BACKUP_FILE"

COMPRESSED="$BACKUP_FILE.gz"
SIZE=$(du -sh "$COMPRESSED" | cut -f1)
echo "[backup] $(date -Iseconds) — saved $COMPRESSED ($SIZE)"

# Prune old backups
find "$BACKUP_DIR" -name "real_estate_*.db.gz" -mtime "+$KEEP_DAYS" -delete
REMAINING=$(find "$BACKUP_DIR" -name "*.db.gz" | wc -l)
echo "[backup] $REMAINING backup(s) retained (${KEEP_DAYS}-day window)"
