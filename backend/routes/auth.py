"""
Authentication routes — register, login, refresh, logout, me.

These routes are ONLY registered when TENANCY_MODE=saas.
In single mode, this module's register_routes() is never called.
"""

from flask import request, jsonify

from config import Config
from services.auth_service import AuthService
from utils.errors import handle_errors


def register_auth_routes(app):
    """Register auth routes on the Flask app. Call only in SaaS mode."""

    @app.route('/api/auth/register', methods=['POST'])
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
        if not password or len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        try:
            result = AuthService.register(email, password, tenant_name)
            return jsonify(result), 201
        except RuntimeError as e:
            return jsonify({'error': str(e)}), 500
        except Exception as e:
            return jsonify({'error': 'Registration failed'}), 500

    @app.route('/api/auth/login', methods=['POST'])
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
    @handle_errors
    def logout():
        """
        Logout endpoint.

        In the current implementation, tokens are stateless (JWT).
        Logout is a client-side operation (delete tokens).
        This endpoint exists for API consistency and future token blacklisting.

        Response: 200 OK
        """
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
        from middleware.tenant_router import tenant_required
        from flask import g

        # tenant_required will set g.current_user
        # We can't use it as a decorator inside register_routes,
        # so we call its inner logic manually
        if Config.TENANCY_MODE == 'single':
            return jsonify({'error': 'Not available in single mode'}), 404

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing authorization'}), 401

        # g.current_user is set by the tenant_required middleware
        # But since /me needs auth too, we re-validate the token here
        import jwt
        from sqlalchemy import text
        from utils.db import engine

        token = auth_header.split(' ', 1)[1]
        try:
            payload = jwt.decode(token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'error': 'Invalid token'}), 401

        user_info = AuthService.get_user_info(payload['user_id'])
        if user_info is None:
            return jsonify({'error': 'User not found'}), 404

        return jsonify(user_info), 200
