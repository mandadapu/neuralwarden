"""Tests for the JWT auth dependency."""

from __future__ import annotations

import os
import time
from unittest.mock import MagicMock

import jwt
import pytest

# Set a test secret before importing the auth module
os.environ["AUTH_SECRET"] = "test-secret-key"

from api.auth import AUTH_SECRET, get_current_user


def _make_request(headers: dict | None = None) -> MagicMock:
    """Create a mock FastAPI Request with the given headers."""
    request = MagicMock()
    _headers = headers or {}
    request.headers = _headers
    return request


def _sign_token(payload: dict, secret: str = "test-secret-key", algorithm: str = "HS256") -> str:
    """Sign a JWT token with the given payload."""
    return jwt.encode(payload, secret, algorithm=algorithm)


def test_valid_token_returns_email():
    """Verify get_current_user decodes a valid HS256 JWT."""
    token = _sign_token({"email": "user@example.com", "sub": "user-123"})
    request = _make_request({"Authorization": f"Bearer {token}"})
    email = get_current_user(request)
    assert email == "user@example.com"


def test_missing_auth_header_returns_401():
    """Verify 401 when no Authorization header."""
    from fastapi import HTTPException

    request = _make_request({})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request)
    assert exc_info.value.status_code == 401
    assert "Missing" in exc_info.value.detail


def test_missing_bearer_prefix_returns_401():
    """Verify 401 when Authorization header lacks Bearer prefix."""
    from fastapi import HTTPException

    token = _sign_token({"email": "user@example.com"})
    request = _make_request({"Authorization": f"Token {token}"})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request)
    assert exc_info.value.status_code == 401


def test_invalid_token_returns_401():
    """Verify 401 for malformed tokens."""
    from fastapi import HTTPException

    request = _make_request({"Authorization": "Bearer not-a-real-jwt"})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request)
    assert exc_info.value.status_code == 401
    assert "Invalid" in exc_info.value.detail


def test_expired_token_returns_401():
    """Verify 401 for expired tokens."""
    from fastapi import HTTPException

    token = _sign_token({
        "email": "user@example.com",
        "exp": int(time.time()) - 3600,  # expired 1 hour ago
    })
    request = _make_request({"Authorization": f"Bearer {token}"})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_wrong_secret_returns_401():
    """Verify 401 when token is signed with a different secret."""
    from fastapi import HTTPException

    token = _sign_token({"email": "user@example.com"}, secret="wrong-secret")
    request = _make_request({"Authorization": f"Bearer {token}"})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request)
    assert exc_info.value.status_code == 401


def test_missing_email_claim_returns_401():
    """Verify 401 when token has no email claim."""
    from fastapi import HTTPException

    token = _sign_token({"sub": "user-123"})
    request = _make_request({"Authorization": f"Bearer {token}"})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request)
    assert exc_info.value.status_code == 401
    assert "no email" in exc_info.value.detail.lower()
