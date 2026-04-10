"""
Configuration for Equitee — supports both single-tenant (self-hosted) and SaaS multi-tenant modes.

Mode is controlled via the TENANCY_MODE environment variable:
  - 'single' (default): Self-hosted, SQLite, no auth
  - 'saas': Multi-tenant, PostgreSQL, JWT auth, schema-per-tenant
"""

import os


class Config:
    # ── Required for both modes ──────────────────────────────────────
    TENANCY_MODE = os.environ.get('TENANCY_MODE', 'single')  # 'single' | 'saas'
    DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///real_estate.db')

    # ── SaaS mode only (ignored when TENANCY_MODE=single) ───────────
    JWT_SECRET = os.environ.get('JWT_SECRET', '')
    JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', '1'))
    JWT_REFRESH_EXPIRATION_DAYS = int(os.environ.get('JWT_REFRESH_EXPIRATION_DAYS', '30'))
    JWT_ALGORITHM = 'HS256'

    # Subscription tiers
    DEFAULT_PLAN = os.environ.get('DEFAULT_PLAN', 'free')
    MAX_PROPERTIES_PER_PLAN = {
        'free': 10,
        'pro': 100,
        'enterprise': None,  # unlimited
    }

    # ── Validation ───────────────────────────────────────────────────
    @classmethod
    def validate(cls):
        """Raise clear errors if required config is missing."""
        if cls.TENANCY_MODE == 'saas':
            if not cls.DATABASE_URL.startswith('postgresql'):
                raise ValueError(
                    f"SAAS mode requires a PostgreSQL database. "
                    f"Got DATABASE_URL={cls.DATABASE_URL!r}"
                )
            if not cls.JWT_SECRET:
                raise ValueError(
                    "SAAS mode requires JWT_SECRET to be set. "
                    "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
                )
        elif cls.TENANCY_MODE != 'single':
            raise ValueError(
                f"Invalid TENANCY_MODE={cls.TENANCY_MODE!r}. "
                f"Expected 'single' or 'saas'."
            )
