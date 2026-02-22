"""Symmetric encryption helpers for secrets at rest (Fernet / AES-128-CBC)."""

import base64
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")


def _get_fernet() -> Fernet | None:
    """Return a Fernet instance if ENCRYPTION_KEY is configured."""
    if not _ENCRYPTION_KEY:
        return None
    try:
        return Fernet(_ENCRYPTION_KEY.encode())
    except Exception:
        logger.error("Invalid ENCRYPTION_KEY — must be a 32-byte URL-safe base64 string")
        return None


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns 'enc:' prefixed ciphertext, or plaintext if no key."""
    if not plaintext:
        return plaintext
    f = _get_fernet()
    if not f:
        return plaintext
    token = f.encrypt(plaintext.encode())
    return "enc:" + token.decode()


def decrypt(value: str) -> str:
    """Decrypt an 'enc:' prefixed value. Returns as-is if not encrypted or no key."""
    if not value or not value.startswith("enc:"):
        return value
    f = _get_fernet()
    if not f:
        logger.warning("Cannot decrypt — ENCRYPTION_KEY not set")
        return value
    try:
        return f.decrypt(value[4:].encode()).decode()
    except InvalidToken:
        logger.error("Failed to decrypt value — wrong key or corrupted data")
        return value


def generate_key() -> str:
    """Generate a new Fernet key. Run once: python -c 'from api.encryption import generate_key; print(generate_key())'"""
    return Fernet.generate_key().decode()
