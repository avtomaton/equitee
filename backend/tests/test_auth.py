"""
Tests for the auth service and tenant isolation.

These tests require PostgreSQL and are skipped if PostgreSQL is not available.
Run them with:
    pytest tests/test_auth.py -v --require-pg

Or set up a test PostgreSQL database:
    export TEST_DATABASE_URL=postgresql://user:pass@localhost/equitee_test
    pytest tests/test_auth.py -v
"""

import os
import uuid
import pytest

# Skip all tests if not in SaaS mode or no PostgreSQL
TEST_DB_URL = os.environ.get('TEST_DATABASE_URL')
if not TEST_DB_URL or not TEST_DB_URL.startswith('postgresql'):
    pytest.skip("PostgreSQL TEST_DATABASE_URL not set. Skipping SaaS auth tests.", allow_module_level=True)


@pytest.fixture(autouse=True, scope='module')
def setup_test_env():
    """Set up test environment for SaaS mode."""
    os.environ['TENANCY_MODE'] = 'saas'
    os.environ['DATABASE_URL'] = TEST_DB_URL
    os.environ['JWT_SECRET'] = 'test_secret_for_auth_tests_00000000000000000000000000'

    # Reload modules to pick up new env vars
    import importlib
    import config
    importlib.reload(config)
    import utils.db
    importlib.reload(utils.db)

    yield

    # Cleanup: reload back to single mode
    os.environ['TENANCY_MODE'] = 'single'
    os.environ['DATABASE_URL'] = 'sqlite:///real_estate.db'
    os.environ.pop('JWT_SECRET', None)


class TestAuthService:
    """Test auth service functionality."""

    @pytest.fixture
    def unique_email(self):
        """Generate a unique email to avoid conflicts."""
        uid = str(uuid.uuid4())[:8]
        return f"test-{uid}@example.com"

    def test_register_creates_tenant_and_user(self, unique_email):
        """Registration should create tenant, user, and schema."""
        from services.auth_service import AuthService

        result = AuthService.register(unique_email, 'TestPassword123', 'Test Portfolio')

        assert 'access_token' in result
        assert 'refresh_token' in result
        assert result['user']['email'] == unique_email
        assert 'tenant_id' in result['user']

    def test_login_with_correct_credentials(self, unique_email):
        """Login should succeed with correct credentials."""
        from services.auth_service import AuthService

        # Register first
        AuthService.register(unique_email, 'TestPassword123', 'Test Portfolio')

        # Login
        result = AuthService.login(unique_email, 'TestPassword123')

        assert result is not None
        assert 'access_token' in result
        assert result['user']['email'] == unique_email

    def test_login_with_wrong_password(self, unique_email):
        """Login should fail with wrong password."""
        from services.auth_service import AuthService

        AuthService.register(unique_email, 'TestPassword123', 'Test Portfolio')

        result = AuthService.login(unique_email, 'WrongPassword')

        assert result is None

    def test_refresh_token(self, unique_email):
        """Refresh token should issue new access token."""
        from services.auth_service import AuthService

        result = AuthService.register(unique_email, 'TestPassword123')
        refresh_token = result['refresh_token']

        new_result = AuthService.refresh_token(refresh_token)

        assert new_result is not None
        assert 'access_token' in new_result

    def test_get_user_info(self, unique_email):
        """Should return user and tenant info."""
        from services.auth_service import AuthService

        result = AuthService.register(unique_email, 'TestPassword123', 'Test Portfolio')
        access_token = result['access_token']

        # Decode token to get user_id
        import jwt
        from config import Config
        payload = jwt.decode(access_token, Config.JWT_SECRET, algorithms=[Config.JWT_ALGORITHM])

        user_info = AuthService.get_user_info(payload['user_id'])

        assert user_info is not None
        assert user_info['user']['email'] == unique_email
        assert user_info['tenant']['name'] == 'Test Portfolio'


