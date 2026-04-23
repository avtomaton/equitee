"""
Authentication service — handles user registration, login, and token management.

Only used in SaaS mode. In single mode, auth routes are not registered.
"""

import datetime
import logging
import secrets
import uuid

import jwt
from sqlalchemy import text
from werkzeug.security import generate_password_hash, check_password_hash

from config import Config
from utils.db import engine, create_tenant_schema

logger = logging.getLogger(__name__)

# ── In-memory token blacklist ────────────────────────────────────────────────
# For single-process deployments. For multi-process/multi-server deployments,
# replace with Redis or a database-backed store.
_blacklist: dict[str, float] = {}

# How long to keep expired entries before pruning (seconds)
_BLACKLIST_TTL = 7 * 24 * 3600  # 7 days (matches max refresh token lifetime)


def _utcnow():
    """Return the current UTC time (timezone-aware)."""
    return datetime.datetime.now(datetime.timezone.utc)


def _prune_blacklist():
    """Remove expired entries from the blacklist to prevent unbounded growth."""
    cutoff = _utcnow().timestamp()
    expired = [k for k, v in _blacklist.items() if v < cutoff]
    for k in expired:
        del _blacklist[k]


class AuthService:

    @staticmethod
    def blacklist_token(token_str):
        """
        Add a token to the blacklist so it can no longer be used.

        The token is stored until its natural expiry (plus a safety margin),
        after which it is pruned automatically.
        """
        try:
            payload = jwt.decode(
                token_str,
                Config.JWT_SECRET,
                algorithms=[Config.JWT_ALGORITHM],
            )
            # Store with the token's expiry timestamp
            exp = payload.get('exp', _utcnow().timestamp() + _BLACKLIST_TTL)
            _blacklist[token_str] = exp
            _prune_blacklist()
        except jwt.InvalidTokenError:
            # If the token is already invalid, nothing to blacklist
            pass

    @staticmethod
    def is_token_blacklisted(token_str):
        """Check whether a token has been blacklisted."""
        return token_str in _blacklist

    @staticmethod
    def register(email, password, tenant_name=None):
        """
        Create a new tenant + user + schema.

        The user starts with is_active=True but email_verified=False.
        A verification email is sent (if SMTP is configured).

        Returns:
            dict with access_token, refresh_token, user, tenant
        """
        tenant_id = str(uuid.uuid4())
        schema_name = f"tenant_{tenant_id}"
        tenant_name = tenant_name or f"{email}'s Portfolio"
        now = _utcnow()
        verification_token = secrets.token_urlsafe(32)

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
                    'now': now,
                },
            )

            # Create user record — active but email not yet verified
            conn.execute(
                text("""
                    INSERT INTO public.users
                        (tenant_id, email, password_hash, role, is_active,
                         email_verified, email_verification_token,
                         email_verification_sent_at, created_at)
                    VALUES
                        (:tenant_id, :email, :password_hash, 'owner', true,
                         false, :verification_token, :now, :now)
                """),
                {
                    'tenant_id': tenant_id,
                    'email': email.lower().strip(),
                    'password_hash': generate_password_hash(password),
                    'verification_token': verification_token,
                    'now': now,
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

        # Send verification email (best-effort, don't fail registration)
        try:
            from services.email_service import EmailService
            verification_url = (
                f"{Config.APP_BASE_URL}/#/verify-email?token={verification_token}"
            )
            EmailService.send_verification_email(email.lower().strip(), verification_url)
        except Exception:
            logger.warning("Failed to send verification email to %s", email, exc_info=True)

        return AuthService._generate_tokens(tenant_id, email.lower().strip())

    @staticmethod
    def verify_email(token):
        """
        Verify a user's email using the verification token.

        Args:
            token: The email verification token.

        Returns:
            dict with user info on success, or None if token is invalid/expired.
        """
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    SELECT id, tenant_id, email, email_verification_sent_at
                    FROM public.users
                    WHERE email_verification_token = :token
                """),
                {'token': token},
            )
            row = result.fetchone()

            if not row:
                return None

            # Check token expiry
            if row.email_verification_sent_at:
                elapsed = _utcnow() - row.email_verification_sent_at.replace(
                    tzinfo=datetime.timezone.utc
                )
                if elapsed.total_seconds() > Config.EMAIL_VERIFICATION_EXPIRY_HOURS * 3600:
                    return None

            # Mark email as verified and clear token
            conn.execute(
                text("""
                    UPDATE public.users
                    SET email_verified = true,
                        email_verification_token = NULL
                    WHERE id = :user_id
                """),
                {'user_id': row.id},
            )

            return {
                'user': {
                    'id': row.id,
                    'email': row.email,
                    'tenant_id': row.tenant_id,
                },
            }

    @staticmethod
    def resend_verification(email):
        """
        Resend a verification email to the given address.

        Args:
            email: The user's email address.

        Returns:
            bool: True if email was sent, False if user not found or already verified.
        """
        verification_token = secrets.token_urlsafe(32)
        now = _utcnow()

        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    SELECT id, email_verified
                    FROM public.users
                    WHERE email = :email
                """),
                {'email': email.lower().strip()},
            )
            row = result.fetchone()

            if not row or row.email_verified:
                return False

            conn.execute(
                text("""
                    UPDATE public.users
                    SET email_verification_token = :token,
                        email_verification_sent_at = :now
                    WHERE id = :user_id
                """),
                {'token': verification_token, 'now': now, 'user_id': row.id},
            )

        # Send verification email
        from services.email_service import EmailService
        verification_url = (
            f"{Config.APP_BASE_URL}/#/verify-email?token={verification_token}"
        )
        EmailService.send_verification_email(email.lower().strip(), verification_url)
        return True

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
                        u.email_verified,
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

            if not check_password_hash(row.password_hash or '', password):
                return None

            if not row.user_active:
                return None

            if not row.tenant_active:
                return None

            if not row.email_verified:
                return {'error': 'email_not_verified', 'email': row.email}

            return AuthService._generate_tokens(row.tenant_id, row.email)

    @staticmethod
    def google_oauth_login(google_user_info):
        """
        Handle Google OAuth login — find existing user or create a new one.

        Args:
            google_user_info: dict with 'email', 'name', 'google_id', 'email_verified'.

        Returns:
            dict with access_token, refresh_token, user, tenant
        """
        email = google_user_info['email']
        google_id = google_user_info['google_id']

        with engine.connect() as conn:
            # Check if user exists with this Google ID
            result = conn.execute(
                text("""
                    SELECT u.id, u.tenant_id, u.email, u.is_active, u.email_verified,
                           t.is_active AS tenant_active
                    FROM public.users u
                    JOIN public.tenants t ON t.id = u.tenant_id
                    WHERE u.google_id = :google_id
                """),
                {'google_id': google_id},
            )
            row = result.fetchone()

            if row:
                # Existing Google user — log them in
                if not row.is_active or not row.tenant_active:
                    return None
                return AuthService._generate_tokens(row.tenant_id, row.email)

            # Check if user exists with this email (but no Google ID linked)
            result = conn.execute(
                text("""
                    SELECT u.id, u.tenant_id, u.email, u.is_active, u.email_verified,
                           t.is_active AS tenant_active
                    FROM public.users u
                    JOIN public.tenants t ON t.id = u.tenant_id
                    WHERE u.email = :email
                """),
                {'email': email},
            )
            row = result.fetchone()

            if row:
                # Link Google ID to existing account
                if not row.is_active or not row.tenant_active:
                    return None
                with engine.begin() as conn2:
                    conn2.execute(
                        text("""
                            UPDATE public.users
                            SET google_id = :google_id, email_verified = true
                            WHERE id = :user_id
                        """),
                        {'google_id': google_id, 'user_id': row.id},
                    )
                return AuthService._generate_tokens(row.tenant_id, row.email)

        # New user — create tenant + user + schema
        return AuthService._register_google_user(google_user_info)

    @staticmethod
    def _register_google_user(google_user_info):
        """
        Create a new tenant + user + schema for a Google OAuth user.

        Google OAuth users are automatically email_verified since Google
        confirms the email.
        """
        email = google_user_info['email']
        google_id = google_user_info['google_id']
        name = google_user_info.get('name', '')
        tenant_name = f"{name}'s Portfolio" if name else f"{email}'s Portfolio"

        tenant_id = str(uuid.uuid4())
        schema_name = f"tenant_{tenant_id}"
        now = _utcnow()

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
                    'now': now,
                },
            )

            # Create user record — no password, email auto-verified
            conn.execute(
                text("""
                    INSERT INTO public.users
                        (tenant_id, email, password_hash, role, is_active,
                         email_verified, google_id, created_at)
                    VALUES
                        (:tenant_id, :email, NULL, 'owner', true,
                         true, :google_id, :now)
                """),
                {
                    'tenant_id': tenant_id,
                    'email': email,
                    'google_id': google_id,
                    'now': now,
                },
            )

        # Create tenant schema and run migrations
        try:
            create_tenant_schema(tenant_id)
        except Exception as e:
            # Rollback
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

        return AuthService._generate_tokens(tenant_id, email)

    @staticmethod
    def refresh_token(refresh_token_str):
        """
        Validate a refresh token and issue a new access token.

        Returns:
            dict with access_token (and optionally new refresh_token)
            or None if refresh token is invalid
        """
        # Reject blacklisted refresh tokens (e.g. after logout)
        if AuthService.is_token_blacklisted(refresh_token_str):
            return None

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
                        u.email_verified,
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
                    'email_verified': row.email_verified,
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
        now = _utcnow()
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
        now = _utcnow()
        payload = {
            'tenant_id': tenant_id,
            'email': email,
            'user_id': user_id,
            'exp': now + datetime.timedelta(days=Config.JWT_REFRESH_EXPIRATION_DAYS),
            'iat': now,
            'type': 'refresh',
        }
        return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)
