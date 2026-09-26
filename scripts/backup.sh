#!/bin/sh
set -e

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
BACKUP_DIR="$DATA_DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d)
cp "$DATA_DIR/app.db" "$BACKUP_DIR/app-$TIMESTAMP.db"

find "$BACKUP_DIR" -name 'app-*.db' -mtime +14 -delete
