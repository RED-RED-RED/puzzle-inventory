#!/bin/bash
# Puzzle Inventory App: install or update on Ubuntu/Debian with systemd.
# Works on a normal server, a VM, or a Proxmox container (CT).
#
#   sudo bash install.sh            (or just "bash install.sh" when logged in as root)
#
# Safe to re-run. Running it again from a newer copy of the code updates the
# app in place. It never touches data/ or uploads/ in the install folder.
#
# What it does:
#   1. Creates a "puzzle" system user to run the app (not root)
#   2. Copies the code to /opt/puzzle-inventory (skipping data, photos, node_modules, .git)
#   3. Installs dependencies with npm
#   4. Installs the app service and a nightly backup timer
#   5. Restarts the app and checks that it answers
#
# Options (set before the command, e.g. "sudo PORT=8080 bash install.sh"):
#   PORT=3000                              port the app listens on
#   BACKUP_DIR=/var/backups/puzzle-inventory   where nightly backups go (a NAS mount is ideal)
#   APP_DIR=/opt/puzzle-inventory          install folder
#   APP_USER=puzzle                        user the app runs as
#
# Manage it with:
#   sudo systemctl status puzzle-inventory
#   sudo systemctl restart puzzle-inventory
#   sudo journalctl -u puzzle-inventory -f
#   sudo systemctl start puzzle-inventory-backup     (run a backup now)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/puzzle-inventory}"
APP_USER="${APP_USER:-puzzle}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puzzle-inventory}"
PORT="${PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE=/etc/systemd/system/puzzle-inventory.service

if [ "$EUID" -ne 0 ]; then
    echo "Run this as root: sudo bash install.sh"
    exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "PORT must be a number between 1 and 65535 (got '$PORT')"
    exit 1
fi

# --- Find Node.js ---
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
    echo "Node.js not found. Install Node 22 first:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
    exit 1
