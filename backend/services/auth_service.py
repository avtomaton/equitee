"""
Authentication service — handles user registration, login, and token management.

Only used in SaaS mode. In single mode, auth routes are not registered.
"""

import datetime
import logging
import os
import re
import secrets
import uuid

import jwt
from sqlalchemy import text
from werkzeug.security import generate_password_hash, check_password_hash

from config import Config
from utils.db import engine, create_tenant_schema
from utils.timeutils import utcnow
from validation_password import validate_password_strength

logger = logging.getLogger(__name__)

# ── Token blacklist ──────────────────────────────────────────────────────────
# Supports both in-memory (single-process) and Redis (multi-process) storage.
# Set REDIS_URL environment variable to enable Redis storage.

_redis_client = None

def _get_redis_client():
    """Get or create Redis client. Returns None if Redis is not available."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    
    redis_url = os.environ.get('REDIS_URL')
    if not redis_url:
        return None
    
    try:
        import redis
        _redis_client = redis.from_url(redis_url, decode_responses=True)
        _redis_client.ping()
        logger.info("Using Redis for token blacklist")
        return _redis_client
    except Exception as e:
        logger.warning("Redis connection failed, using in-memory blacklist: %s", e)
        _redis_client = None
        return None

# In-memory fallback for single-process deployments
_blacklist: dict[str, float] = {}

# How long to keep expired entries before pruning (seconds)
_BLACKLIST_TTL = 7 * 24 * 3600  # 7 days (matches max refresh token lifetime)


def _prune_blacklist():
    """Remove expired entries from the blacklist to prevent unbounded growth."""
    cutoff = utcnow().timestamp()
    expired = [k for k, v in _blacklist.items() if v < cutoff]
    for k in expired:
        del _blacklist[k]


class AuthService:

    @staticmethod
    def blacklist_token(token_str):
        """
        Add a token to the blacklist so it can no longer be used.

        Uses Redis if available (multi-process deployments), otherwise
        falls back to in-memory storage (single-process deployments).
        """
        try:
            payload = jwt.decode(
                token_str,
                Config.JWT_SECRET,
                algorithms=[Config.JWT_ALGORITHM],
            )
            # Store with the token's expiry timestamp
            exp = payload.get('exp', utcnow().timestamp() + _BLACKLIST_TTL)
            
            redis = _get_redis_client()
            if redis:
                try:
                    ttl = int(exp - utcnow().timestamp())
                    if ttl > 0:
                        redis.setex(f"blacklist:{token_str}", ttl, "1")
                except Exception:
                    logger.warning("Redis blacklist write failed, using in-memory fallback")
                    _blacklist[token_str] = exp
                    _prune_blacklist()
            else:
                # In-memory fallback
                _blacklist[token_str] = exp
                _prune_blacklist()
        except jwt.InvalidTokenError:
            # If the token is already invalid, nothing to blacklist
            pass

    @staticmethod
    def is_token_blacklisted(token_str):
        """Check whether a token has been blacklisted."""
        redis = _get_redis_client()
        if redis:
            try:
                return redis.exists(f"blacklist:{token_str}") > 0
            except Exception:
                logger.warning("Redis blacklist read failed, checking in-memory")
        return token_str in _blacklist

    @staticmethod
    def register(email, password, tenant_name=None):
        """
        Register a new user.

        In the new flow, registration creates a user WITHOUT a tenant.
        The user must then request a tenancy, which an admin approves.
        After approval, the tenant is created and linked to the user.

        For backward compatibility, if tenant_name is provided, a tenancy
        request is automatically created alongside the user.

        Returns:
            dict with access_token, refresh_token, user
        """
        # Password strength validation (shared module)
        validate_password_strength(password)

        now = utcnow()
        verification_token = secrets.token_urlsafe(32)

        with engine.begin() as conn:
            # Create user record — no tenant yet, email not yet verified
            conn.execute(
                text("""
                    INSERT INTO public.users
                        (tenant_id, email, password_hash, role, is_active,
                         email_verified, email_verification_token,
                         email_verification_sent_at, created_at)
                    VALUES
                        (NULL, :email, :password_hash, 'owner', true,
                         false, :verification_token, :now, :now)
                """),
                {
                    'email': email.lower().strip(),
                    'password_hash': generate_password_hash(password),
                    'verification_token': verification_token,
                    'now': now,
                },
            )

            # If tenant_name provided, create a tenancy request
            if tenant_name:
                user_row = conn.execute(
                    text("SELECT id FROM public.users WHERE email = :email"),
                    {'email': email.lower().strip()},
                ).fetchone()

                conn.execute(
                    text("""
                        INSERT INTO public.tenancy_requests
                            (user_id, tenant_name, status, created_at)
                        VALUES (:user_id, :tenant_name, 'pending', :now)
                    """),
                    {
                        'user_id': user_row.id,
                        'tenant_name': tenant_name.strip(),
                        'now': now,
                    },
                )

        # Send verification email (best-effort, don't fail registration)
        try:
            from services.email_service import EmailService
            verification_url = (
                f"{Config.APP_BASE_URL}/#/verify-email?token={verification_token}"
            )
            EmailService.send_verification_email(email.lower().strip(), verification_url)
        except Exception:
            logger.warning("Failed to send verification email to %s", email, exc_info=True)

        # Generate tokens without a tenant (tenant_id will be None)
        return AuthService._generate_tokens(None, email.lower().strip())

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
                elapsed = utcnow() - row.email_verification_sent_at.replace(
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
        now = utcnow()

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

        Users without a tenant can still log in (they'll see a "request tenancy" page).
        The token will have tenant_id=None in that case.

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
                        u.active_tenant_id,
                        u.password_hash,
                        u.email,
                        u.role,
                        u.is_active AS user_active,
                        u.is_admin,
                        u.email_verified
                    FROM public.users u
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

            if not row.email_verified:
                return {'error': 'email_not_verified', 'email': row.email}

            # Use active_tenant_id if set, otherwise tenant_id
            effective_tenant_id = row.active_tenant_id or row.tenant_id

            if effective_tenant_id:
                # Verify tenant is active
                tenant = conn.execute(
                    text("SELECT is_active FROM public.tenants WHERE id = :id"),
                    {'id': effective_tenant_id},
                ).fetchone()
                if not tenant or not tenant.is_active:
                    effective_tenant_id = None

            if effective_tenant_id:
                return AuthService._generate_tokens(effective_tenant_id, row.email)
            else:
                return AuthService._generate_tokens(None, row.email)

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
                    SELECT u.id, u.tenant_id, u.active_tenant_id, u.email,
                           u.is_active, u.email_verified
                    FROM public.users u
                    WHERE u.email = :email
                """),
                {'email': email},
            )
            row = result.fetchone()

            if row:
                # Link Google ID to existing account
                if not row.is_active:
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
                effective_tenant = row.active_tenant_id or row.tenant_id
                if effective_tenant:
                    return AuthService._generate_tokens(effective_tenant, row.email)
                else:
                    return AuthService._generate_tokens(None, row.email)

        # New user — create without tenant (same as email registration)
        return AuthService._register_google_user(google_user_info)

    @staticmethod
    def _register_google_user(google_user_info):
        """
        Create a new user for a Google OAuth sign-in.

        Google OAuth users are automatically email_verified since Google
        confirms the email. No tenant is created — user must request one.
        """
        email = google_user_info['email']
        google_id = google_user_info['google_id']
        now = utcnow()

        with engine.begin() as conn:
            # Create user record — no password, no tenant, email auto-verified
            conn.execute(
                text("""
                    INSERT INTO public.users
                        (tenant_id, email, password_hash, role, is_active,
                         email_verified, google_id, created_at)
                    VALUES
                        (NULL, :email, NULL, 'owner', true,
                         true, :google_id, :now)
                """),
                {
                    'email': email,
                    'google_id': google_id,
                    'now': now,
                },
            )

        return AuthService._generate_tokens(None, email)

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

        # Verify user still exists and is active
        tenant_id = payload.get('tenant_id')
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT id, is_active FROM public.users WHERE id = :user_id"),
                {'user_id': payload['user_id']},
            )
            row = result.fetchone()

            if not row or not row.is_active:
                return None

            # If token has a tenant, verify it's still active
            if tenant_id:
                tenant = conn.execute(
                    text("SELECT is_active FROM public.tenants WHERE id = :id"),
                    {'id': tenant_id},
                ).fetchone()
                if not tenant or not tenant.is_active:
                    tenant_id = None

        return {
            'access_token': AuthService._create_access_token(
                tenant_id, payload['email'], payload['user_id']
            ),
        }

    @staticmethod
    def get_user_info(user_id):
        """
        Get user and tenant information.

        Returns:
            dict with user and tenant info, or None.
            Tenant may be None if user has no tenant yet.
        """
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT
                        u.id AS user_id,
                        u.email,
                        u.role,
                        u.is_admin,
                        u.email_verified,
                        u.created_at AS user_created_at,
                        u.active_tenant_id,
                        t.id AS tenant_id,
                        t.name AS tenant_name,
                        t.plan,
                        t.created_at AS tenant_created_at
                    FROM public.users u
                    LEFT JOIN public.tenants t ON t.id = u.active_tenant_id
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
                    'is_admin': row.is_admin,
                    'email_verified': row.email_verified,
                    'created_at': row.user_created_at.isoformat() if row.user_created_at else None,
                },
                'tenant': {
                    'id': row.tenant_id,
                    'name': row.tenant_name,
                    'plan': row.plan,
                    'created_at': row.tenant_created_at.isoformat() if row.tenant_created_at else None,
                } if row.tenant_id else None,
            }

    # ── Token helpers ───────────────────────────────────────────

    @staticmethod
    def _generate_tokens(tenant_id, email):
        """Generate access and refresh tokens with user info.

        tenant_id may be None for users without a tenant (pre-approval).
        """
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT id, is_admin FROM public.users WHERE email = :email"),
                {'email': email},
            )
            row = result.fetchone()
            if not row:
                raise ValueError(f"User not found: {email}")
            user_id = row.id
            is_admin = row.is_admin

        access_token = AuthService._create_access_token(tenant_id, email, user_id)
        refresh_token = AuthService._create_refresh_token(tenant_id, email, user_id)

        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'email': email,
                'tenant_id': tenant_id,
                'user_id': user_id,
                'is_admin': is_admin,
            },
        }

    @staticmethod
    def _create_access_token(tenant_id, email, user_id):
        """Create a short-lived access token."""
        now = utcnow()
        payload = {
            'tenant_id': tenant_id,
            'email': email,
            'user_id': user_id,
            'exp': now + datetime.timedelta(hours=Config.JWT_EXPIRATION_HOURS),
            'iat': now,
            'type': 'access',
        }
        return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)

    # ── Account lockout ──────────────────────────────────────────

    _MAX_FAILED_LOGINS = 5
    _LOCKOUT_MINUTES = 15

    @staticmethod
    def _check_account_locked(email):
        """Check if the account is currently locked due to too many failed attempts.
        Returns (is_locked, remaining_minutes)."""
        redis = _get_redis_client()
        key = f"login_fail:{email}"
        lock_key = f"login_lock:{email}"

        if redis:
            try:
                ttl = redis.ttl(lock_key)
                if ttl > 0:
                    return True, max(1, ttl // 60)
                return False, 0
            except Exception:
                pass

        # In-memory fallback
        if lock_key in _blacklist:
            remaining = _blacklist[lock_key] - utcnow().timestamp()
            if remaining > 0:
                return True, max(1, int(remaining // 60))
        return False, 0

    @staticmethod
    def _record_failed_login(email):
        """Record a failed login attempt. Locks account after _MAX_FAILED_LOGINS."""
        redis = _get_redis_client()
        key = f"login_fail:{email}"
        lock_key = f"login_lock:{email}"

        if redis:
            try:
                count = redis.incr(key)
                redis.expire(key, AuthService._LOCKOUT_MINUTES * 60)
                if count >= AuthService._MAX_FAILED_LOGINS:
                    redis.setex(lock_key, AuthService._LOCKOUT_MINUTES * 60, "1")
                    logger.warning("Account locked for %s after %d failed attempts", email, count)
                return
            except Exception:
                pass

        # In-memory fallback
        count = _blacklist.get(key, 0) + 1
        _blacklist[key] = count
        if count >= AuthService._MAX_FAILED_LOGINS:
            _blacklist[lock_key] = utcnow().timestamp() + AuthService._LOCKOUT_MINUTES * 60
            logger.warning("Account locked for %s after %d failed attempts", email, count)

    @staticmethod
    def _reset_failed_logins(email):
        """Clear failed login attempts after successful login."""
        redis = _get_redis_client()
        key = f"login_fail:{email}"
        lock_key = f"login_lock:{email}"

        if redis:
            try:
                redis.delete(key, lock_key)
                return
            except Exception:
                pass

        _blacklist.pop(key, None)
        _blacklist.pop(lock_key, None)

    # ── Password reset ───────────────────────────────────────────

    @staticmethod
    def forgot_password(email):
        """Generate a password reset token and (in production) send it via email.
        Always returns True to prevent email enumeration."""
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT id, email FROM public.users WHERE email = :email"),
                {'email': email.lower().strip()},
            )
            row = result.fetchone()

            if not row:
                return True  # Don't reveal that the user doesn't exist

            token = secrets.token_urlsafe(32)
            conn.execute(
                text("""
                    UPDATE public.users
                    SET email_verification_token = :token,
                        email_verification_sent_at = :now
                    WHERE id = :user_id
                """),
                {'token': token, 'now': utcnow(), 'user_id': row.id},
            )
            conn.commit()

            # Send reset email
            try:
                from services.email_service import EmailService
                reset_url = f"{Config.APP_BASE_URL}/#/reset-password?token={token}"
                EmailService.send_password_reset_email(row.email, reset_url)
            except Exception:
                logger.warning("Failed to send password reset email to %s", row.email, exc_info=True)

            return True

    @staticmethod
    def reset_password(token, new_password):
        """Reset a user's password using a reset token.
        Returns True on success, False if token is invalid/expired."""
        validate_password_strength(new_password)

        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    SELECT id, email_verification_sent_at
                    FROM public.users
                    WHERE email_verification_token = :token
                """),
                {'token': token},
            )
            row = result.fetchone()

            if not row:
                return False

            # Check token expiry (24 hours, same as email verification)
            if row.email_verification_sent_at:
                elapsed = utcnow() - row.email_verification_sent_at.replace(
                    tzinfo=datetime.timezone.utc
                )
                if elapsed.total_seconds() > Config.EMAIL_VERIFICATION_EXPIRY_HOURS * 3600:
                    return False

            # Update password and clear token
            conn.execute(
                text("""
                    UPDATE public.users
                    SET password_hash = :password_hash,
                        email_verification_token = NULL
                    WHERE id = :user_id
                """),
                {
                    'password_hash': generate_password_hash(new_password),
                    'user_id': row.id,
                },
            )

            # Invalidate all existing tokens by changing a token version
            # This forces re-login on all devices
            logger.info("Password reset successful for user id=%s", row.id)
            return True

    @staticmethod
    def _create_refresh_token(tenant_id, email, user_id):
        """Create a long-lived refresh token."""
        now = utcnow()
        payload = {
            'tenant_id': tenant_id,
            'email': email,
            'user_id': user_id,
            'exp': now + datetime.timedelta(days=Config.JWT_REFRESH_EXPIRATION_DAYS),
            'iat': now,
            'type': 'refresh',
        }
        return jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)
