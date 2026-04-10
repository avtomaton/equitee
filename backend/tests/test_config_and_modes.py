"""
Tests for configuration and dual-mode setup.

These tests verify that:
1. Single mode works with SQLite (default behavior)
2. Config validation catches misconfiguration
3. The app starts correctly in single mode

Config validation tests use subprocess isolation to avoid polluting
the running test process's module state.
"""

import os
import subprocess
import sys
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestConfigValidation:
    """Test config validation in isolated subprocesses.

    Each test runs a fresh Python process so config module state
    doesn't leak between tests.
    """

    def _run_config_check(self, env_overrides=None, expect_fail=False):
        """Run a subprocess that imports Config and calls validate()."""
        env = os.environ.copy()
        if env_overrides:
            env.update(env_overrides)
        # Remove env vars we don't want to inherit
        for key in ['TENANCY_MODE', 'DATABASE_URL', 'JWT_SECRET']:
            env.pop(key, None)
        if env_overrides:
            env.update(env_overrides)

        code = "from config import Config; Config.validate(); print('OK')"
        result = subprocess.run(
            [sys.executable, '-c', code],
            capture_output=True, text=True, cwd=BACKEND, env=env,
        )
        if expect_fail:
            assert result.returncode != 0, f"Expected failure but got: {result.stdout}"
            return result.stderr
        else:
            assert result.returncode == 0, f"Expected OK but got: {result.stderr}"
            return result.stdout

    def test_default_config_is_single_mode(self):
        """Default TENANCY_MODE should be 'single' with SQLite."""
        output = self._run_config_check()
        assert 'OK' in output

    def test_saas_mode_requires_postgresql(self):
        """SaaS mode should reject SQLite database URLs."""
        stderr = self._run_config_check({
            'TENANCY_MODE': 'saas',
            'DATABASE_URL': 'sqlite:///test.db',
            'JWT_SECRET': 'test_secret',
        }, expect_fail=True)
        assert 'PostgreSQL' in stderr

    def test_saas_mode_requires_jwt_secret(self):
        """SaaS mode should reject empty JWT_SECRET."""
        stderr = self._run_config_check({
            'TENANCY_MODE': 'saas',
            'DATABASE_URL': 'postgresql://user:pass@localhost/test',
        }, expect_fail=True)
        assert 'JWT_SECRET' in stderr

    def test_invalid_tenancy_mode(self):
        """Invalid TENANCY_MODE should raise an error."""
        stderr = self._run_config_check({
            'TENANCY_MODE': 'invalid',
        }, expect_fail=True)
        assert 'Invalid TENANCY_MODE' in stderr


class TestSingleModeApp:
    """Test that the app works in single/self-hosted mode (SQLite)."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Test client with a fresh isolated in-memory database."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import scoped_session, sessionmaker
        from models.schema import Base

        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)

        test_session_factory = sessionmaker(
            autocommit=False, autoflush=False, bind=test_engine
        )
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True

        yield app.test_client()

        test_session.remove()

    def test_health_check(self, client):
        response = client.get('/api/health')
        assert response.status_code == 200
        assert response.get_json()['status'] == 'healthy'

    def test_index(self, client):
        response = client.get('/')
        assert response.status_code == 200
        assert 'name' in response.get_json()

    def test_auth_routes_not_registered(self, client):
        """Auth routes should NOT exist in single mode."""
        assert client.post('/api/auth/register', json={}).status_code == 404
        assert client.post('/api/auth/login', json={}).status_code == 404

    def test_properties_crud(self, client):
        """Basic property CRUD should work in single mode."""
        prop_data = {
            'name': 'Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '123 Test St', 'postalCode': 'M5V 1A1',
            'purchasePrice': 500000, 'marketPrice': 550000, 'loanAmount': 400000,
            'monthlyRent': 2500, 'possDate': '2024-01-01', 'status': 'Rented',
        }
        resp = client.post('/api/properties', json=prop_data)
        assert resp.status_code == 201
        prop_id = resp.get_json()['id']

        assert client.get(f'/api/properties/{prop_id}').status_code == 200
        assert client.put(f'/api/properties/{prop_id}', json={**prop_data, 'marketPrice': 600000}).status_code == 200
        assert client.delete(f'/api/properties/{prop_id}').status_code == 200