fi
NODE_BIN="$(readlink -f "$NODE_BIN")"
case "$NODE_BIN" in
    /home/*|/root/*)
        echo "Node.js is installed inside a home folder ($NODE_BIN), probably by nvm."
        echo "The app runs as its own '$APP_USER' user, which cannot read that folder."
        echo "Install a system-wide Node instead:"
        echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
        exit 1
        ;;
esac
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "Node.js $("$NODE_BIN" -v) is too old. Version 20 or newer is required (22 recommended)."
    exit 1
fi
NPM_BIN="$(dirname "$NODE_BIN")/npm"
[ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm)"

IN_CONTAINER=no
if command -v systemd-detect-virt >/dev/null && systemd-detect-virt --container --quiet; then
    IN_CONTAINER=yes
fi

echo "============================================"
echo "  Puzzle Inventory: install / update"
echo "============================================"
echo "Runs as:     $APP_USER"
echo "App folder:  $APP_DIR"
echo "Port:        $PORT"
echo "Backups:     $BACKUP_DIR"
echo "Node:        $NODE_BIN ($("$NODE_BIN" -v))"
echo "Container:   $IN_CONTAINER"
echo ""

# --- 1. Service user ---
if ! id "$APP_USER" >/dev/null 2>&1; then
    echo "-> Creating system user '$APP_USER'"
    useradd --system --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# --- 2. Copy code (never data or photos) ---
mkdir -p "$APP_DIR"
if [ "$SCRIPT_DIR" != "$APP_DIR" ]; then
    echo "-> Copying code to $APP_DIR"
    tar -C "$SCRIPT_DIR" \
        --exclude=./data --exclude=./uploads --exclude=./node_modules \
        --exclude=./.git --exclude=./.github --exclude=./tests --exclude=./screenshots \
        --exclude=./test-results --exclude=./playwright-report --exclude='*.tmp' \
        -cf - . | tar -C "$APP_DIR" --no-same-owner -xf -
fi
mkdir -p "$APP_DIR/data" "$APP_DIR/uploads/puzzles"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# --- 3. Dependencies (installed as the app user, npm cache kept out of the app folder) ---
echo "-> Installing dependencies"
NPM_CACHE="$(mktemp -d)"
chown "$APP_USER:$APP_USER" "$NPM_CACHE"
NPM_CMD=ci
[ -f "$APP_DIR/package-lock.json" ] || NPM_CMD=install
cd "$APP_DIR"   # the app user may not be able to read the folder this was started from
runuser -u "$APP_USER" -- env HOME="$NPM_CACHE" PATH="$(dirname "$NODE_BIN"):$PATH" \
    "$NPM_BIN" --prefix "$APP_DIR" "$NPM_CMD" --omit=dev --no-audit --no-fund --cache "$NPM_CACHE"
rm -rf "$NPM_CACHE"

# --- 4. systemd units ---
echo "-> Installing services"
fill() {
    sed -e "s|__USER__|$APP_USER|g" \
        -e "s|__APP_DIR__|$APP_DIR|g" \
        -e "s|__NODE__|$NODE_BIN|g" \
        -e "s|__PORT__|$PORT|g" \
        -e "s|__BACKUP_DIR__|$BACKUP_DIR|g" "$1"
}
fill "$APP_DIR/deploy/puzzle-inventory.service"        > "$SERVICE"
fill "$APP_DIR/deploy/puzzle-inventory-backup.service" > /etc/systemd/system/puzzle-inventory-backup.service
cp "$APP_DIR/deploy/puzzle-inventory-backup.timer"      /etc/systemd/system/puzzle-inventory-backup.timer

mkdir -p "$BACKUP_DIR"
# A NAS share may not allow chown (NFS root_squash, CIFS); the backup job only needs write access
if ! chown "$APP_USER:$APP_USER" "$BACKUP_DIR" 2>/dev/null; then
    echo "   Note: could not change the owner of $BACKUP_DIR (normal for some network shares)."
fi
if ! runuser -u "$APP_USER" -- test -w "$BACKUP_DIR"; then
    echo "   WARNING: the '$APP_USER' user cannot write to $BACKUP_DIR, so nightly backups will fail."
    echo "   Fix the share's permissions or mount options, then run: sudo systemctl start puzzle-inventory-backup"
fi

systemctl daemon-reload
systemctl enable --quiet puzzle-inventory puzzle-inventory-backup.timer
systemctl restart puzzle-inventory-backup.timer

# --- 5. (Re)start and check ---
health_ok() {
    "$NODE_BIN" -e "fetch('http://127.0.0.1:$PORT/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
}
wait_healthy() {
    for _ in $(seq 1 15); do
        health_ok && return 0
        systemctl is-failed --quiet puzzle-inventory && return 1
        sleep 1
    done
    return 1
}

echo "-> Starting app"
systemctl restart puzzle-inventory
if ! wait_healthy; then
    # Unprivileged Proxmox containers without "nesting" cannot apply systemd's
    # sandboxing options (exit status 226/NAMESPACE). The container is already
    # isolated, so drop those options and try again.
    STATUS="$(systemctl show -p ExecMainStatus --value puzzle-inventory || true)"
    if [ "$IN_CONTAINER" = yes ] && [ "$STATUS" = "226" ]; then
        echo "-> This container does not allow systemd sandboxing (nesting is off); continuing without it"
        sed -i -e '/^PrivateTmp=/d' -e '/^ProtectSystem=/d' "$SERVICE"
        systemctl daemon-reload
        systemctl restart puzzle-inventory
    fi
fi

echo ""
echo "============================================"
if wait_healthy; then
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    echo "  Puzzle Inventory $("$NODE_BIN" -p "require('$APP_DIR/package.json').version") is running"
    echo "  Open http://${IP:-localhost}:$PORT"
    echo "  Nightly backups go to $BACKUP_DIR"
    echo "============================================"
else
    echo "  The app did not start. Recent logs:"
    echo "============================================"
    journalctl -u puzzle-inventory --no-pager -n 25
    exit 1
fi
