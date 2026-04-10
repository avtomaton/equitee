"""
Tests for the new dual-mode session management and tenant router middleware.

Covers:
- tenant_session() context manager in single mode
- @tenant_required decorator passthrough in single mode
- Full CRUD for expenses, income, tenants, events
- Statistics and export endpoints
"""

import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from models.schema import Base


class TestTenantSessionContextManager:
    """Test tenant_session() in single mode with isolated DB."""

    @pytest.fixture
    def test_engine(self):
        """Fresh in-memory engine."""
        engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=engine)
        yield engine
        Base.metadata.drop_all(bind=engine)

    @pytest.fixture
    def patched_db(self, monkeypatch, test_engine):
        """Patch utils.db to use test engine."""
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        yield test_session
        test_session.remove()

    def test_tenant_session_commit_on_read(self, patched_db):
        """Read operations should work with tenant_session()."""
        from utils.db import tenant_session
        from models.schema import Property

        with tenant_session() as session:
            count = session.query(Property).count()
            assert count == 0

    def test_tenant_session_commit_on_write(self, patched_db, test_engine):
        """Write operations should commit with tenant_session()."""
        from utils.db import tenant_session
        from models.schema import Property

        with tenant_session() as session:
            prop = Property(
                name='Session Test', type='Condo', province='ON',
                city='Toronto', address='1 Test St', postal_code='M1M',
                purchase_price=100, market_price=100, loan_amount=0,
                monthly_rent=10, poss_date='2024-01-01', status='Rented',
            )
            session.add(prop)
            session.flush()
            prop_id = prop.id

        # Verify data persisted after context exit using a new session
        new_session = scoped_session(sessionmaker(
            autocommit=False, autoflush=False, bind=test_engine
        ))
        try:
            found = new_session.get(Property, prop_id)
            assert found is not None
            assert found.name == 'Session Test'
        finally:
            new_session.remove()

    def test_tenant_session_rollback_on_exception(self, patched_db):
        """tenant_session() should rollback on exception."""
        from utils.db import tenant_session
        from models.schema import Property

        try:
            with tenant_session() as session:
                prop = Property(
                    name='Rollback Test', type='Condo', province='ON',
                    city='Toronto', address='1 Test St', postal_code='M1M',
                    purchase_price=100, market_price=100, loan_amount=0,
                    monthly_rent=10, poss_date='2024-01-01', status='Rented',
                )
                session.add(prop)
                session.flush()
                raise ValueError("Simulated error")
        except ValueError:
            pass

        # Verify data was rolled back
        with tenant_session() as session:
            count = session.query(Property).filter_by(name='Rollback Test').count()
            assert count == 0


class TestTenantRequiredDecorator:
    """Test @tenant_required in single mode."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Test client with fresh DB."""
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        yield app.test_client()
        test_session.remove()

    def test_tenant_required_allows_access(self, client):
        """In single mode, @tenant_required should allow all requests."""
        response = client.get('/api/properties')
        assert response.status_code == 200

    def test_all_routes_accessible_in_single_mode(self, client):
        """All data routes should be accessible in single mode (no auth needed)."""
        routes = [
            ('GET', '/api/properties'),
            ('GET', '/api/expenses'),
            ('GET', '/api/income'),
            ('GET', '/api/tenants'),
            ('GET', '/api/events'),
            ('GET', '/api/documents'),
            ('GET', '/api/statistics'),
            ('GET', '/api/export'),
        ]
        for method, path in routes:
            response = client.get(path)
            assert response.status_code not in (401, 403), \
                f"{method} {path} returned {response.status_code} — auth leak in single mode!"


class TestExpenseRoutes:
    """Full CRUD for expenses."""

    @pytest.fixture
    def client(self, monkeypatch):
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        c = app.test_client()

        # Create a property
        c.post('/api/properties', json={
            'name': 'Expense Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Exp St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 550000, 'loanAmount': 400000,
            'monthlyRent': 2500, 'possDate': '2024-01-01', 'status': 'Rented',
        })
        yield c
        test_session.remove()

    def test_expense_crud(self, client):
        """Full expense lifecycle — including the exp_type bug fix."""
        prop_id = 1

        # Create
        resp = client.post('/api/expenses', json={
            'propertyId': prop_id,
            'expenseDate': '2024-06-01',
            'amount': 150.00,
            'expenseType': 'Recurrent',
            'expenseCategory': 'Maintenance',
        })
        assert resp.status_code == 201
        exp_id = resp.get_json()['id']

        # Read — should only have our 1 expense
        resp = client.get('/api/expenses')
        expenses = resp.get_json()
        assert len(expenses) == 1
        assert expenses[0]['amount'] == 150.00

        # Update — this was the broken path (exp_type vs expense_type)
        resp = client.put(f'/api/expenses/{exp_id}', json={
            'propertyId': prop_id,
            'expenseDate': '2024-06-01',
            'amount': 200.00,
            'expenseType': 'One-off',
            'expenseCategory': 'Insurance',
        })
        assert resp.status_code == 200
        assert resp.get_json()['expense_type'] == 'One-off'
        assert resp.get_json()['expense_category'] == 'Insurance'

        # Delete
        resp = client.delete(f'/api/expenses/{exp_id}')
        assert resp.status_code == 200

        # Verify deleted
        resp = client.get('/api/expenses')
        assert len(resp.get_json()) == 0


