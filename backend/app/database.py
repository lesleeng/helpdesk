"""
Database configuration and session management.
Uses SQLAlchemy ORM with PostgreSQL.
"""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
import logging

from app.config import settings


logger = logging.getLogger(__name__)

# SQLAlchemy base class for all models
Base = declarative_base()

# Database engine configuration
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Test connection before using
    echo=settings.DEBUG,  # Log SQL in debug mode
)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db():
    """
    Dependency for FastAPI routes.
    Provides database session and ensures cleanup.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in database."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")


def drop_tables():
    """Drop all tables in database (for testing/cleanup)."""
    Base.metadata.drop_all(bind=engine)
    logger.warning("All database tables dropped")


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Set PostgreSQL connection parameters if needed."""
    pass  # PostgreSQL-specific setup can go here
