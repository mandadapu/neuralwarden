"""JWT authentication dependency for FastAPI endpoints."""

import logging
import os

import jwt
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

AUTH_SECRET = os.getenv("AUTH_SECRET", "")
if not AUTH_SECRET:
    logger.warning(
        "AUTH_SECRET is not set — all authenticated endpoints will reject requests. "
        "Set AUTH_SECRET in your environment or .env file."
    )


def validate_auth_config() -> None:
    """Fail fast in production when AUTH_SECRET is missing."""
    env = os.getenv("ENVIRONMENT", "development")
    if env == "production" and not AUTH_SECRET:
        raise RuntimeError(
            "AUTH_SECRET is required in production. "
            "Set AUTH_SECRET to a 32+ byte random secret."
        )


def get_current_user(request: Request) -> str:
    """Extract and verify user email from JWT Bearer token.

    Returns the verified user_email string.
    Raises 401 if token is missing/invalid/expired.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
        email = payload.get("email", "")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token: no email claim")
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
