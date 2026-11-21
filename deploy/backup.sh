#!/bin/bash
# Archives the data/ and uploads/ folders (all puzzle data AND photos) into a
# dated .tar.gz and keeps the newest $KEEP archives.
#
# Run by the puzzle-inventory-backup systemd timer every night. Run it by
# hand any time with:  sudo systemctl start puzzle-inventory-backup
#
# To restore: stop the service, extract an archive into the app folder, start.
#   sudo systemctl stop puzzle-inventory
#   sudo tar -xzf /var/backups/puzzle-inventory/puzzle-inventory-<date>.tar.gz -C /opt/puzzle-inventory
#   sudo systemctl start puzzle-inventory

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/puzzle-inventory}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puzzle-inventory}"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/puzzle-inventory-$(date +%Y-%m-%d_%H%M%S).tar.gz"

# Write to a .partial file first so an interrupted run never looks like a good backup
tar -czf "$OUT.partial" --exclude='*.tmp' -C "$APP_DIR" data uploads
mv "$OUT.partial" "$OUT"

# Prune old archives
ls -1t "$BACKUP_DIR"/puzzle-inventory-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm --

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
