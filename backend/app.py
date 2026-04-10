"""
Equitee backend — Flask application entry point.

Supports two operation modes via the TENANCY_MODE environment variable:
  - 'single' (default): Self-hosted, SQLite, no authentication
  - 'saas': Multi-tenant, PostgreSQL, JWT auth, schema-per-tenant
"""

from flask import Flask
from flask_cors import CORS
import os

from config import Config
from utils.db import init_db, db_session

# Validate configuration before starting
Config.validate()

app = Flask(__name__)
CORS(app)

# ── Database initialization ─────────────────────────────────────
with app.app_context():
    if Config.TENANCY_MODE == 'saas':
        from utils.db import init_public_schema
        init_public_schema()
        print("✅ Public schema tables initialized!")
    else:
        init_db()

# ── Route registration ──────────────────────────────────────────
from routes import properties, expenses, income, tenants, events, misc, documents

properties.register_routes(app)
expenses.register_routes(app)
income.register_routes(app)
tenants.register_routes(app)
events.register_routes(app)
misc.register_routes(app)
documents.register_routes(app)

# Auth routes — only in SaaS mode
if Config.TENANCY_MODE == 'saas':
    from routes.auth import register_auth_routes
    register_auth_routes(app)
    print("✅ Auth routes registered (SaaS mode)")
else:
    print("✅ Running in self-hosted mode (no auth)")

# ── Session teardown ────────────────────────────────────────────
@app.teardown_appcontext
def shutdown_session(exception=None):
    """Clean up database sessions after each request."""
    db_session.remove()

    # In SaaS mode, also clean up tenant-scoped sessions
    from flask import g
    if hasattr(g, 'scoped_session'):
        g.scoped_session.remove()


if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=5000, debug=debug)
