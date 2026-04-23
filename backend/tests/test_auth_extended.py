"""
Tests for the extended auth features: email verification, Google OAuth.

These tests use mocking to avoid requiring a live PostgreSQL database.
They can run alongside the existing single-mode tests.
"""

import datetime
import os
import sys
import uuid
import pytest
from unittest.mock import patch, MagicMock

# Ensure backend is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _setup_saas_env(monkeypatch):
    """Set SaaS mode config for all tests in this module.

    Uses monkeypatch.setattr on Config class attributes directly so that
    all already-imported modules see the test values (no reload needed).
    """
    import config
    monkeypatch.setattr(config.Config, 'TENANCY_MODE', 'saas')
    monkeypatch.setattr(config.Config, 'DATABASE_URL', 'postgresql://mock:mock@localhost/mock')
    monkeypatch.setattr(config.Config, 'JWT_SECRET', 'test_secret_for_auth_extended_0000000000000000')
    monkeypatch.setattr(config.Config, 'GOOGLE_CLIENT_ID', 'test-google-client-id')
    monkeypatch.setattr(config.Config, 'GOOGLE_CLIENT_SECRET', 'test-google-client-secret')
    monkeypatch.setattr(config.Config, 'GOOGLE_REDIRECT_URI', 'http://localhost/callback')
    monkeypatch.setattr(config.Config, 'SMTP_HOST', '')
    monkeypatch.setattr(config.Config, 'SMTP_USER', '')


@pytest.fixture
def mock_engine():
    """Create a mock database engine."""
    engine = MagicMock()
    return engine


@pytest.fixture
def unique_email():
    """Generate a unique email."""
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


# ── Test Email Verification Service ──────────────────────────────────────────

class TestEmailVerification:
    """Test email verification flow."""

    def test_verify_email_with_valid_token(self, unique_email):
        """verify_email should activate user when token is valid."""
        from services.auth_service import AuthService

        mock_row = MagicMock()
        mock_row.id = 1
        mock_row.tenant_id = 'test-tenant-id'
        mock_row.email = unique_email
        mock_row.email_verification_sent_at = datetime.datetime.now(datetime.timezone.utc)

        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_conn.execute.return_value = mock_result
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch('services.auth_service.engine') as mock_eng:
            mock_eng.begin.return_value.__enter__ = lambda s: mock_conn
            mock_eng.begin.return_value.__exit__ = MagicMock(return_value=False)

            result = AuthService.verify_email('valid-token')

        assert result is not None
        assert result['user']['email'] == unique_email
        assert result['user']['tenant_id'] == 'test-tenant-id'

    def test_verify_email_with_invalid_token(self):
        """verify_email should return None for invalid token."""
        from services.auth_service import AuthService

        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = None
        mock_conn.execute.return_value = mock_result
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch('services.auth_service.engine') as mock_eng:
            mock_eng.begin.return_value.__enter__ = lambda s: mock_conn
            mock_eng.begin.return_value.__exit__ = MagicMock(return_value=False)

            result = AuthService.verify_email('invalid-token')

        assert result is None

    def test_verify_email_with_expired_token(self):
        """verify_email should return None for expired token."""
        from services.auth_service import AuthService

        mock_row = MagicMock()
        mock_row.id = 1
        mock_row.tenant_id = 'test-tenant-id'
        mock_row.email = 'test@example.com'
        # Token sent 48 hours ago (default expiry is 24 hours)
        mock_row.email_verification_sent_at = (
            datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=48)
        )

        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_conn.execute.return_value = mock_result
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch('services.auth_service.engine') as mock_eng:
            mock_eng.begin.return_value.__enter__ = lambda s: mock_conn
            mock_eng.begin.return_value.__exit__ = MagicMock(return_value=False)

            result = AuthService.verify_email('expired-token')

        assert result is None

    def test_login_returns_email_not_verified_for_unverified_user(self, unique_email):
        """login should return special dict when email is not verified."""
        from services.auth_service import AuthService

        mock_row = MagicMock()
        mock_row.user_id = 1
        mock_row.tenant_id = 'test-tenant-id'
        mock_row.password_hash = 'pbkdf2:sha256:260000$test$test'
        mock_row.email = unique_email
        mock_row.role = 'owner'
        mock_row.user_active = True
        mock_row.email_verified = False
        mock_row.schema_name = 'tenant_test'
        mock_row.plan = 'free'
        mock_row.tenant_active = True

        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_conn.execute.return_value = mock_result
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch('services.auth_service.engine') as mock_eng, \
             patch('services.auth_service.check_password_hash', return_value=True):
            mock_eng.connect.return_value.__enter__ = lambda s: mock_conn
            mock_eng.connect.return_value.__exit__ = MagicMock(return_value=False)

            result = AuthService.login(unique_email, 'password123')

        assert result is not None
        assert result.get('error') == 'email_not_verified'
        assert result.get('email') == unique_email


