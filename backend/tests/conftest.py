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


class FakeMessages:
    """Stands in for client.messages: records calls, returns a canned parsed answer."""

    def __init__(self, parsed=None, stop_reason="end_turn", error=None):
        self.parsed, self.stop_reason, self.error, self.calls = parsed, stop_reason, error, []

    def parse(self, **kwargs):
        from types import SimpleNamespace

        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            parsed_output=self.parsed,
            stop_reason=self.stop_reason,
            usage=SimpleNamespace(input_tokens=10, output_tokens=5),
        )


@pytest.fixture
def ai(monkeypatch):
    """Enable AI with a configurable fake client; call the fixture to set its behaviour."""
    from types import SimpleNamespace

    from app.config import settings
    from app.services import ai_service

    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(settings, "ENABLE_AI_FEATURES", True)
    ai_service._calls.clear()
    holder = {}

    def configure(**kw):
        holder["messages"] = FakeMessages(**kw)
        monkeypatch.setattr(
            ai_service, "get_client", lambda: SimpleNamespace(messages=holder["messages"])
        )
        return holder["messages"]

    return configure
