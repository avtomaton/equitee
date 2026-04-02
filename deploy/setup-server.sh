#!/usr/bin/env bash
# =============================================================================
# setup-server.sh — One-time server provisioning for Equitee
#
# Run as your admin user (with sudo), NOT as root.
#   chmod +x setup-server.sh && ./setup-server.sh
#
# What this does:
#   1. Installs system packages (Python, Node, Nginx, Certbot)
#   2. Creates a dedicated 'equitee' system user
#   3. Clones the repo and builds the frontend
#   4. Creates the Python virtualenv and installs deps
#   5. Installs systemd service for gunicorn
#   6. Configures Nginx as reverse proxy
#   7. Obtains a Let's Encrypt TLS certificate (if domain provided)
# =============================================================================

set -euo pipefail

# ── Configuration — edit before running ──────────────────────────────────────
REPO_URL="https://github.com/avtomaton/equitee.git"   # your repo URL
DOMAIN=""           # e.g. "equitee.example.com" — leave blank to skip HTTPS
EMAIL=""            # your email for Let's Encrypt (required if DOMAIN is set)
APP_USER="equitee"  # system user that runs the app
APP_DIR="/opt/equitee"
DATA_DIR="/var/lib/equitee"   # database lives here (survives deploys)
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] && die "Do not run as root. Use a sudo-enabled user."
[[ "$REPO_URL" == *"YOUR_USERNAME"* ]] && die "Set REPO_URL at the top of this script first."

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating system packages…"
sudo apt-get update -qq
sudo apt-get install -y -qq \
  python3 python3-pip python3-venv \
  nodejs npm \
  nginx \
  certbot python3-certbot-nginx \
  git curl ufw

# Ensure Node ≥ 18 (Vite 6 requires it)
NODE_VER=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
if [[ $NODE_VER -lt 18 ]]; then
  info "Upgrading Node.js to LTS…"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Ensure gunicorn is available system-wide (used by the venv too)
pip3 install --quiet gunicorn 2>/dev/null || true

# ── 2. System user ────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "Creating system user '$APP_USER'…"
  sudo useradd --system --shell /usr/sbin/nologin --home "$APP_DIR" "$APP_USER"
fi

# ── 3. Data directory (survives redeploys) ────────────────────────────────────
info "Creating data directory at $DATA_DIR…"
sudo mkdir -p "$DATA_DIR"
sudo chown "$APP_USER:$APP_USER" "$DATA_DIR"
sudo chmod 750 "$DATA_DIR"

# ── 4. Clone repo ─────────────────────────────────────────────────────────────
info "Cloning repository…"
sudo rm -rf "$APP_DIR"
sudo git clone "$REPO_URL" "$APP_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 5. Backend: virtualenv ────────────────────────────────────────────────────
info "Creating Python virtualenv…"
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/venv"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --quiet gunicorn

# ── 6. Frontend: build ────────────────────────────────────────────────────────
info "Building frontend…"
sudo -u "$APP_USER" bash -c "cd $APP_DIR/frontend && npm ci --silent && npm run build"

# ── 7. Symlink database to data dir ──────────────────────────────────────────
info "Setting up database symlink…"
DB_PATH="$DATA_DIR/real_estate.db"
DB_LINK="$APP_DIR/backend/real_estate.db"
# Initialise DB if first run
if [[ ! -f "$DB_PATH" ]]; then
  sudo -u "$APP_USER" bash -c "
    cd $APP_DIR/backend
    $APP_DIR/venv/bin/python -c 'from app import init_db; init_db()'
  "
  # Move the created db to the data dir
  [[ -f "$DB_LINK" ]] && sudo mv "$DB_LINK" "$DB_PATH"
fi
sudo -u "$APP_USER" ln -sfn "$DB_PATH" "$DB_LINK"

# ── 8. Systemd service ────────────────────────────────────────────────────────
info "Installing systemd service…"
sudo tee /etc/systemd/system/equitee.service > /dev/null << SERVICE
[Unit]
Description=Equitee — Real Estate Portfolio API
After=network.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$APP_DIR/venv/bin"
# 3 workers; for a single-user app this is plenty.
# Increase to (2 × CPU cores + 1) if you expect concurrent users.
ExecStart=$APP_DIR/venv/bin/gunicorn \\
    --workers 3 \\
    --bind 127.0.0.1:5000 \\
    --timeout 120 \\
    --access-logfile /var/log/equitee/access.log \\
    --error-logfile  /var/log/equitee/error.log \\
    app:app
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

sudo mkdir -p /var/log/equitee
sudo chown "$APP_USER:$APP_USER" /var/log/equitee

sudo systemctl daemon-reload
sudo systemctl enable equitee
sudo systemctl restart equitee

# ── 9. Nginx config ───────────────────────────────────────────────────────────
info "Configuring Nginx…"
NGINX_CONF="/etc/nginx/sites-available/equitee"

if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="$DOMAIN www.$DOMAIN"
else
  SERVER_NAME="_"   # catch-all (access via IP)
fi

sudo tee "$NGINX_CONF" > /dev/null << NGINX
server {
    listen 80;
    server_name $SERVER_NAME;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Static frontend (Vite build output)
    root $APP_DIR/frontend/dist;
    index index.html;

    # API → gunicorn
    location /api/ {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        # File uploads (import/export)
        client_max_body_size 50M;
    }

    # SPA fallback — all other routes serve index.html
    location / {
        try_files \$uri \$uri/ /index.html;
        # Cache immutable hashed assets aggressively
        location ~* \\.(?:js|css|woff2?|png|svg|ico)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Block hidden files
    location ~ /\\. { deny all; }
}
NGINX

sudo ln -sfn "$NGINX_CONF" /etc/nginx/sites-enabled/equitee
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 10. HTTPS (optional) ──────────────────────────────────────────────────────
if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
  info "Obtaining Let's Encrypt certificate for $DOMAIN…"
  sudo certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN,www.$DOMAIN" \
    --redirect
fi

# ── 11. Firewall ──────────────────────────────────────────────────────────────
info "Configuring UFW firewall…"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "Setup complete!"
if [[ -n "$DOMAIN" ]]; then
  echo -e "  App:  ${GREEN}https://$DOMAIN${NC}"
else
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
  echo -e "  App:  ${GREEN}http://$SERVER_IP${NC}"
fi
echo ""
echo "  To deploy updates: ./deploy.sh"
echo "  Logs:              sudo journalctl -u equitee -f"
echo "  Service status:    sudo systemctl status equitee"