# ── Test Google OAuth Service ────────────────────────────────────────────────

class TestGoogleOAuthService:
    """Test Google OAuth service."""

    def test_is_configured_when_credentials_set(self):
        """is_configured should return True when credentials are set."""
        from services.google_oauth_service import GoogleOAuthService
        assert GoogleOAuthService.is_configured() is True

    def test_is_not_configured_without_credentials(self, monkeypatch):
        """is_configured should return False when credentials are missing."""
        import config
        monkeypatch.setattr(config.Config, 'GOOGLE_CLIENT_ID', '')
        monkeypatch.setattr(config.Config, 'GOOGLE_CLIENT_SECRET', '')

        from services.google_oauth_service import GoogleOAuthService
        assert GoogleOAuthService.is_configured() is False

    def test_get_authorization_url(self):
        """Should build a valid Google authorization URL."""
        from services.google_oauth_service import GoogleOAuthService

        url = GoogleOAuthService.get_authorization_url('test-state')

        assert 'accounts.google.com' in url
        assert 'client_id=test-google-client-id' in url
        assert 'state=test-state' in url
        assert 'openid' in url and 'email' in url and 'profile' in url

    def test_handle_callback_success(self):
        """Should exchange code for user info."""
        from services.google_oauth_service import GoogleOAuthService

        mock_token_resp = MagicMock()
        mock_token_resp.json.return_value = {'access_token': 'test-access-token'}
        mock_token_resp.raise_for_status = MagicMock()

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.json.return_value = {
            'email': 'user@gmail.com',
            'name': 'Test User',
            'sub': 'google-123',
            'email_verified': True,
        }
        mock_userinfo_resp.raise_for_status = MagicMock()

        with patch('services.google_oauth_service.requests') as mock_requests:
            mock_requests.post.return_value = mock_token_resp
            mock_requests.get.return_value = mock_userinfo_resp

            result = GoogleOAuthService.handle_callback('test-code')

        assert result is not None
        assert result['email'] == 'user@gmail.com'
        assert result['google_id'] == 'google-123'
        assert result['name'] == 'Test User'
        assert result['email_verified'] is True

    def test_handle_callback_token_failure(self):
        """Should return None when token exchange fails."""
        from services.google_oauth_service import GoogleOAuthService

        with patch('services.google_oauth_service.requests') as mock_requests:
            mock_requests.post.side_effect = Exception("Network error")

            result = GoogleOAuthService.handle_callback('bad-code')

        assert result is None

    def test_handle_callback_no_email(self):
        """Should return None when user info has no email."""
        from services.google_oauth_service import GoogleOAuthService

        mock_token_resp = MagicMock()
        mock_token_resp.json.return_value = {'access_token': 'test-access-token'}
        mock_token_resp.raise_for_status = MagicMock()

        mock_userinfo_resp = MagicMock()
        mock_userinfo_resp.json.return_value = {'sub': '123'}  # No email
        mock_userinfo_resp.raise_for_status = MagicMock()

        with patch('services.google_oauth_service.requests') as mock_requests:
            mock_requests.post.return_value = mock_token_resp
            mock_requests.get.return_value = mock_userinfo_resp

            result = GoogleOAuthService.handle_callback('test-code')

        assert result is None


# ── Test Google OAuth Login Flow ─────────────────────────────────────────────

