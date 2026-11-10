#!/bin/sh
set -e

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
BACKUP_DIR="$DATA_DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d)
# Use SQLite's online backup API rather than `cp`, which is unsafe if the
# app happens to be mid-write when the backup runs.
sqlite3 "$DATA_DIR/app.db" ".backup '$BACKUP_DIR/app-$TIMESTAMP.db'"

# Copy photos that are not in the backup yet. Nothing is ever removed from
# the backup copy, so a photo deleted on the site can still be recovered.
if [ -d "$DATA_DIR/photos" ]; then
  mkdir -p "$BACKUP_DIR/photos"
  # A plain loop rather than `cp -n`: some coreutils versions make `cp -n`
  # exit non-zero when it skips a file, which would abort this script.
  for photo in "$DATA_DIR/photos"/*; do
    [ -f "$photo" ] || continue
    target="$BACKUP_DIR/photos/$(basename "$photo")"
    [ -e "$target" ] || cp "$photo" "$target"
  done
fi

find "$BACKUP_DIR" -name 'app-*.db' -mtime +14 -delete
