#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Zero-downtime update deploy for Equitee
#
# Run from any machine that has SSH access to the server, or run directly
# on the server itself. Both work.
#
# Usage:
#   ./deploy.sh                   # deploy latest main branch
#   ./deploy.sh --branch feature  # deploy a specific branch
#   ./deploy.sh --local           # run directly on the server (no SSH)
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SERVER_HOST="equitee.ca"   # set if running locally via SSH
SERVER_USER="your-ssh-user"                # your admin user on the server
APP_USER="equitee"
APP_DIR="/opt/equitee"
BRANCH="main"
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

LOCAL=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --branch) BRANCH="$2"; shift 2 ;;
    --local)  LOCAL=true;  shift   ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# If not running locally, SSH into the server and run this script there
if [[ "$LOCAL" == "false" ]]; then
  info "Deploying to $SERVER_HOST (branch: $BRANCH)…"
  ssh "$SERVER_USER@$SERVER_HOST" "bash -s" << REMOTE
    set -euo pipefail
    cd $APP_DIR

    echo "[deploy] Pulling latest code (branch: $BRANCH)…"
    sudo -u $APP_USER git fetch origin
    sudo -u $APP_USER git checkout $BRANCH
    sudo -u $APP_USER git pull origin $BRANCH

    echo "[deploy] Installing backend dependencies…"
    sudo -u $APP_USER $APP_DIR/venv/bin/pip install -q \
      -r $APP_DIR/backend/requirements.txt

    echo "[deploy] Building frontend…"
    sudo -u $APP_USER bash -c "cd $APP_DIR/frontend && npm ci --silent && npm run build"

    echo "[deploy] Restarting service (zero-downtime via gunicorn reload)…"
    sudo systemctl reload-or-restart equitee

    echo "[deploy] Reloading nginx (picks up any new static assets)…"
    sudo nginx -t && sudo systemctl reload nginx

    echo "[deploy] Done."
REMOTE
  info "Deploy complete. App is live."
  exit 0
fi

# ── Local deploy (running directly on the server) ────────────────────────────
info "Local deploy — branch: $BRANCH"

cd "$APP_DIR"

info "Pulling latest code…"
sudo -u "$APP_USER" git fetch origin
sudo -u "$APP_USER" git checkout "$BRANCH"
sudo -u "$APP_USER" git pull origin "$BRANCH"

info "Installing backend dependencies…"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install -q \
  -r "$APP_DIR/backend/requirements.txt"

info "Building frontend…"
sudo -u "$APP_USER" bash -c "cd $APP_DIR/frontend && npm ci --silent && npm run build"

info "Restarting gunicorn (zero-downtime)…"
# `reload-or-restart` sends SIGHUP to gunicorn which gracefully replaces workers
# one by one — in-flight requests complete before workers are replaced.
sudo systemctl reload-or-restart equitee

info "Reloading nginx…"
sudo nginx -t && sudo systemctl reload nginx

info "Deploy complete."
sudo systemctl status equitee --no-pager -l | tail -5
