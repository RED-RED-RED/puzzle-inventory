#!/bin/bash
# Puzzle Inventory App — Linux install script
# Run as root: sudo bash install.sh
#
# This does four things:
#   1. Copies the app to /opt/puzzle-inventory
#   2. Runs npm install
#   3. Installs and enables the systemd service
#   4. Starts it immediately
#
# After this, the app survives reboots and restarts itself if it crashes.
# Manage it with:
#   sudo systemctl status puzzle-inventory   — check if running
#   sudo systemctl stop puzzle-inventory     — stop
#   sudo systemctl start puzzle-inventory    — start
#   sudo journalctl -u puzzle-inventory      — view logs

set -e

APP_DIR="/opt/puzzle-inventory"
SERVICE_FILE="/etc/systemd/system/puzzle-inventory.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Figure out who actually called sudo ---
REAL_USER="${SUDO_USER:-$USER}"

if [ "$EUID" -ne 0 ]; then
    echo "This script must be run as root. Use: sudo bash install.sh"
    exit 1
fi

echo "============================================"
echo "  Puzzle Inventory App — Install"
echo "============================================"
echo ""
echo "Installing as user: $REAL_USER"
echo "App directory:      $APP_DIR"
echo ""

# 1. Copy app files
echo "→ Copying app files to $APP_DIR..."
sudo mkdir -p "$APP_DIR"
# Copy everything except node_modules and the install script itself
sudo cp -r "$SCRIPT_DIR"/* "$APP_DIR/" 2>/dev/null || true
sudo cp -r "$SCRIPT_DIR"/.[!.]* "$APP_DIR/" 2>/dev/null || true
sudo rm -rf "$APP_DIR/node_modules"
sudo chown -R "$REAL_USER:$REAL_USER" "$APP_DIR"

# 2. Install dependencies
echo "→ Running npm install..."
cd "$APP_DIR"
sudo -u "$REAL_USER" npm install --production
echo ""

# 3. Install systemd service
echo "→ Installing systemd service..."
# Patch the service file with the correct user and path
sed "s|User=your_username|User=$REAL_USER|g; s|Group=your_username|Group=$REAL_USER|g; s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|g" \
    "$APP_DIR/puzzle-inventory.service" > "$SERVICE_FILE"
sudo systemctl daemon-reload
sudo systemctl enable puzzle-inventory
echo ""

# 4. Start it
echo "→ Starting service..."
sudo systemctl start puzzle-inventory
sleep 2

# --- Final status ---
echo ""
echo "============================================"
if sudo systemctl is-active --quiet puzzle-inventory; then
    echo "  ✓ Puzzle Inventory is running!"
    echo ""
    echo "  Open http://localhost:3000 in a browser."
    echo "============================================"
else
    echo "  ✗ Service failed to start."
    echo "============================================"
    echo ""
    echo "  Check the logs with:"
    echo "    sudo journalctl -u puzzle-inventory --no-pager -n 20"
fi
