"""
Pytest fixtures for testing.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db


# In-memory SQLite shared across threads (TestClient runs sync routes in a threadpool)
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """Create tables and provide test database session."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """Provide test client with mock database."""

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def seeded(db):
    """Seed categories/subcategories; returns the first category."""
    from app.seed import seed_categories
    from app.models.category import TicketCategory

    seed_categories(db)
    return db.query(TicketCategory).order_by(TicketCategory.id).first()


@pytest.fixture
def manager_headers():
    return {"Authorization": "Bearer demo-token-manager-1"}


@pytest.fixture
def tech_headers():
    return {"Authorization": "Bearer demo-token-tech-1"}


@pytest.fixture
def tech2_headers():
    return {"Authorization": "Bearer demo-token-tech-2"}


@pytest.fixture
def user2_headers():
    return {"Authorization": "Bearer demo-token-user-2"}


@pytest.fixture
def auth_headers():
    """Provide authorization headers with demo token."""
    return {"Authorization": "Bearer demo-token-user-1"}


@pytest.fixture
def admin_auth_headers():
    """Provide authorization headers with demo admin token."""
    return {"Authorization": "Bearer demo-token-admin-1"}
