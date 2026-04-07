"""Test fixtures for backend tests."""
import pytest
import os
import sys

# Add backend to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import scoped_session, sessionmaker
from models.schema import Base


@pytest.fixture
def client(monkeypatch):
    """Create a test client with a fresh in-memory database.
    
    Uses monkeypatch to safely override db_session at module level
    without affecting other tests running in parallel.
    
    IMPORTANT: We must patch SessionLocal (the sessionmaker) rather than just
    db_session, because db_session_scope() calls db_session() which wraps
    SessionLocal. If SessionLocal is bound to the original engine, patching
    db_session alone won't help — the scoped_session still delegates to the
    original SessionLocal. Instead, we create a new scoped_session bound to
    our test engine and patch db_session with it.
    """
    # Create a fresh in-memory engine for this test
    test_engine = create_engine('sqlite:///:memory:')
    
    # Create all tables in the test database
    Base.metadata.create_all(bind=test_engine)
    
    # Create a test-scoped session factory bound to the test engine
    test_session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    test_session = scoped_session(test_session_factory)
    
    # Patch db_session with our test session.
    # db_session_scope() calls db_session() which will now return our test session.
    import utils.db
    monkeypatch.setattr(utils.db, 'db_session', test_session)
    monkeypatch.setattr(utils.db, 'engine', test_engine)
    
    # Import app after patching so it picks up the test session
    from app import app
    app.config['TESTING'] = True
    
    yield app.test_client()
    
    # Cleanup: drop tables and remove scoped session
    Base.metadata.drop_all(bind=test_engine)
    test_session.remove()
