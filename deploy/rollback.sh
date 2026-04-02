#!/usr/bin/env bash
# =============================================================================
# rollback.sh — Roll back to a previous git commit
#
# Usage:
#   ./rollback.sh                   # roll back one commit
#   ./rollback.sh --commit abc1234  # roll back to a specific commit
#   ./rollback.sh --list            # show recent deployable commits
# =============================================================================

set -euo pipefail

APP_DIR="/opt/equitee"
APP_USER="equitee"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[rollback]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }

COMMIT="HEAD~1"

while [[ $# -gt 0 ]]; do
  case $1 in
    --commit) COMMIT="$2"; shift 2 ;;
    --list)
      echo "Recent commits:"
      sudo -u "$APP_USER" git -C "$APP_DIR" log --oneline -10
      exit 0
      ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

CURRENT=$(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --short HEAD)
TARGET=$(sudo -u "$APP_USER" git -C "$APP_DIR" rev-parse --short "$COMMIT")

warn "Rolling back from $CURRENT → $TARGET"
warn "This will rebuild the frontend. Continue? [y/N]"
read -r CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }

sudo -u "$APP_USER" git -C "$APP_DIR" checkout "$COMMIT"

info "Rebuilding frontend…"
sudo -u "$APP_USER" bash -c "cd $APP_DIR/frontend && npm ci --silent && npm run build"

info "Reinstalling backend dependencies…"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install -q \
  -r "$APP_DIR/backend/requirements.txt"

info "Restarting service…"
sudo systemctl reload-or-restart equitee
sudo nginx -t && sudo systemctl reload nginx

info "Rollback to $TARGET complete."
sudo systemctl status equitee --no-pager | tail -4
