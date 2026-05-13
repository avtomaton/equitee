"""
Equitee backend — Flask application entry point.

Supports two operation modes via the TENANCY_MODE environment variable:
  - 'single' (default): Self-hosted, SQLite, no authentication
  - 'saas': Multi-tenant, PostgreSQL, JWT auth, schema-per-tenant
"""

import logging
import os

import click
from flask import Flask
from flask_cors import CORS

from config import Config
from utils.db import init_db, db_session

logger = logging.getLogger(__name__)

# Validate configuration before starting
Config.validate()

app = Flask(__name__)
CORS(app)

# ── Rate limiter (SaaS mode) ───────────────────────────────────
limiter = None
if Config.TENANCY_MODE == 'saas':
    try:
        from flask_limiter import Limiter
        from flask_limiter.util import get_remote_address
        
        # Use Redis if REDIS_URL is set, otherwise fall back to in-memory
        redis_url = os.environ.get('REDIS_URL')
        storage_uri = redis_url if redis_url else "memory://"
        
        limiter = Limiter(
            app=app,
            key_func=get_remote_address,
            default_limits=["200 per day", "50 per hour"],
            storage_uri=storage_uri,
        )
        if redis_url:
            logger.info("Rate limiter using Redis")
    except ImportError:
        logger.warning("flask-limiter not installed — auth endpoints will run without rate limiting")

# ── Database initialization ─────────────────────────────────────
with app.app_context():
    if Config.TENANCY_MODE == 'saas':
        from utils.db import init_public_schema
        init_public_schema()
        logger.info("Public schema tables initialized!")
    else:
        init_db()

# ── Route registration ──────────────────────────────────────────
from routes import properties, expenses, income, tenants, events, misc, documents, groups

properties.register_routes(app)
expenses.register_routes(app)
income.register_routes(app)
tenants.register_routes(app)
events.register_routes(app)
misc.register_routes(app)
documents.register_routes(app)
groups.register_routes(app)

# Auth routes — only in SaaS mode
if Config.TENANCY_MODE == 'saas':
    from routes.auth import register_auth_routes
    from routes.admin import register_admin_routes
    from routes.tenancy import register_tenancy_routes
    register_auth_routes(app, limiter=limiter)
    register_admin_routes(app, limiter=limiter)
    register_tenancy_routes(app, limiter=limiter)
    logger.info("Auth + Admin + Tenancy routes registered (SaaS mode)")
else:
    logger.info("Running in self-hosted mode (no auth)")

# ── Session teardown ────────────────────────────────────────────
@app.teardown_appcontext
def shutdown_session(exception=None):
    """Clean up database sessions after each request."""
    db_session.remove()

    # In SaaS mode, also clean up tenant-scoped sessions
    from flask import g
    if hasattr(g, 'tenant_session'):
        g.tenant_session.close()


# ── CLI commands ────────────────────────────────────────────────
@app.cli.command('admin-promote')
@click.argument('email')
def admin_promote(email):
    """Promote a user to admin by email. Usage: flask admin-promote user@example.com"""
    from sqlalchemy import text
    from utils.db import engine

    email = email.lower().strip()
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE public.users SET is_admin = true WHERE email = :email RETURNING id, email"),
            {'email': email},
        ).fetchone()
        if result:
            logger.info("User %s (id=%s) is now an admin", result.email, result.id)
            print(f"✅ User {result.email} (id={result.id}) is now an admin")
        else:
            logger.warning("No user found with email: %s", email)
            print(f"❌ No user found with email: {email}")
            raise SystemExit(1)


if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=5000, debug=debug)
