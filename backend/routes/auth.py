"""
Authentication routes — register, login, refresh, logout, me, Google OAuth, email verification.

These routes are ONLY registered when TENANCY_MODE=saas.
In single mode, this module's register_routes() is never called.
"""

import logging
import re
import secrets
import time

from flask import request, jsonify, g, redirect

from config import Config
from services.auth_service import AuthService
from services.auth_service import _get_redis_client as _get_redis_client
from middleware.tenant_router import tenant_required
from utils.errors import handle_errors
from validation import validate_email as validate_email_format, ValidationError

logger = logging.getLogger(__name__)

# ── Password strength requirements ────────────────────────────────────────────
from validation_password import validate_password_strength

# ── OAuth state store ─────────────────────────────────────────────────────────
# Uses Redis when available (multi-process), falls back to in-memory (single-process).
_oauth_states: dict[str, float] = {}
_OAUTH_STATE_TTL = 600  # 10 minutes


def _prune_oauth_states():
    """Remove expired OAuth states to prevent unbounded memory growth."""
    now = time.time()
    expired = [k for k, v in _oauth_states.items() if v < now]
    for k in expired:
        del _oauth_states[k]


def _store_oauth_state(state):
    """Store OAuth state with expiry time — uses Redis if available."""
    redis = _get_redis_client()
    if redis:
        try:
            redis.setex(f"oauth_state:{state}", _OAUTH_STATE_TTL, "1")
            return
        except Exception:
            logger.warning("Redis OAuth state write failed, using in-memory fallback")
    _prune_oauth_states()
    _oauth_states[state] = time.time() + _OAUTH_STATE_TTL


def _validate_oauth_state(state):
    """Validate and consume OAuth state (one-time use). Returns True if valid."""
    redis = _get_redis_client()
    if redis:
        try:
            return redis.delete(f"oauth_state:{state}") > 0
        except Exception:
            logger.warning("Redis OAuth state read failed, checking in-memory")
    if state not in _oauth_states:
        return False
    if time.time() > _oauth_states[state]:
        del _oauth_states[state]
        return False
    del _oauth_states[state]
    return True

