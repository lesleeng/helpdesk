"""
Mock authentication service for development.
Simulates workmate's auth system with demo users.
Can be replaced with real auth when WORKMATE_AUTH_URL is available.
"""
from typing import Optional, Dict, Any


DEMO_USERS = {
    "demo-token-user-1": {
        "id": "user-1",
        "name": "John Smith",
        "email": "john.smith@company.com",
        "department": "IT Support",
        "role": "user",
    },
    "demo-token-user-2": {
        "id": "user-2",
        "name": "Jane Doe",
        "email": "jane.doe@company.com",
        "department": "Finance",
        "role": "user",
    },
    "demo-token-admin-1": {
        "id": "admin-1",
        "name": "Admin User",
        "email": "admin@company.com",
        "department": "IT Support",
        "role": "admin",
    },
}


async def verify_token_mock(token: str) -> Optional[Dict[str, Any]]:
    """
    Mock token verification function.
    In production, this would call workmate's auth service.

    Demo tokens format: "demo-token-{role}-{number}"
    Example: "demo-token-user-1" returns user profile
    """
    if token in DEMO_USERS:
        return DEMO_USERS[token]
    return None


def create_demo_token(user_id: str) -> str:
    """Create a demo token for testing (development only)."""
    for token, user_data in DEMO_USERS.items():
        if user_data["id"] == user_id:
            return token
    return None
