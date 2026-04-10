"""
Database configuration — dual-mode for self-hosted (SQLite) and SaaS (PostgreSQL).

Single mode (TENANCY_MODE=single):
  - Uses DATABASE_URL directly (default: sqlite:///real_estate.db)
  - No schema routing, no auth
  - db_session_scope() works exactly as before

SaaS mode (TENANCY_MODE=saas):
  - Uses PostgreSQL DATABASE_URL
  - get_tenant_session() returns a schema-scoped session via schema_translate_map
  - The tenant's schema name must be set on Flask's g object by @tenant_required middleware
"""

import os
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, scoped_session

# Resolve backend root for Alembic subprocess calls
BACKEND_ROOT = Path(__file__).resolve().parent.parent

# ── Configuration ─────────────────────────────────────────────
# Import here to avoid circular imports; fallback for tests that
# haven't adopted config.py yet.
try:
    from config import Config
    TENANCY_MODE = Config.TENANCY_MODE
    DATABASE_URL = Config.DATABASE_URL
except ImportError:
    TENANCY_MODE = os.environ.get('TENANCY_MODE', 'single')
    DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///real_estate.db')

# ── Engine ────────────────────────────────────────────────────
# SQLite needs check_same_thread=False; PostgreSQL does not.
_is_sqlite = DATABASE_URL.startswith('sqlite')

engine = create_engine(
    DATABASE_URL,
    connect_args={'check_same_thread': False} if _is_sqlite else {},
    pool_pre_ping=True,
    pool_recycle=300,
)


# ── Standard session (single mode / fallback) ─────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db_session = scoped_session(SessionLocal)


@contextmanager
def db_session_scope():
    """
    Provide a transactional scope around a series of operations.
    This is the ORIGINAL interface — preserved for backward compatibility.
    In single mode, routes can continue using this unchanged.
    In SaaS mode, prefer get_tenant_session() instead.
    """
    session = db_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session():
    """Get the standard database session (single mode)."""
    return db_session()


# ── Tenant-scoped session (SaaS mode) ─────────────────────────
def get_tenant_session():
    """
    Return a database session scoped to the current tenant's schema.

    Single mode: returns the standard db_session scoped_session proxy.
    SaaS mode: creates a connection with schema_translate_map pointing
               to the tenant's schema (set on Flask g by @tenant_required).

    Usage in routes:
        session = get_tenant_session()
        try:
            properties = session.query(Property).all()
            session.commit()  # Must commit explicitly
            return jsonify(...)
        except Exception:
            session.rollback()
            raise
        finally:
            session.remove()
    """
    if TENANCY_MODE == 'single':
        return db_session

    # SaaS mode — get schema from Flask g (set by @tenant_required)
    from flask import g

    if not hasattr(g, 'tenant_schema'):
        raise RuntimeError(
            "tenant_schema not set on Flask g. "
            "Ensure the @tenant_required decorator is applied to the route."
        )

    schema_name = g.tenant_schema

    # Create a connection with schema translation
    conn = engine.connect().execution_options(
        schema_translate_map={None: schema_name}
    )

    tenant_session_factory = sessionmaker(
        bind=conn,
        autocommit=False,
        autoflush=False,
    )

    session = scoped_session(tenant_session_factory)
    g.scoped_session = session  # So teardown can clean it up
    return session


@contextmanager
def tenant_session():
    """
    Context manager for tenant-scoped sessions with automatic commit/rollback.

    Use this instead of get_tenant_session() directly for cleaner route code:

        with tenant_session() as session:
            properties = session.query(Property).all()
            return jsonify([...])

    In single mode: uses the standard session with commit/rollback.
    In SaaS mode: uses the schema-scoped session with commit/rollback.
    """
    session = get_tenant_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.remove()


# ── Tenant schema management (SaaS mode) ──────────────────────
def create_tenant_schema(tenant_id):
    """
    Create a new PostgreSQL schema for a tenant and run all tenant migrations.

    Returns the schema name.
    """
    if TENANCY_MODE == 'single':
        raise RuntimeError("create_tenant_schema is only available in SaaS mode.")

    schema_name = f"tenant_{tenant_id}"

    # Create the schema
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_name}"))

    # Run Alembic migrations on the new schema
    _run_tenant_alembic(schema_name)

    return schema_name


def drop_tenant_schema(tenant_id):
    """
    Drop a tenant's schema and all its data (CASCADE).
    """
    if TENANCY_MODE == 'single':
        raise RuntimeError("drop_tenant_schema is only available in SaaS mode.")

    schema_name = f"tenant_{tenant_id}"

    with engine.begin() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE"))


def _run_tenant_alembic(schema_name):
    """
    Run alembic upgrade head on the tenant migration directory
    with TENANT_SCHEMA env var set.
    """
    migrations_dir = BACKEND_ROOT / 'migrations_tenant'
    if not migrations_dir.exists():
        raise RuntimeError(
            f"migrations_tenant directory not found at {migrations_dir}. "
            "Run 'alembic init migrations_tenant' to create it."
        )

    env = os.environ.copy()
    env['TENANT_SCHEMA'] = schema_name
    # Inherit DATABASE_URL and other env vars
    if Path('.env').exists():
        from dotenv import load_dotenv
        load_dotenv('.env', override=False)

    result = subprocess.run(
        [sys.executable, '-m', 'alembic', 'upgrade', 'head'],
        cwd=str(migrations_dir),
        env=env,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        # Rollback: drop the schema on failure
        try:
            drop_tenant_schema(schema_name.replace('tenant_', '', 1))
        except Exception:
            pass
        raise RuntimeError(
            f"Alembic migration failed for schema {schema_name}:\n{result.stderr}"
        )


# ── Public schema initialization (SaaS mode) ──────────────────
def init_public_schema():
    """
    Create public schema tables (tenants, users) if they don't exist.
    Only used in SaaS mode.
    """
    if TENANCY_MODE == 'single':
        return

    from models.public_schema import PublicBase
    PublicBase.metadata.create_all(bind=engine)


# ── Legacy helpers ─────────────────────────────────────────────
def init_db():
    """Initialize database schema."""
    from models.schema import Base
    Base.metadata.create_all(bind=engine)
    if TENANCY_MODE == 'single':
        print("✅ Database initialized successfully!")
    else:
        print("✅ PostgreSQL connection verified!")


class NotFoundError(Exception):
    """Raised when a requested resource doesn't exist."""
    pass


def require_exists(session, model, resource_id, label):
    """Raise NotFoundError if the row doesn't exist."""
    instance = session.get(model, resource_id)
    if not instance:
        raise NotFoundError(f'{label} not found')
    return instance


def row_to_dict(row):
    """Legacy compatibility — use model.to_dict() instead for new code."""
    return dict(row)