class TestGoogleOAuthLogin:
    """Test the AuthService.google_oauth_login method."""

    def test_existing_google_user_login(self):
        """Should log in existing Google user."""
        from services.auth_service import AuthService

        mock_row = MagicMock()
        mock_row.id = 1
        mock_row.tenant_id = 'test-tenant-id'
        mock_row.email = 'user@gmail.com'
        mock_row.is_active = True
        mock_row.email_verified = True
        mock_row.tenant_active = True

        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_conn.execute.return_value = mock_result
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)

        # Mock _generate_tokens
        with patch('services.auth_service.engine') as mock_eng, \
             patch.object(AuthService, '_generate_tokens', return_value={
                 'access_token': 'at', 'refresh_token': 'rt',
                 'user': {'email': 'user@gmail.com', 'tenant_id': 'test-tenant-id'},
             }):
            mock_eng.connect.return_value.__enter__ = lambda s: mock_conn
            mock_eng.connect.return_value.__exit__ = MagicMock(return_value=False)

            result = AuthService.google_oauth_login({
                'email': 'user@gmail.com',
                'google_id': 'google-123',
                'name': 'Test User',
            })

        assert result is not None
        assert result['user']['email'] == 'user@gmail.com'

    def test_inactive_user_rejected(self):
        """Should return None for inactive user."""
        from services.auth_service import AuthService

        mock_row = MagicMock()
        mock_row.id = 1
        mock_row.tenant_id = 'test-tenant-id'
        mock_row.email = 'user@gmail.com'
        mock_row.is_active = False
        mock_row.email_verified = True
        mock_row.tenant_active = True

        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_conn.execute.return_value = mock_result
        mock_conn.__enter__ = lambda s: s
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch('services.auth_service.engine') as mock_eng:
            mock_eng.connect.return_value.__enter__ = lambda s: mock_conn
            mock_eng.connect.return_value.__exit__ = MagicMock(return_value=False)

            result = AuthService.google_oauth_login({
                'email': 'user@gmail.com',
                'google_id': 'google-123',
                'name': 'Test User',
            })

        assert result is None


# ── Test Email Service ───────────────────────────────────────────────────────

class TestEmailService:
    """Test email sending service."""

    def test_is_not_configured_without_smtp(self):
        """is_configured should return False when SMTP is not set."""
        from services.email_service import EmailService
        assert EmailService.is_configured() is False

    def test_is_configured_with_smtp(self, monkeypatch):
        """is_configured should return True when SMTP is set."""
        import config
        monkeypatch.setattr(config.Config, 'SMTP_HOST', 'smtp.gmail.com')
        monkeypatch.setattr(config.Config, 'SMTP_USER', 'test@gmail.com')

        from services.email_service import EmailService
        assert EmailService.is_configured() is True

    def test_send_verification_email_without_smtp(self):
        """Should log instead of sending when SMTP is not configured."""
        from services.email_service import EmailService
        # Should not raise
        EmailService.send_verification_email(
            'test@example.com',
            'http://localhost/#/verify-email?token=abc',
        )


# ── Test Auth Routes (HTTP) ──────────────────────────────────────────────────

class TestAuthRoutesExtended:
    """Test the new HTTP auth endpoints."""

    @pytest.fixture
    def app(self):
        """Create a minimal Flask test app with auth routes registered."""
        from flask import Flask
        from flask_cors import CORS
        from routes.auth import register_auth_routes

        flask_app = Flask(__name__)
        CORS(flask_app)
        flask_app.config['TESTING'] = True
        register_auth_routes(flask_app)
        return flask_app

    def test_verify_email_endpoint_missing_token(self, app):
        """POST /api/auth/verify-email should reject missing token."""
        with app.test_client() as client:
            response = client.post('/api/auth/verify-email', json={})
            assert response.status_code == 400

    def test_resend_verification_missing_email(self, app):
        """POST /api/auth/resend-verification should reject missing email."""
        with app.test_client() as client:
            response = client.post('/api/auth/resend-verification', json={})
            assert response.status_code == 400

    def test_resend_verification_always_succeeds(self, app):
        """POST /api/auth/resend-verification should always return success
        (to prevent email enumeration)."""
        with app.test_client() as client:
            with patch('services.auth_service.AuthService.resend_verification', return_value=False):
                response = client.post('/api/auth/resend-verification', json={
                    'email': 'nonexistent@example.com',
                })
                assert response.status_code == 200

    def test_google_oauth_init_not_configured(self, app, monkeypatch):
        """POST /api/auth/google should return 503 when not configured."""
        import config
        monkeypatch.setattr(config.Config, 'GOOGLE_CLIENT_ID', '')
        monkeypatch.setattr(config.Config, 'GOOGLE_CLIENT_SECRET', '')

        with app.test_client() as client:
            response = client.post('/api/auth/google', json={})
            assert response.status_code == 503

    def test_google_oauth_callback_missing_code(self, app):
        """POST /api/auth/google/callback should reject missing code."""
        with app.test_client() as client:
            response = client.post('/api/auth/google/callback', json={})
            assert response.status_code == 400

    def test_login_returns_403_for_unverified(self, app):
        """POST /api/auth/login should return 403 for unverified email."""
        email = f"unverified-{uuid.uuid4().hex[:8]}@example.com"
        with app.test_client() as client:
            with patch('services.auth_service.AuthService.login', return_value={
                'error': 'email_not_verified',
                'email': email,
            }):
                response = client.post('/api/auth/login', json={
                    'email': email,
                    'password': 'TestPassword123',
                })
                assert response.status_code == 403
                data = response.get_json()
                assert data.get('code') == 'email_not_verified'
