#!/bin/sh
set -e

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
BACKUP_DIR="$DATA_DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d)
# Use SQLite's online backup API rather than `cp`, which is unsafe if the
# app happens to be mid-write when the backup runs.
sqlite3 "$DATA_DIR/app.db" ".backup '$BACKUP_DIR/app-$TIMESTAMP.db'"

find "$BACKUP_DIR" -name 'app-*.db' -mtime +14 -delete
