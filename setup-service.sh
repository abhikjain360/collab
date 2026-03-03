#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUN_PATH="$(which bun)"

echo "Project directory: $PROJECT_DIR"
echo "Bun binary: $BUN_PATH"

sudo tee /etc/systemd/system/collab.service > /dev/null <<EOF
[Unit]
Description=Collab Server
After=network.target

[Service]
Type=simple
User=abhik
WorkingDirectory=$PROJECT_DIR/server
EnvironmentFile=$PROJECT_DIR/server/.env.production
ExecStart=$PROJECT_DIR/dist/server/server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo setcap 'cap_net_bind_service=+ep' "$PROJECT_DIR/dist/server/server"
sudo systemctl daemon-reload
sudo systemctl enable collab
sudo systemctl restart collab

echo "Service started. Check status with: sudo systemctl status collab"
echo "View logs with: sudo journalctl -u collab -f"
