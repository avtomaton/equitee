"""
Authentication service — handles user registration, login, and token management.

Only used in SaaS mode. In single mode, auth routes are not registered.
"""

import datetime
import uuid

import jwt
from sqlalchemy import text
from werkzeug.security import generate_password_hash, check_password_hash

from config import Config
from utils.db import engine, create_tenant_schema


class AuthService:

    @staticmethod
    def register(email, password, tenant_name=None):
        """
        Create a new tenant + user + schema.

        Returns:
            dict with access_token, refresh_token, user, tenant
        """
        tenant_id = str(uuid.uuid4())
        schema_name = f"tenant_{tenant_id}"
        tenant_name = tenant_name or f"{email}'s Portfolio"

        with engine.begin() as conn:
            # Create tenant record
            conn.execute(
                text("""
                    INSERT INTO public.tenants
                        (id, name, schema_name, plan, is_active, created_at)
                    VALUES
                        (:id, :name, :schema_name, :plan, true, :now)
                """),
                {
                    'id': tenant_id,
                    'name': tenant_name,
                    'schema_name': schema_name,
                    'plan': Config.DEFAULT_PLAN,
                    'now': datetime.datetime.utcnow(),
                },
            )

            # Create user record
            conn.execute(
                text("""
                    INSERT INTO public.users
                        (tenant_id, email, password_hash, role, is_active, created_at)
                    VALUES
                        (:tenant_id, :email, :password_hash, 'owner', true, :now)
                """),
                {
                    'tenant_id': tenant_id,
                    'email': email.lower().strip(),
                    'password_hash': generate_password_hash(password),
                    'now': datetime.datetime.utcnow(),
                },
            )

        # Create tenant schema and run migrations
        try:
            create_tenant_schema(tenant_id)
        except Exception as e:
            # Rollback: remove tenant and user records
            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM public.users WHERE tenant_id = :id"),
                    {'id': tenant_id},
                )
                conn.execute(
                    text("DELETE FROM public.tenants WHERE id = :id"),
                    {'id': tenant_id},
                )
            raise RuntimeError(f"Failed to create tenant schema: {e}") from e

        return AuthService._generate_tokens(tenant_id, email.lower().strip())

    @staticmethod
    def login(email, password):
        """
        Authenticate a user and return JWT tokens.

        Returns:
            dict with access_token, refresh_token, user, tenant
            or None if authentication fails
        """
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT
                        u.id AS user_id,
                        u.tenant_id,
                        u.password_hash,
                        u.email,
                        u.role,
                        u.is_active AS user_active,
                        t.schema_name,
                        t.plan,
                        t.is_active AS tenant_active
                    FROM public.users u
                    JOIN public.tenants t ON t.id = u.tenant_id
                    WHERE u.email = :email
                """),
                {'email': email.lower().strip()},
            )
            row = result.fetchone()

            if not row:
                return None

            if not check_password_hash(row.password_hash, password):
                return None

            if not row.user_active:
                return None

            if not row.tenant_active:
                return None

            return AuthService._generate_tokens(row.tenant_id, row.email)

    @staticmethod
    def refresh_token(refresh_token_str):
        """
        Validate a refresh token and issue a new access token.

        Returns:
            dict with access_token (and optionally new refresh_token)
            or None if refresh token is invalid
        """
        try:
            payload = jwt.decode(
                refresh_token_str,
                Config.JWT_SECRET,
                algorithms=[Config.JWT_ALGORITHM],
            )
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None

        if payload.get('type') != 'refresh':
            return None

        # Verify user and tenant still exist and are active
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT u.id, u.is_active, t.is_active AS tenant_active
                    FROM public.users u
                    JOIN public.tenants t ON t.id = u.tenant_id
                    WHERE u.id = :user_id AND t.id = :tenant_id
                """),
                {
                    'user_id': payload['user_id'],
                    'tenant_id': payload['tenant_id'],
                },
            )
            row = result.fetchone()

            if not row or not row.is_active or not row.tenant_active:
                return None

        return {
            'access_token': AuthService._create_access_token(
                payload['tenant_id'], payload['email'], payload['user_id']
            ),
        }

    @staticmethod
    def get_user_info(user_id):
        """
        Get user and tenant information.

        Returns:
            dict with user and tenant info, or None
        """
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT
                        u.id AS user_id,
                        u.email,
                        u.role,
                        u.created_at AS user_created_at,
                        t.id AS tenant_id,
                        t.name AS tenant_name,
                        t.plan,
                        t.created_at AS tenant_created_at
                    FROM public.users u
                    JOIN public.tenants t ON t.id = u.tenant_id
                    WHERE u.id = :user_id
                """),
                {'user_id': user_id},
            )
            row = result.fetchone()

            if not row:
                return None

            return {
                'user': {
                    'id': row.user_id,
                    'email': row.email,
                    'role': row.role,
                    'created_at': row.user_created_at.isoformat() if row.user_created_at else None,
                },
                'tenant': {
                    'id': row.tenant_id,
                    'name': row.tenant_name,
                    'plan': row.plan,
                    'created_at': row.tenant_created_at.isoformat() if row.tenant_created_at else None,
                },
            }

    # ── Token helpers ───────────────────────────────────────────

    @staticmethod
    def _generate_tokens(tenant_id, email):
        """Generate access and refresh tokens with user info."""
        # We need the user_id — look it up
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT id FROM public.users WHERE email = :email"),
                {'email': email},
            )
            row = result.fetchone()
            user_id = row.id if row else 0

        access_token = AuthService._create_access_token(tenant_id, email, user_id)
        refresh_token = AuthService._create_refresh_token(tenant_id, email, user_id)

        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'email': email,
                'tenant_id': tenant_id,
            },
        }

    @staticmethod
    def _create_access_token(tenant_id, email, user_id):
        """Create a short-lived access token."""
        now = datetime.datetime.utcnow()
        payload = {
            'tenant_id': tenant_id,
            'email': email,
            'user_id': user_id,
            'exp': now + datetime.timedelta(hours=Config.JWT_EXPIRATION_HOURS),
            'iat': now,
            'type': 'access',
        }
        return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

    @staticmethod
    def _create_refresh_token(tenant_id, email, user_id):
        """Create a long-lived refresh token."""
        now = datetime.datetime.utcnow()
        payload = {
            'tenant_id': tenant_id,
            'email': email,
            'user_id': user_id,
            'exp': now + datetime.timedelta(days=Config.JWT_REFRESH_EXPIRATION_DAYS),
            'iat': now,
            'type': 'refresh',
        }
        return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)
