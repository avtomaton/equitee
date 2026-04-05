import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from contextlib import contextmanager

# Database configuration
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///real_estate.db')

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {},
    pool_pre_ping=True,
    pool_recycle=300
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db_session = scoped_session(SessionLocal)


@contextmanager
def db_session_scope():
    """Provide a transactional scope around a series of operations."""
    session = db_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session():
    """Get a new database session."""
    return db_session()


def init_db():
    """Initialize database schema."""
    from models.schema import Base
    Base.metadata.create_all(bind=engine)
    print("✅ Database initialized successfully!")


def row_to_dict(row):
    """Legacy compatibility - use model.to_dict() instead for new code"""
    return dict(row)


class NotFoundError(Exception):
    """Raised when a requested resource doesn't exist."""
    pass


def require_exists(session, model, resource_id, label):
    """Raise NotFoundError if the row doesn't exist."""
    instance = session.query(model).get(resource_id)
    if not instance:
        raise NotFoundError(f'{label} not found')
    return instance