def register_auth_routes(app, limiter=None):
    """Register auth routes on the Flask app. Call only in SaaS mode.

    Args:
        app: Flask application instance.
        limiter: Optional Flask-Limiter instance for rate limiting.
                 If None, auth endpoints run without rate limiting.
    """

    def _limit(limit_string):
        """Apply rate limit decorator only if limiter is available."""
        if limiter is not None:
            return limiter.limit(limit_string)
        # No-op decorator when limiter is not configured
        def _noop(f):
            return f
        return _noop

    # ── Registration ────────────────────────────────────────────────

    @app.route('/api/auth/register', methods=['POST'])
    @_limit("3/minute")
    @handle_errors
    def register():
        """
        Create a new tenant + user + schema.

        Request body:
            {
                "email": "user@example.com",
                "password": "securepassword",
                "tenantName": "My Portfolio"  // optional
            }

        Response:
            {
                "access_token": "...",
                "refresh_token": "...",
                "user": { "email": "...", "tenant_id": "..." }
            }
        """
        data = request.get_json()

        email = data.get('email', '').strip()
        password = data.get('password', '')
        tenant_name = data.get('tenantName', '').strip() or None

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        # Validate email format
        try:
            email = validate_email_format(email)
        except ValidationError as e:
            return jsonify({'error': str(e)}), 400

        if not password:
            return jsonify({'error': 'Password is required'}), 400

        # Password strength validation (shared module)
        try:
            validate_password_strength(password)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

        try:
            result = AuthService.register(email, password, tenant_name)
            return jsonify(result), 201
        except RuntimeError as e:
            logger.error("Registration failed: %s", e)
            return jsonify({'error': 'Registration failed. Please try again.'}), 500
        except Exception as e:
            logger.exception("Unexpected registration error")
            return jsonify({'error': 'Registration failed'}), 500

    # ── Login ───────────────────────────────────────────────────────

    @app.route('/api/auth/login', methods=['POST'])
    @_limit("5/minute")
    @handle_errors
    def login():
        """
        Authenticate a user.

        Request body:
            {
                "email": "user@example.com",
                "password": "securepassword"
            }

        Response:
            {
                "access_token": "...",
                "refresh_token": "...",
                "user": { "email": "...", "tenant_id": "..." }
            }
        """
        data = request.get_json()

        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        result = AuthService.login(email, password)
        if result is None:
            return jsonify({'error': 'Invalid email or password'}), 401

        # Check for email-not-verified special case
        if isinstance(result, dict) and result.get('error') == 'email_not_verified':
            return jsonify({
                'error': 'Please verify your email address before logging in.',
                'code': 'email_not_verified',
                'email': result['email'],
            }), 403

        return jsonify(result), 200

    # ── Token refresh ───────────────────────────────────────────────

    @app.route('/api/auth/refresh', methods=['POST'])
    @_limit("20/minute")
    @handle_errors
    def refresh():
        """
        Refresh an access token using a refresh token.

        Request body:
            {
                "refresh_token": "..."
            }

        Response:
            {
                "access_token": "..."
            }
        """
        data = request.get_json()
        refresh_token_str = data.get('refresh_token', '')

        if not refresh_token_str:
            return jsonify({'error': 'Refresh token is required'}), 400

        result = AuthService.refresh_token(refresh_token_str)
        if result is None:
            return jsonify({'error': 'Invalid or expired refresh token'}), 401

        return jsonify(result), 200

    # ── Logout ──────────────────────────────────────────────────────

    @app.route('/api/auth/logout', methods=['POST'])
    @_limit("20/minute")
    @handle_errors
    def logout():
        """
        Logout endpoint — blacklists the current access token.

        Request body (optional):
            {
                "refresh_token": "..."  // also blacklisted if provided
            }

        Response: 200 OK
        """
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
            AuthService.blacklist_token(token)

        data = request.get_json(silent=True) or {}
        refresh_token_str = data.get('refresh_token', '')
        if refresh_token_str:
            AuthService.blacklist_token(refresh_token_str)

        return jsonify({'message': 'Logged out successfully'}), 200

    # ── Current user ────────────────────────────────────────────────

    @app.route('/api/auth/me', methods=['GET'])
    @handle_errors
    def get_me():
        """
        Get current user and tenant info.

        Requires: Authorization: Bearer <access_token>

        Response:
            {
                "user": { "id": 1, "email": "...", "role": "owner" },
                "tenant": { "id": "...", "name": "...", "plan": "free" }
            }
        """
        @tenant_required
        def _inner():
            user_info = AuthService.get_user_info(g.current_user['id'])
            if user_info is None:
                return jsonify({'error': 'User not found'}), 404
            return jsonify(user_info), 200

        return _inner()

    # ── Email verification ──────────────────────────────────────────

    @app.route('/api/auth/verify-email', methods=['POST'])
    @_limit("10/minute")
    @handle_errors
    def verify_email():
        """
        Verify a user's email address using a verification token.

        Request body:
            {
                "token": "verification_token_string"
            }

        Response:
            {
                "message": "Email verified successfully",
                "user": { "id": 1, "email": "...", "tenant_id": "..." }
            }
        """
        data = request.get_json()
        token = data.get('token', '')

        if not token:
            return jsonify({'error': 'Verification token is required'}), 400

        result = AuthService.verify_email(token)
        if result is None:
            return jsonify({
                'error': 'Invalid or expired verification token. '
                         'Please request a new verification email.',
            }), 400

        return jsonify({
            'message': 'Email verified successfully',
            'user': result['user'],
        }), 200

    @app.route('/api/auth/resend-verification', methods=['POST'])
    @_limit("3/minute")
    @handle_errors
    def resend_verification():
        """
        Resend email verification link.

        Request body:
            {
                "email": "user@example.com"
            }

        Response:
            {
                "message": "If an account exists with this email and is not yet verified, "
                           "a new verification email has been sent."
            }
        """
        data = request.get_json()
        email = data.get('email', '').strip()

        if not email:
            return jsonify({'error': 'Email is required'}), 400

        # Always return success to prevent email enumeration
        try:
            AuthService.resend_verification(email)
        except Exception:
            logger.warning("Failed to resend verification to %s", email, exc_info=True)

        return jsonify({
            'message': (
                'If an account exists with this email and is not yet verified, '
                'a new verification email has been sent.'
            ),
        }), 200

    # ── Google OAuth ────────────────────────────────────────────────

    @app.route('/api/auth/google', methods=['POST'])
    @_limit("5/minute")
    @handle_errors
    def google_oauth_init():
        """
        Initiate Google OAuth flow.

        Returns the Google authorization URL for the frontend to redirect to.
        The state parameter is used for CSRF protection.

        Response:
            {
                "authorization_url": "https://accounts.google.com/...",
                "state": "random_state_token"
            }
        """
        from services.google_oauth_service import GoogleOAuthService

        if not GoogleOAuthService.is_configured():
            return jsonify({'error': 'Google Sign-In is not configured'}), 503

        state = secrets.token_urlsafe(32)
        _store_oauth_state(state)
        try:
            auth_url = GoogleOAuthService.get_authorization_url(state)
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 503

        return jsonify({
            'authorization_url': auth_url,
            'state': state,
        }), 200

    @app.route('/api/auth/google/callback', methods=['POST'])
    @_limit("5/minute")
    @handle_errors
    def google_oauth_callback():
        """
        Handle Google OAuth callback.

        The frontend sends the authorization code received from Google.

        Request body:
            {
                "code": "authorization_code_from_google",
                "state": "state_token_from_init"
            }

        Response:
            {
                "access_token": "...",
                "refresh_token": "...",
                "user": { "email": "...", "tenant_id": "..." }
            }
        """
        from services.google_oauth_service import GoogleOAuthService

        if not GoogleOAuthService.is_configured():
            return jsonify({'error': 'Google Sign-In is not configured'}), 503

        data = request.get_json()
        code = data.get('code', '')
        state = data.get('state', '')

        if not code:
            return jsonify({'error': 'Authorization code is required'}), 400
    
        if not _validate_oauth_state(state):
            return jsonify({'error': 'Invalid or expired state parameter'}), 400
    
        # Get user info from Google
        google_user_info = GoogleOAuthService.handle_callback(code)
        if google_user_info is None:
            return jsonify({'error': 'Failed to authenticate with Google'}), 401

        # Login or register the user
        try:
            result = AuthService.google_oauth_login(google_user_info)
            if result is None:
                return jsonify({'error': 'Account is inactive or disabled'}), 403
            return jsonify(result), 200
        except Exception as e:
            logger.exception("Google OAuth login failed")
            return jsonify({'error': 'Authentication failed. Please try again.'}), 500