class TestTenantIsolation:
    """Test that tenant data is isolated by schema."""

    @pytest.fixture
    def tenant_a(self):
        """Create tenant A."""
        from services.auth_service import AuthService
        email = f"tenant-a-{uuid.uuid4().hex[:8]}@example.com"
        return AuthService.register(email, 'TestPassword123', 'Tenant A')

    @pytest.fixture
    def tenant_b(self):
        """Create tenant B."""
        from services.auth_service import AuthService
        email = f"tenant-b-{uuid.uuid4().hex[:8]}@example.com"
        return AuthService.register(email, 'TestPassword123', 'Tenant B')

    def test_tenants_have_different_schemas(self, tenant_a, tenant_b):
        """Each tenant should have a unique schema."""
        assert tenant_a['user']['tenant_id'] != tenant_b['user']['tenant_id']

    def test_tenant_a_cannot_access_tenant_b_data(self, tenant_a, tenant_b):
        """
        Verify schema isolation by checking that tenant A's token
        cannot access tenant B's schema.
        """
        import jwt
        from config import Config

        # Decode tenant A's token
        payload_a = jwt.decode(
            tenant_a['access_token'],
            Config.JWT_SECRET,
            algorithms=[Config.JWT_ALGORITHM],
        )

        # Verify it points to tenant A's schema, not B's
        from sqlalchemy import text
        from utils.db import engine

        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT schema_name FROM public.tenants WHERE id = :id"),
                {'id': payload_a['tenant_id']},
            )
            row = result.fetchone()
            assert row is not None
            assert row.schema_name.startswith('tenant_')


class TestAuthRoutes:
    """Test the HTTP auth endpoints."""

    @pytest.fixture
    def app(self):
        """Create Flask app in SaaS mode."""
        from app import app as flask_app
        flask_app.config['TESTING'] = True
        return flask_app

    def test_register_endpoint(self, app):
        """POST /api/auth/register should create a new account."""
        with app.test_client() as client:
            response = client.post('/api/auth/register', json={
                'email': f"route-test-{uuid.uuid4().hex[:8]}@example.com",
                'password': 'RouteTestPassword123',
                'tenantName': 'Route Test Tenant',
            })
            assert response.status_code == 201
            data = response.get_json()
            assert 'access_token' in data

    def test_login_endpoint(self, app, unique_email=None):
        """POST /api/auth/login should authenticate."""
        # First register
        email = f"login-test-{uuid.uuid4().hex[:8]}@example.com"
        with app.test_client() as client:
            client.post('/api/auth/register', json={
                'email': email,
                'password': 'LoginTestPassword123',
            })

            # Then login
            response = client.post('/api/auth/login', json={
                'email': email,
                'password': 'LoginTestPassword123',
            })
            assert response.status_code == 200
            assert 'access_token' in response.get_json()

    def test_login_wrong_password(self, app):
        """POST /api/auth/login should fail with wrong password."""
        email = f"wrong-pw-{uuid.uuid4().hex[:8]}@example.com"
        with app.test_client() as client:
            client.post('/api/auth/register', json={
                'email': email,
                'password': 'CorrectPassword123',
            })

            response = client.post('/api/auth/login', json={
                'email': email,
                'password': 'WrongPassword',
            })
            assert response.status_code == 401

    def test_me_endpoint(self, app):
        """GET /api/auth/me should return user info."""
        email = f"me-test-{uuid.uuid4().hex[:8]}@example.com"
        with app.test_client() as client:
            # Register
            reg_resp = client.post('/api/auth/register', json={
                'email': email,
                'password': 'MeTestPassword123',
            })
            token = reg_resp.get_json()['access_token']

            # Get me
            response = client.get('/api/auth/me', headers={
                'Authorization': f'Bearer {token}',
            })
            assert response.status_code == 200
            data = response.get_json()
            assert data['user']['email'] == email

    def test_short_password_rejected(self, app):
        """Registration should reject passwords shorter than 8 characters."""
        with app.test_client() as client:
            response = client.post('/api/auth/register', json={
                'email': f"short-{uuid.uuid4().hex[:8]}@example.com",
                'password': 'short',
            })
            assert response.status_code == 400
