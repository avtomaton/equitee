"""
Tenant routing middleware.

Provides the @tenant_required decorator that:
  - Single mode: No-op passthrough (sets g.tenant_schema='public')
  - SaaS mode: Validates JWT, looks up tenant schema, sets g.tenant_schema

All route handlers that need tenant awareness should use this decorator.
"""

from functools import wraps
from flask import request, jsonify, g

from config import Config


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
        import jwt
        from sqlalchemy import text
        from utils.db import engine

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid authorization header'}), 401

        token = auth_header.split(' ', 1)[1]

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
            with engine.connect() as conn:
                result = conn.execute(
                    text("""
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
                    """),
                    {
                        'tenant_id': payload['tenant_id'],
                        'user_id': payload['user_id'],
                    },
                )
                row = result.fetchone()

                if not row:
                    return jsonify({'error': 'User or tenant not found'}), 403

                if not row.is_active:
                    return jsonify({'error': 'Tenant account is inactive'}), 403

                if not row.user_active:
                    return jsonify({'error': 'User account is inactive'}), 403

                g.tenant_schema = row.schema_name
                g.current_user = {
                    'id': row.user_id,
                    'email': row.email,
                    'role': row.role,
                    'tenant_id': row.tenant_id,
                    'plan': row.plan,
                }

        except Exception:
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
        import jwt
        from sqlalchemy import text
        from utils.db import engine

        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
            try:
                payload = jwt.decode(
                    token,
                    Config.JWT_SECRET,
                    algorithms=[Config.JWT_ALGORITHM],
                )

                with engine.connect() as conn:
                    result = conn.execute(
                        text("""
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
                        """),
                        {
                            'tenant_id': payload['tenant_id'],
                            'user_id': payload['user_id'],
                        },
                    )
                    row = result.fetchone()

                    if row and row.is_active and row.user_active:
                        g.tenant_schema = row.schema_name
                        g.current_user = {
                            'id': row.user_id,
                            'email': row.email,
                            'role': row.role,
                            'tenant_id': row.tenant_id,
                            'plan': row.plan,
                        }
            except Exception:
                pass  # Ignore auth errors for optional auth

        if not hasattr(g, 'tenant_schema'):
            g.tenant_schema = 'public'
            g.current_user = None

        return f(*args, **kwargs)

    return decorated
