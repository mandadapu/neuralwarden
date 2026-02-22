"""Symmetric encryption helpers for secrets at rest (Fernet / AES-128-CBC)."""

import binascii
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")


def validate_encryption_config() -> None:
    """Fail fast if ENCRYPTION_KEY is missing in production.

    Called during app startup. In production (ENVIRONMENT=production),
    a missing or invalid key is a fatal misconfiguration.
    """
    env = os.getenv("ENVIRONMENT", "development")
    if env == "production" and not _ENCRYPTION_KEY:
        raise RuntimeError(
            "ENCRYPTION_KEY is required in production. "
            "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )
    if _ENCRYPTION_KEY:
        # Validate key format eagerly so we don't discover a bad key on first encrypt/decrypt
        try:
            Fernet(_ENCRYPTION_KEY.encode())
        except (ValueError, binascii.Error) as exc:
            raise RuntimeError(
                f"Invalid ENCRYPTION_KEY — must be a 32-byte URL-safe base64 string: {exc}"
            ) from exc


def _get_fernet() -> Fernet | None:
    """Return a Fernet instance if ENCRYPTION_KEY is configured."""
    if not _ENCRYPTION_KEY:
        return None
    try:
        return Fernet(_ENCRYPTION_KEY.encode())
    except (ValueError, binascii.Error):
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
