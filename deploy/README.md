# Equitee — Production Deployment Guide

## Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | React + Vite → static files       |
| API         | Flask via Gunicorn (3 workers)    |
| Web server  | Nginx (reverse proxy + static)    |
| Database    | SQLite (file at `/var/lib/equitee/real_estate.db`) |
| Process mgmt| systemd                           |
| TLS         | Let's Encrypt via Certbot         |
| CI/CD       | GitHub Actions → SSH deploy       |

---

## First-time server setup

### 1. Edit `setup-server.sh`

Open the file and set the three variables at the top:

```bash
REPO_URL="https://github.com/avtomaton/equitee.git"
DOMAIN="equitee.ca"
EMAIL="avtomaton@gmail.com"       # required for Let's Encrypt
```

If you're using a private repo, configure SSH deploy keys or a GitHub personal
access token before running. For HTTPS URL auth, use a credential helper or
embed the token: `https://TOKEN@github.com/user/repo.git`.

### 2. Copy scripts to the server

```bash
scp deploy/*.sh you@your-server:~/
ssh you@your-server
chmod +x *.sh
```

### 3. Run setup

```bash
./setup-server.sh
```

This takes about 2–5 minutes. At the end it prints the URL.

### 4. Point your domain (if using one)

Before running setup, or before Certbot runs, add an A record:
```
equitee.ca  →  YOUR_SERVER_IP
```

Certbot needs the domain to resolve to the server to issue a certificate.

---

## Deploying updates

### Manual deploy (from your laptop)

```bash
# Edit SERVER_HOST and SERVER_USER at the top of deploy.sh first
./deploy.sh
./deploy.sh --branch feature-branch   # deploy a non-main branch
```

### Manual deploy (on the server)

```bash
./deploy.sh --local
```

### Automatic via GitHub Actions

1. Push `deploy.yml` to `.github/workflows/deploy.yml` in your repo.
2. Add these secrets in GitHub → Settings → Secrets → Actions:

| Secret            | Value                                      |
|-------------------|--------------------------------------------|
| `SSH_HOST`        | Your server IP or hostname                 |
| `SSH_USER`        | Your admin user (e.g. `ubuntu`)            |
| `SSH_PRIVATE_KEY` | Contents of your private key (`~/.ssh/id_ed25519`) |
| `SSH_PORT`        | `22` (or your custom port)                 |

Every push to `main` now automatically deploys. PRs only run the build check.

---

## Backups

Install the cron job once on the server:

```bash
sudo crontab -e
```

Add this line (runs at 3 AM daily):

```
0 3 * * * /opt/equitee/deploy/backup.sh >> /var/log/equitee/backup.log 2>&1
```

Backups are gzip-compressed SQLite snapshots stored in `/var/backups/equitee/`,
kept for 30 days.

### Restore a backup

```bash
# List available backups
ls /var/backups/equitee/

# Stop the service, restore, restart
sudo systemctl stop equitee
sudo cp /var/lib/equitee/real_estate.db /var/lib/equitee/real_estate.db.bak
sudo gunzip -c /var/backups/equitee/real_estate_20250101_030000.db.gz \
  | sudo tee /var/lib/equitee/real_estate.db > /dev/null
sudo systemctl start equitee
```

---

## Emergency rollback

```bash
# Show recent commits
./rollback.sh --list

# Roll back one commit
./rollback.sh

# Roll back to a specific commit
./rollback.sh --commit abc1234
```

---

## Useful commands

```bash
# Service status
sudo systemctl status equitee

# Live API logs
sudo journalctl -u equitee -f

# Nginx access/error logs
sudo tail -f /var/log/equitee/access.log
sudo tail -f /var/log/equitee/error.log
sudo tail -f /var/log/nginx/error.log

# Restart after config change
sudo systemctl restart equitee
sudo nginx -t && sudo systemctl reload nginx

# Renew TLS certificate (auto-renewed by certbot timer, but manual if needed)
sudo certbot renew --dry-run
```

---

## File layout on the server

```
/opt/equitee/           — app code (git repo, owned by equitee user)
  backend/
    app.py
    real_estate.db      → symlink to /var/lib/equitee/real_estate.db
    venv/
  frontend/
    dist/               — built static files served by Nginx
    src/

/var/lib/equitee/       — persistent data (survives redeploys)
  real_estate.db

/var/backups/equitee/   — daily SQLite backups
/var/log/equitee/       — gunicorn access + error logs
```

---

## Security notes

- The app runs as a locked-down `equitee` system user with no login shell.
- Gunicorn binds to `127.0.0.1:5000` only — never exposed to the internet.
- Nginx handles all public traffic on ports 80/443.
- UFW only allows SSH, HTTP, and HTTPS.
- TLS is configured by Certbot with auto-renewal via a systemd timer.
- The SQLite database lives outside the deploy directory so it's never
  accidentally overwritten during a git reset.

---

## Scaling notes (when we outgrow SQLite)

When I need to handle multiple concurrent writers or want to run multiple
app instances, the migration path is:

1. Replace SQLite with PostgreSQL — Flask/SQLAlchemy migration is straightforward.
2. Add more Gunicorn workers (edit `/etc/systemd/system/equitee.service`).
3. Put Nginx upstream block in front of multiple gunicorn instances.
4. For the frontend, a CDN (Cloudflare, etc.) in front of the static files gives near-zero latency globally at no extra server cost.
