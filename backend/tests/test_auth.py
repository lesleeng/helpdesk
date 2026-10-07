"""
Tests for authentication middleware and mock auth.
"""
import pytest
from app.auth_mock import verify_token_mock, create_demo_token, DEMO_USERS


@pytest.mark.asyncio
async def test_verify_token_mock_valid_user():
    """Test mock token verification with valid user token."""
    token = "demo-token-user-1"
    user = await verify_token_mock(token)

    assert user is not None
    assert user["id"] == "user-1"
    assert user["name"] == "John Smith"
    assert user["email"] == "john.smith@company.com"
    assert user["role"] == "user"


@pytest.mark.asyncio
async def test_verify_token_mock_valid_admin():
    """Test mock token verification with valid admin token."""
    token = "demo-token-admin-1"
    user = await verify_token_mock(token)

    assert user is not None
    assert user["id"] == "admin-1"
    assert user["role"] == "admin"


@pytest.mark.asyncio
async def test_verify_token_mock_invalid():
    """Test mock token verification with invalid token."""
    token = "invalid-token-xyz"
    user = await verify_token_mock(token)

    assert user is None


def test_create_demo_token_user():
    """Test creating demo token for user."""
    token = create_demo_token("user-1")
    assert token == "demo-token-user-1"


def test_create_demo_token_admin():
    """Test creating demo token for admin."""
    token = create_demo_token("admin-1")
    assert token == "demo-token-admin-1"


def test_create_demo_token_nonexistent():
    """Test creating token for nonexistent user."""
    token = create_demo_token("nonexistent-user")
    assert token is None


def test_auth_headers_user(client, auth_headers):
    """Test that health check endpoint requires no auth."""
    response = client.get("/health")
    assert response.status_code == 200


def test_auth_headers_missing(client):
    """Test request without authorization header."""
    response = client.post("/tickets")
    assert response.status_code == 401
    assert "Missing or invalid Authorization header" in response.json()["error"]


def test_auth_headers_invalid(client):
    """Test request with invalid authorization header."""
    response = client.post(
        "/tickets",
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401
    assert "Invalid or expired token" in response.json()["error"]
