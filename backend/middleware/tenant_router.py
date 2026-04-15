"""
Tenant routing middleware.

Provides the @tenant_required decorator that:
  - Single mode: No-op passthrough (sets g.tenant_schema='public')
  - SaaS mode: Validates JWT, looks up tenant schema, sets g.tenant_schema

All route handlers that need tenant awareness should use this decorator.
"""

import logging
from functools import wraps

import jwt
from flask import request, jsonify, g
from sqlalchemy import text

from config import Config
from utils.db import engine

logger = logging.getLogger(__name__)

# ── Shared SQL for tenant + user lookup ─────────────────────────
_TENANT_USER_QUERY = text("""
    SELECT
        t.id AS tenant_id,
        t.schema_name,
        t.plan,
        t.is_active,
        u.id AS user_id,
        u.email,
        u.role,
        u.is_active AS user_active
    FROM public.tenants t
    JOIN public.users u ON u.tenant_id = t.id
    WHERE t.id = :tenant_id
      AND u.id = :user_id
""")


def _lookup_tenant_user(tenant_id, user_id):
    """
    Look up tenant and user from the public database.

    Returns the result row or None.
    """
    with engine.connect() as conn:
        result = conn.execute(
            _TENANT_USER_QUERY,
            {'tenant_id': tenant_id, 'user_id': user_id},
        )
        return result.fetchone()


def _set_user_context(row):
    """Set g.tenant_schema and g.current_user from a database row."""
    g.tenant_schema = row.schema_name
    g.current_user = {
        'id': row.user_id,
        'email': row.email,
        'role': row.role,
        'tenant_id': row.tenant_id,
        'plan': row.plan,
    }


def tenant_required(f):
    """
    Decorator that ensures the request has valid tenant context.

    Single mode (TENANCY_MODE=single):
        Sets g.tenant_schema='public' and g.current_user=None.
        No authentication required.

    SaaS mode (TENANCY_MODE=saas):
        Validates the JWT from the Authorization header.
        Looks up the tenant schema from the public database.
        Sets g.tenant_schema and g.current_user.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if Config.TENANCY_MODE == 'single':
            # Self-hosted: no auth, use public schema
            g.tenant_schema = 'public'
            g.current_user = None
            return f(*args, **kwargs)

        # ── SaaS mode: require JWT ─────────────────────────────
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid authorization header'}), 401

        token = auth_header.split(' ', 1)[1]

        # Check token blacklist (e.g. after logout)
        from services.auth_service import AuthService
        if AuthService.is_token_blacklisted(token):
            return jsonify({'error': 'Token has been revoked'}), 401

        try:
            payload = jwt.decode(
                token,
                Config.JWT_SECRET,
                algorithms=[Config.JWT_ALGORITHM],
            )
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        # Look up tenant schema and user from public database
        try:
            row = _lookup_tenant_user(payload['tenant_id'], payload['user_id'])

            if not row:
                return jsonify({'error': 'User or tenant not found'}), 403

            if not row.is_active:
                return jsonify({'error': 'Tenant account is inactive'}), 403

            if not row.user_active:
                return jsonify({'error': 'User account is inactive'}), 403

            _set_user_context(row)

        except Exception:
            logger.exception("Tenant resolution failed")
            return jsonify({'error': 'Internal server error'}), 500

        return f(*args, **kwargs)

    return decorated


def optional_tenant_auth(f):
    """
    Decorator that optionally authenticates a request.
    Unlike @tenant_required, this does NOT reject unauthenticated requests.
    Useful for public endpoints that can optionally show more data to logged-in users.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if Config.TENANCY_MODE == 'single':
            g.tenant_schema = 'public'
            g.current_user = None
            return f(*args, **kwargs)

        # SaaS mode: try to authenticate, but don't fail if no token
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
            try:
                # Reject blacklisted tokens silently (e.g. after logout)
                from services.auth_service import AuthService
                if AuthService.is_token_blacklisted(token):
                    raise jwt.InvalidTokenError("Token revoked")

                payload = jwt.decode(
                    token,
                    Config.JWT_SECRET,
                    algorithms=[Config.JWT_ALGORITHM],
                )

                row = _lookup_tenant_user(payload['tenant_id'], payload['user_id'])

                if row and row.is_active and row.user_active:
                    _set_user_context(row)
            except Exception:
                pass  # Ignore auth errors for optional auth

        if not hasattr(g, 'tenant_schema'):
            g.tenant_schema = 'public'
            g.current_user = None

        return f(*args, **kwargs)

    return decorated