class TestIncomeRoutes:
    """Full CRUD for income."""

    @pytest.fixture
    def client(self, monkeypatch):
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        c = app.test_client()

        c.post('/api/properties', json={
            'name': 'Income Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Inc St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 550000, 'loanAmount': 400000,
            'monthlyRent': 2500, 'possDate': '2024-01-01', 'status': 'Rented',
        })
        yield c
        test_session.remove()

    def test_income_crud(self, client):
        """Full income lifecycle."""
        # Create
        resp = client.post('/api/income', json={
            'propertyId': 1,
            'incomeDate': '2024-07-01',
            'amount': 2500.00,
            'incomeType': 'Rent',
        })
        assert resp.status_code == 201
        inc_id = resp.get_json()['id']

        # Read
        resp = client.get('/api/income')
        assert len(resp.get_json()) == 1

        # Update
        resp = client.put(f'/api/income/{inc_id}', json={
            'propertyId': 1,
            'incomeDate': '2024-07-01',
            'amount': 2700.00,
            'incomeType': 'Rent',
        })
        assert resp.status_code == 200
        assert resp.get_json()['amount'] == 2700.00

        # Delete
        resp = client.delete(f'/api/income/{inc_id}')
        assert resp.status_code == 200


class TestEventsRoutes:
    """CRUD for events."""

    @pytest.fixture
    def client(self, monkeypatch):
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        c = app.test_client()

        c.post('/api/properties', json={
            'name': 'Events Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Ev St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 550000, 'loanAmount': 400000,
            'monthlyRent': 2500, 'possDate': '2024-01-01', 'status': 'Rented',
        })
        yield c
        test_session.remove()

    def test_events_auto_created_on_property_update(self, client):
        """Updating a property should auto-create events for changed fields."""
        resp = client.put('/api/properties/1', json={
            'name': 'Events Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Ev St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 600000,  # Changed
            'loanAmount': 400000, 'monthlyRent': 2500,
            'possDate': '2024-01-01', 'status': 'Rented',
        })
        assert resp.status_code == 200

        resp = client.get('/api/events?property_id=1')
        events = resp.get_json()
        assert len(events) >= 1
        assert any(e['column_name'] == 'market_price' for e in events)

    def test_event_description_update(self, client):
        """Should be able to update event description."""
        client.put('/api/properties/1', json={
            'name': 'Events Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Ev St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 700000,
            'loanAmount': 400000, 'monthlyRent': 2500,
            'possDate': '2024-01-01', 'status': 'Rented',
        })

        resp = client.get('/api/events?property_id=1')
        events = resp.get_json()
        event_id = events[0]['id']

        resp = client.put(f'/api/events/{event_id}', json={
            'description': 'Updated description'
        })
        assert resp.status_code == 200
        assert resp.get_json()['description'] == 'Updated description'


class TestStatisticsAndExport:
    """Test statistics and export endpoints."""

    @pytest.fixture
    def client(self, monkeypatch):
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        c = app.test_client()

        # Create property
        c.post('/api/properties', json={
            'name': 'Stats Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Stats St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 600000, 'loanAmount': 400000,
            'monthlyRent': 2500, 'possDate': '2024-01-01', 'status': 'Rented',
        })
        # Create expense
        c.post('/api/expenses', json={
            'propertyId': 1, 'expenseDate': '2024-01-01',
            'amount': 1000, 'expenseType': 'Recurrent', 'expenseCategory': 'Maintenance',
        })
        # Create income
        c.post('/api/income', json={
            'propertyId': 1, 'incomeDate': '2024-01-01',
            'amount': 2500, 'incomeType': 'Rent',
        })

        yield c
        test_session.remove()

    def test_statistics(self, client):
        """Statistics endpoint should return correct aggregates."""
        resp = client.get('/api/statistics')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['propertyCount'] == 1
        assert data['totalRevenue'] == 2500.0
        assert data['totalExpenses'] == 1000.0
        assert data['netProfit'] == 1500.0

    def test_export(self, client):
        """Export endpoint should return full data."""
        resp = client.get('/api/export')
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]['name'] == 'Stats Property'
        assert len(data[0]['expenses']) == 1
        assert len(data[0]['income']) == 1


