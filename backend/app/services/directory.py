"""User directory seam: names/emails/staff lists come from the workmate's system.

Mock mode reads the demo users. Production mode is not integrated yet, because the
workmate's user API is not known; it degrades safely (no emails, staff list unavailable).
"""
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.auth_mock import DEMO_USERS
from app.config import settings


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    if settings.AUTH_MODE == "mock":
        return next((u for u in DEMO_USERS.values() if u["id"] == user_id), None)
    return None


def list_staff() -> List[Dict[str, Any]]:
    if settings.AUTH_MODE == "mock":
        return [u for u in DEMO_USERS.values() if u["role"] in ("admin", "tech")]
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Staff directory is not integrated with the main system yet",
    )


def get_manager(user_id: str) -> Optional[Dict[str, Any]]:
    """The person who approves this user's access/license requests (None if unknown)."""
    user = get_user(user_id)
    manager_id = user.get("manager_id") if user else None
    return get_user(manager_id) if manager_id else None
