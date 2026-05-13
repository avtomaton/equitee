"""
Configuration for Equitee — supports both single-tenant (self-hosted) and SaaS multi-tenant modes.

Mode is controlled via the TENANCY_MODE environment variable:
  - 'single' (default): Self-hosted, SQLite, no auth
  - 'saas': Multi-tenant, PostgreSQL, JWT auth, schema-per-tenant
"""

import os


class Config:
    _frozen = False

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

    # ── Google OAuth (SaaS mode only) ────────────────────────────────
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI = os.environ.get(
        'GOOGLE_REDIRECT_URI',
        'http://localhost:5173/auth/google/callback',
    )

    # ── Email / SMTP (SaaS mode only) ───────────────────────────────
    SMTP_HOST = os.environ.get('SMTP_HOST', '')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USER = os.environ.get('SMTP_USER', '')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
    SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
    MAIL_FROM = os.environ.get('MAIL_FROM', 'noreply@equitee.app')

    # Base URL used for building links in emails
    APP_BASE_URL = os.environ.get('APP_BASE_URL', 'http://localhost:5173')

    # Email verification token expiry (hours)
    EMAIL_VERIFICATION_EXPIRY_HOURS = int(
        os.environ.get('EMAIL_VERIFICATION_EXPIRY_HOURS', '24')
    )

    # ── Immutability guard ─────────────────────────────────────────
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls._frozen = True

    def __setattr__(cls, name, value):
        if cls._frozen and hasattr(cls, name):
            raise AttributeError(
                f"Config is frozen. Cannot reassign '{name}'. "
                f"Use environment variables or a test fixture instead."
            )
        super().__setattr__(name, value)

    @classmethod
    def _unfreeze(cls):
        """Temporarily unfreeze for testing. Use with caution."""
        cls._frozen = False

    @classmethod
    def _freeze(cls):
        """Re-freeze after test setup."""
        cls._frozen = True

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
