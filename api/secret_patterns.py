"""Enterprise secret detection patterns for repository scanning.

Pure data module -- no I/O.  Exports:
- ``SECRET_PATTERNS``: list of (compiled regex, rule_code, severity, title)
- ``is_ignored(line)``: True when the line carries a suppression comment
- ``SKIP_EXTENSIONS``: file extensions to skip (binary / media / font)
"""

from __future__ import annotations

import re
from typing import List, Tuple

# ── Extensions to skip (binary, media, font, compiled) ────────────
SKIP_EXTENSIONS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".webp", ".svg",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".class", ".jar",
    ".pyc", ".pyo", ".wasm",
    ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
    ".sqlite", ".db", ".lock",
})

# ── Suppression comments ──────────────────────────────────────────

_IGNORE_MARKERS = ("# nosec", "// nosec", "// nolint:secret", "# nw-ignore", "// nw-ignore")


def is_ignored(line: str) -> bool:
    """Return True when the line contains a recognised suppression comment."""
    lower = line.lower()
    return any(marker in lower for marker in _IGNORE_MARKERS)


# ── Patterns ──────────────────────────────────────────────────────
#
# Each entry: (compiled_regex, rule_code, severity, title)
#
# Organised by provider.  Rule codes are stable and never reused.

SECRET_PATTERNS: List[Tuple[re.Pattern, str, str, str]] = [
    # ── AWS (secret_001-003) ──────────────────────────────────────
    (
        re.compile(r"AKIA[0-9A-Z]{16}"),
        "secret_001",
        "critical",
        "AWS Access Key ID found",
    ),
    (
        re.compile(r"(?i)aws_secret_access_key\s*[=:]\s*[A-Za-z0-9/+=]{40}"),
        "secret_002",
        "critical",
        "AWS Secret Access Key found",
    ),
    (
        re.compile(r"(?i)aws_session_token\s*[=:]\s*[A-Za-z0-9/+=]{100,}"),
        "secret_003",
        "high",
        "AWS Session Token found",
    ),
    # ── GCP (secret_010-011) ──────────────────────────────────────
    (
        re.compile(r'"type"\s*:\s*"service_account"'),
        "secret_010",
        "critical",
        "GCP Service Account JSON key found",
    ),
    (
        re.compile(r"AIza[0-9A-Za-z_-]{35}"),
        "secret_011",
        "high",
        "Google API key found",
    ),
    # ── Azure (secret_015-016) ────────────────────────────────────
    (
        re.compile(
            r"(?i)(AccountKey|azure[_-]?storage[_-]?key)\s*[=:]\s*[A-Za-z0-9/+=]{44,}"
        ),
        "secret_015",
        "critical",
        "Azure Storage Account Key found",
    ),
    (
        re.compile(r"(?i)azure[_-]?subscription[_-]?key\s*[=:]\s*[0-9a-f]{32}"),
        "secret_016",
        "high",
        "Azure Subscription Key found",
    ),
    # ── GitHub (secret_020-022) ───────────────────────────────────
    (
        re.compile(r"ghp_[A-Za-z0-9_]{36,}"),
        "secret_020",
        "critical",
        "GitHub personal access token (classic) found",
    ),
    (
        re.compile(r"github_pat_[A-Za-z0-9_]{22,}"),
        "secret_021",
        "critical",
        "GitHub fine-grained personal access token found",
    ),
    (
        re.compile(r"ghs_[A-Za-z0-9_]{36,}"),
        "secret_022",
        "high",
        "GitHub Actions token found",
    ),
    # ── Stripe (secret_030-031) ───────────────────────────────────
    (
        re.compile(r"sk_live_[A-Za-z0-9]{24,}"),
        "secret_030",
        "critical",
        "Stripe live secret key found",
    ),
    (
        re.compile(r"sk_test_[A-Za-z0-9]{24,}"),
        "secret_031",
        "medium",
        "Stripe test secret key found",
    ),
    # ── Twilio (secret_035-036) ───────────────────────────────────
    (
        re.compile(r"SK[0-9a-fA-F]{32}"),
        "secret_035",
        "high",
        "Twilio API key found",
    ),
    (
        re.compile(r"(?i)twilio[_-]?auth[_-]?token\s*[=:]\s*[0-9a-f]{32}"),
        "secret_036",
        "critical",
        "Twilio Auth Token found",
    ),
    # ── SendGrid (secret_040) ────────────────────────────────────
    (
        re.compile(r"SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}"),
        "secret_040",
        "critical",
        "SendGrid API key found",
    ),
    # ── Slack (secret_045-047) ────────────────────────────────────
    (
        re.compile(r"xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}"),
        "secret_045",
        "critical",
        "Slack Bot token found",
    ),
    (
        re.compile(r"xoxp-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}"),
        "secret_046",
        "critical",
        "Slack User OAuth token found",
    ),
    (
        re.compile(r"xapp-[0-9]-[A-Za-z0-9]{10,}-[0-9]{13}-[A-Za-z0-9]{64}"),
        "secret_047",
        "high",
        "Slack App-level token found",
    ),
    # ── Discord (secret_050) ──────────────────────────────────────
    (
        re.compile(r"[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}"),
        "secret_050",
        "critical",
        "Discord bot token found",
    ),
    # ── Anthropic / OpenAI (secret_055-056) ───────────────────────
    (
        re.compile(r"sk-ant-[A-Za-z0-9_-]{40,}"),
        "secret_055",
        "critical",
        "Anthropic API key found",
    ),
    (
        re.compile(r"sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}"),
        "secret_056",
        "critical",
        "OpenAI API key found",
    ),
    # ── Certificates / Private keys (secret_060-061) ──────────────
    (
        re.compile(r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"),
        "secret_060",
        "critical",
        "Private key file detected",
    ),
    (
        re.compile(r"-----BEGIN CERTIFICATE-----"),
        "secret_061",
        "medium",
        "X.509 certificate found (check if self-signed)",
    ),
    # ── JWT (secret_065-066) ──────────────────────────────────────
    (
        re.compile(r"(?i)(jwt[_-]?secret|jwt[_-]?key)\s*[=:]\s*['\"][^'\"]{8,}['\"]"),
        "secret_065",
        "high",
        "JWT signing secret found",
    ),
    (
        re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
        "secret_066",
        "high",
        "Hardcoded JWT token found",
    ),
    # ── Database URLs (secret_070) ────────────────────────────────
    (
        re.compile(r"(?i)(mysql|postgres|postgresql|mongodb|redis|amqp)://[^\s'\"]+:[^\s'\"]+@"),
        "secret_070",
        "high",
        "Database connection URL with embedded credentials",
    ),
    # ── HTTP Basic Auth (secret_075) ──────────────────────────────
    (
        re.compile(r"https?://[^\s'\"]+:[^\s'\"]+@[^\s'\"]+"),
        "secret_075",
        "high",
        "HTTP Basic Auth credentials in URL",
    ),
    # ── Passwords (secret_080) ────────────────────────────────────
    (
        re.compile(r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{8,}['\"]"),
        "secret_080",
        "high",
        "Hardcoded password in source code",
    ),
    # ── OAuth client secrets (secret_085) ─────────────────────────
    (
        re.compile(r"(?i)(client[_-]?secret|oauth[_-]?secret)\s*[=:]\s*['\"][A-Za-z0-9_-]{10,}['\"]"),
        "secret_085",
        "high",
        "OAuth client secret found",
    ),
    # ── Generic API key / secret / token (secret_090) ─────────────
    (
        re.compile(r"(?i)(api[_-]?key|api[_-]?secret|auth[_-]?token)\s*[=:]\s*['\"][A-Za-z0-9_-]{20,}['\"]"),
        "secret_090",
        "high",
        "Generic API key or secret found",
    ),
]
