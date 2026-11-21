#!/bin/bash
# Puzzle Inventory App: install or update on Ubuntu/Debian with systemd.
#
#   sudo bash install.sh
#
# Safe to re-run. Running it again from a newer copy of the code updates the
# app in place. It never touches data/ or uploads/ in the install folder.
#
# What it does:
#   1. Copies the code to /opt/puzzle-inventory (skipping data, photos, node_modules, .git)
#   2. Installs dependencies with npm
#   3. Installs the app service and a nightly backup timer
#   4. Restarts the app
#
# Manage it with:
#   sudo systemctl status puzzle-inventory
#   sudo systemctl restart puzzle-inventory
#   sudo journalctl -u puzzle-inventory -f
#   sudo systemctl start puzzle-inventory-backup     (run a backup now)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/puzzle-inventory}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puzzle-inventory}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REAL_USER="${SUDO_USER:-$(whoami)}"

if [ "$EUID" -ne 0 ]; then
    echo "Run this with sudo: sudo bash install.sh"
    exit 1
fi

if [ "$REAL_USER" = "root" ]; then
    echo "Warning: the app will run as root. Run with sudo from a normal user account to avoid this."
fi

# --- Find Node.js (works with system packages and nvm) ---
NODE_BIN="$(sudo -u "$REAL_USER" bash -lc 'command -v node' 2>/dev/null || true)"
[ -z "$NODE_BIN" ] && NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
    echo "Node.js not found. Install Node 18 or newer first, e.g.:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Node.js $("$NODE_BIN" -v) is too old. Version 18 or newer is required."
    exit 1
fi
NPM_BIN="$(dirname "$NODE_BIN")/npm"
[ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm)"

echo "============================================"
echo "  Puzzle Inventory: install / update"
echo "============================================"
echo "User:        $REAL_USER"
echo "App folder:  $APP_DIR"
echo "Backups:     $BACKUP_DIR"
echo "Node:        $NODE_BIN ($("$NODE_BIN" -v))"
echo ""

# --- 1. Copy code (never data or photos) ---
mkdir -p "$APP_DIR"
if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
    echo "-> Copying code to $APP_DIR"
    tar -C "$SCRIPT_DIR" \
        --exclude=./data --exclude=./uploads --exclude=./node_modules \
        --exclude=./.git --exclude=./screenshots --exclude='*.tmp' \
        -cf - . | tar -C "$APP_DIR" -xf -
fi
mkdir -p "$APP_DIR/data" "$APP_DIR/uploads/puzzles"
chown -R "$REAL_USER:$REAL_USER" "$APP_DIR"

# --- 2. Dependencies ---
echo "-> Installing dependencies"
cd "$APP_DIR"
if [ -f package-lock.json ]; then
    sudo -u "$REAL_USER" "$NPM_BIN" ci --omit=dev --no-audit --no-fund
else
    sudo -u "$REAL_USER" "$NPM_BIN" install --omit=dev --no-audit --no-fund
fi

# --- 3. systemd units ---
echo "-> Installing services"
fill() {
    sed -e "s|__USER__|$REAL_USER|g" \
        -e "s|__APP_DIR__|$APP_DIR|g" \
        -e "s|__NODE__|$NODE_BIN|g" \
        -e "s|__BACKUP_DIR__|$BACKUP_DIR|g" "$1"
}
fill deploy/puzzle-inventory.service        > /etc/systemd/system/puzzle-inventory.service
fill deploy/puzzle-inventory-backup.service > /etc/systemd/system/puzzle-inventory-backup.service
cp deploy/puzzle-inventory-backup.timer       /etc/systemd/system/puzzle-inventory-backup.timer

mkdir -p "$BACKUP_DIR"
chown "$REAL_USER:$REAL_USER" "$BACKUP_DIR"

systemctl daemon-reload
systemctl enable --quiet puzzle-inventory puzzle-inventory-backup.timer
systemctl start puzzle-inventory-backup.timer

# --- 4. (Re)start ---
echo "-> Restarting app"
systemctl restart puzzle-inventory
sleep 2

echo ""
echo "============================================"
if systemctl is-active --quiet puzzle-inventory; then
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    echo "  Puzzle Inventory is running"
    echo "  Open http://${IP:-localhost}:3000"
    echo "  Nightly backups go to $BACKUP_DIR"
else
    echo "  The service failed to start. Recent logs:"
    echo "============================================"
    journalctl -u puzzle-inventory --no-pager -n 20
    exit 1
fi
echo "============================================"