class TestAggregateCorrectness:
    """Regression tests for Cartesian product bugs in aggregate queries.

    When a property has multiple income records AND multiple expense records,
    a naive OUTER JOIN produces a cross product that inflates both sums.
    These tests verify that /api/properties and /api/statistics return
    correct totals regardless of row counts.
    """

    @pytest.fixture
    def client(self, monkeypatch):
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        c = app.test_client()

        # Create a property
        c.post('/api/properties', json={
            'name': 'Aggregate Test Property', 'type': 'Condo', 'province': 'ON',
            'city': 'Toronto', 'address': '1 Agg St', 'postalCode': 'M1M 1A1',
            'purchasePrice': 500000, 'marketPrice': 600000, 'loanAmount': 400000,
            'monthlyRent': 2500, 'possDate': '2024-01-01', 'status': 'Rented',
        })

        # Create multiple income records (3 records, total = 7500)
        for amount, income_type in [(2500, 'Rent'), (3000, 'Rent'), (2000, 'Deposit')]:
            c.post('/api/income', json={
                'propertyId': 1, 'incomeDate': '2024-01-01',
                'amount': amount, 'incomeType': income_type,
            })

        # Create multiple expense records (4 records, total = 4000)
        for amount, category in [(1000, 'Maintenance'), (500, 'Insurance'), (1500, 'Tax'), (1000, 'Utilities')]:
            c.post('/api/expenses', json={
                'propertyId': 1, 'expenseDate': '2024-01-01',
                'amount': amount, 'expenseType': 'Recurrent', 'expenseCategory': category,
            })

        yield c
        test_session.remove()

    def test_property_totals_no_cartesian_inflation(self, client):
        """GET /api/properties should return correct totals even with
        multiple income AND expense rows (Cartesian product trap)."""
        resp = client.get('/api/properties')
        assert resp.status_code == 200
        props = resp.get_json()
        assert len(props) == 1

        prop = props[0]
        # 2500 + 3000 + 2000 = 7500 (NOT 7500 * 4 = 30000)
        assert prop['total_income'] == pytest.approx(7500.0)
        # 1000 + 500 + 1500 + 1000 = 4000 (NOT 4000 * 3 = 12000)
        assert prop['total_expenses'] == pytest.approx(4000.0)

    def test_single_property_totals_no_cartesian_inflation(self, client):
        """GET /api/properties/:id should return correct totals."""
        resp = client.get('/api/properties/1')
        assert resp.status_code == 200
        prop = resp.get_json()

        assert prop['total_income'] == pytest.approx(7500.0)
        assert prop['total_expenses'] == pytest.approx(4000.0)

    def test_statistics_no_cartesian_inflation(self, client):
        """GET /api/statistics should return correct aggregates without
        Cartesian product inflation from JOIN-based queries."""
        resp = client.get('/api/statistics')
        assert resp.status_code == 200
        data = resp.get_json()

        assert data['totalRevenue'] == pytest.approx(7500.0)
        assert data['totalExpenses'] == pytest.approx(4000.0)
        assert data['netProfit'] == pytest.approx(3500.0)

    def test_properties_and_statistics_consistent(self, client):
        """The sum of per-property totals should match statistics totals."""
        props_resp = client.get('/api/properties')
        stats_resp = client.get('/api/statistics')

        props = props_resp.get_json()
        stats = stats_resp.get_json()

        sum_income = sum(p['total_income'] for p in props)
        sum_expense = sum(p['total_expenses'] for p in props)

        assert sum_income == pytest.approx(stats['totalRevenue'])
        assert sum_expense == pytest.approx(stats['totalExpenses'])


class TestPublicEndpoints:
    """Test public endpoints don't require auth."""

    @pytest.fixture
    def client(self, monkeypatch):
        test_engine = create_engine('sqlite:///:memory:')
        Base.metadata.create_all(bind=test_engine)
        test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
        test_session = scoped_session(test_session_factory)

        import utils.db
        monkeypatch.setattr(utils.db, 'db_session', test_session)
        monkeypatch.setattr(utils.db, 'engine', test_engine)

        from app import app
        app.config['TESTING'] = True
        yield app.test_client()
        test_session.remove()

    def test_health_no_auth(self, client):
        resp = client.get('/api/health')
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'healthy'

    def test_index_no_auth(self, client):
        resp = client.get('/')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'name' in data

    def test_document_types_no_auth(self, client):
        """Document types endpoint should be public."""
        resp = client.get('/api/documents/types')
        assert resp.status_code == 200
        types = resp.get_json()
        assert isinstance(types, list)
        assert 'Lease' in types
        assert 'Receipt' in types
