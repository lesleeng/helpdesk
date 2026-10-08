"""
Authentication middleware for FastAPI.
Routes between mock auth (development) and production auth based on AUTH_MODE setting.
"""
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from typing import Optional, Dict, Any
import httpx

from app.config import settings
from app.auth_mock import verify_token_mock


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Validates JWT tokens from workmate's auth system.
    Attaches user context to request.state.user
    """

    async def dispatch(self, request: Request, call_next):
        # Skip auth for health check and docs endpoints
        if request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)

        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"error": "Missing or invalid Authorization header"},
            )

        token = auth_header[7:]  # Remove "Bearer " prefix

        # Verify token based on AUTH_MODE
        if settings.AUTH_MODE == "mock":
            user = await verify_token_mock(token)
        else:
            user = await validate_with_workmate(token)

        if not user:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"error": "Invalid or expired token"},
            )

        request.state.user = user
        response = await call_next(request)
        return response


async def validate_with_workmate(token: str) -> Optional[Dict[str, Any]]:
    """
    Validate token with workmate's auth service (production).
    Queries workmate's auth endpoint and user database.
    """
    try:
        # Validate token at workmate's auth endpoint
        async with httpx.AsyncClient() as client:
            auth_response = await client.post(
                f"{settings.WORKMATE_AUTH_URL}/validate", json={"token": token}, timeout=5.0
            )

        if auth_response.status_code != 200:
            return None

        # Get user info from response
        user_data = auth_response.json()
        return {
            "id": user_data.get("user_id"),
            "name": user_data.get("name"),
            "email": user_data.get("email"),
            "department": user_data.get("department"),
            "role": user_data.get("role", "user"),
        }
    except httpx.HTTPError:
        return None


def get_current_user(request: Request) -> Dict[str, Any]:
    """Extract current user from request context."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def require_admin(request: Request) -> Dict[str, Any]:
    """Extract current user and verify admin role."""
    user = get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


STAFF_ROLES = ("admin", "tech")


def require_staff(request: Request) -> Dict[str, Any]:
    """Extract current user and verify an IT staff role (admin or tech)."""
    user = get_current_user(request)
    if user.get("role") not in STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return user
