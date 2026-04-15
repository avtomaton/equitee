"""
Authentication routes — register, login, refresh, logout, me.

These routes are ONLY registered when TENANCY_MODE=saas.
In single mode, this module's register_routes() is never called.
"""

import logging

from flask import request, jsonify, g

from config import Config
from services.auth_service import AuthService
from utils.errors import handle_errors
from validation import validate_email as validate_email_format, ValidationError

logger = logging.getLogger(__name__)


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

        if not password or len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        try:
            result = AuthService.register(email, password, tenant_name)
            return jsonify(result), 201
        except RuntimeError as e:
            logger.error("Registration failed: %s", e)
            return jsonify({'error': 'Registration failed. Please try again.'}), 500
        except Exception as e:
            logger.exception("Unexpected registration error")
            return jsonify({'error': 'Registration failed'}), 500

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

        return jsonify(result), 200

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
        # Manually invoke tenant_required logic — decorators work fine
        # inside register_routes when applied as a regular function call.
        from middleware.tenant_router import tenant_required

        # Call the decorator's inner logic by wrapping temporarily
        @tenant_required
        def _inner():
            user_info = AuthService.get_user_info(g.current_user['id'])
            if user_info is None:
                return jsonify({'error': 'User not found'}), 404
            return jsonify(user_info), 200

        return _inner()
