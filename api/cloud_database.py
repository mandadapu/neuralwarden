"""SQLite persistence for cloud monitoring: accounts, assets, issues, checks."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone

DB_PATH = os.getenv("NEURALWARDEN_DB_PATH", "data/neuralwarden.db")

# ── Severity ordering (lower = more severe) ─────────────────────────

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

# ── Connection helper ────────────────────────────────────────────────


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection, creating the DB directory if needed."""
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── Schema initialisation ───────────────────────────────────────────

_CREATE_CLOUD_ACCOUNTS = """
CREATE TABLE IF NOT EXISTS cloud_accounts (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    provider TEXT DEFAULT 'gcp',
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    purpose TEXT DEFAULT 'production',
    credentials_json TEXT DEFAULT '',
    services TEXT DEFAULT '[]',
    last_scan_at TEXT,
    created_at TEXT NOT NULL,
    status TEXT DEFAULT 'active'
)
"""

_CREATE_CLOUD_ASSETS = """
CREATE TABLE IF NOT EXISTS cloud_assets (
    id TEXT PRIMARY KEY,
    cloud_account_id TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    name TEXT NOT NULL,
    region TEXT DEFAULT '',
    metadata_json TEXT DEFAULT '{}',
    discovered_at TEXT NOT NULL,
    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id)
)
"""

_CREATE_CLOUD_ISSUES = """
CREATE TABLE IF NOT EXISTS cloud_issues (
    id TEXT PRIMARY KEY,
    cloud_account_id TEXT NOT NULL,
    asset_id TEXT,
    rule_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    severity TEXT NOT NULL,
    location TEXT DEFAULT '',
    fix_time TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    discovered_at TEXT NOT NULL,
    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id),
    FOREIGN KEY (asset_id) REFERENCES cloud_assets(id)
)
"""

_CREATE_CLOUD_CHECKS = """
CREATE TABLE IF NOT EXISTS cloud_checks (
    id TEXT PRIMARY KEY,
    provider TEXT DEFAULT 'gcp',
    rule_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'standard',
    check_function TEXT NOT NULL
)
"""


def init_cloud_tables() -> None:
    """Create all cloud monitoring tables if they don't exist."""
    conn = _get_conn()
    try:
        conn.execute(_CREATE_CLOUD_ACCOUNTS)
        conn.execute(_CREATE_CLOUD_ASSETS)
        conn.execute(_CREATE_CLOUD_ISSUES)
        conn.execute(_CREATE_CLOUD_CHECKS)
        conn.commit()
    finally:
        conn.close()


# ── Cloud accounts CRUD ─────────────────────────────────────────────


def create_cloud_account(
    user_email: str,
    provider: str = "gcp",
    name: str = "",
    project_id: str = "",
    purpose: str = "production",
    credentials_json: str = "",
    services: str = "[]",
) -> str:
    """Create a cloud account and return its ID."""
    account_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO cloud_accounts
               (id, user_email, provider, name, project_id, purpose,
                credentials_json, services, created_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')""",
            (
                account_id,
                user_email,
                provider,
                name,
                project_id,
                purpose,
                credentials_json,
                services if isinstance(services, str) else json.dumps(services),
                now,
            ),
        )
        conn.commit()
        return account_id
    finally:
        conn.close()


def list_cloud_accounts(user_email: str) -> list[dict]:
    """List all cloud accounts for a given user."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM cloud_accounts WHERE user_email = ? ORDER BY created_at DESC",
            (user_email,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_cloud_account(account_id: str) -> dict | None:
    """Get a cloud account by ID, or None."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM cloud_accounts WHERE id = ?", (account_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


_ALLOWED_ACCOUNT_FIELDS = {
    "name",
    "purpose",
    "credentials_json",
    "services",
    "status",
    "last_scan_at",
}


def update_cloud_account(account_id: str, **fields) -> None:
    """Update allowed fields on a cloud account."""
    updates = {k: v for k, v in fields.items() if k in _ALLOWED_ACCOUNT_FIELDS}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [account_id]
    conn = _get_conn()
    try:
        conn.execute(
            f"UPDATE cloud_accounts SET {set_clause} WHERE id = ?",
            values,
        )
        conn.commit()
    finally:
        conn.close()


def delete_cloud_account(account_id: str) -> None:
    """Delete an account and cascade-delete its assets and issues."""
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM cloud_issues WHERE cloud_account_id = ?", (account_id,))
        conn.execute("DELETE FROM cloud_assets WHERE cloud_account_id = ?", (account_id,))
        conn.execute("DELETE FROM cloud_accounts WHERE id = ?", (account_id,))
        conn.commit()
    finally:
        conn.close()


# ── Cloud assets CRUD ───────────────────────────────────────────────


def save_cloud_assets(account_id: str, assets: list[dict]) -> None:
    """Clear old assets for this account and insert new ones."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM cloud_assets WHERE cloud_account_id = ?", (account_id,))
        for asset in assets:
            conn.execute(
                """INSERT INTO cloud_assets
                   (id, cloud_account_id, asset_type, name, region, metadata_json, discovered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    account_id,
                    asset.get("asset_type", ""),
                    asset.get("name", ""),
                    asset.get("region", ""),
                    asset.get("metadata_json", "{}") if isinstance(asset.get("metadata_json"), str) else json.dumps(asset.get("metadata_json", {})),
                    asset.get("discovered_at", now),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def list_cloud_assets(account_id: str, asset_type: str = "") -> list[dict]:
    """List assets for an account, optionally filtered by type."""
    conn = _get_conn()
    try:
        if asset_type:
            rows = conn.execute(
                "SELECT * FROM cloud_assets WHERE cloud_account_id = ? AND asset_type = ?",
                (account_id, asset_type),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM cloud_assets WHERE cloud_account_id = ?",
                (account_id,),
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


# ── Cloud issues CRUD ───────────────────────────────────────────────


def save_cloud_issues(account_id: str, issues: list[dict]) -> None:
    """Insert issues for an account (does NOT clear old ones first)."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        for issue in issues:
            conn.execute(
                """INSERT INTO cloud_issues
                   (id, cloud_account_id, asset_id, rule_code, title, description,
                    severity, location, fix_time, status, discovered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()),
                    account_id,
                    issue.get("asset_id"),
                    issue.get("rule_code", ""),
                    issue.get("title", ""),
                    issue.get("description", ""),
                    issue.get("severity", "medium"),
                    issue.get("location", ""),
                    issue.get("fix_time", ""),
                    issue.get("status", "todo"),
                    issue.get("discovered_at", now),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def list_cloud_issues(
    account_id: str, status: str = "", severity: str = ""
) -> list[dict]:
    """List issues sorted by severity (critical first) then discovered_at desc."""
    conn = _get_conn()
    try:
        query = "SELECT * FROM cloud_issues WHERE cloud_account_id = ?"
        params: list = [account_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        rows = conn.execute(query, params).fetchall()
        # Sort in Python so we can use custom severity order
        results = [dict(row) for row in rows]
        results.sort(
            key=lambda r: (
                _SEVERITY_ORDER.get(r["severity"], 99),
                r["discovered_at"],
            )
        )
        return results
    finally:
        conn.close()


def update_cloud_issue_status(issue_id: str, status: str) -> None:
    """Update the status of a single issue."""
    conn = _get_conn()
    try:
        conn.execute(
            "UPDATE cloud_issues SET status = ? WHERE id = ?",
            (status, issue_id),
        )
        conn.commit()
    finally:
        conn.close()


def clear_cloud_issues(account_id: str) -> None:
    """Delete all issues for an account."""
    conn = _get_conn()
    try:
        conn.execute(
            "DELETE FROM cloud_issues WHERE cloud_account_id = ?", (account_id,)
        )
        conn.commit()
    finally:
        conn.close()


def get_issue_counts(account_id: str) -> dict:
    """Count open (status='todo') issues by severity."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT severity, COUNT(*) as cnt
               FROM cloud_issues
               WHERE cloud_account_id = ? AND status = 'todo'
               GROUP BY severity""",
            (account_id,),
        ).fetchall()
        counts = {r["severity"]: r["cnt"] for r in rows}
        return {
            "critical": counts.get("critical", 0),
            "high": counts.get("high", 0),
            "medium": counts.get("medium", 0),
            "low": counts.get("low", 0),
            "total": sum(counts.values()),
        }
    finally:
        conn.close()


# ── Cloud checks (compliance rules) ─────────────────────────────────

_GCP_CHECKS = [
    ("gcp_001", "Project should have org-level MFA", "Checks that multi-factor authentication is enforced at the organisation level.", "check_org_mfa"),
    ("gcp_002", "Firewall allows unrestricted SSH 0.0.0.0/0:22", "Detects firewall rules allowing SSH from any source.", "check_open_ssh"),
    ("gcp_003", "Service account keys older than 90 days", "Flags service account keys that have not been rotated.", "check_key_rotation"),
    ("gcp_004", "GCS buckets are publicly accessible", "Checks for storage buckets with public allUsers/allAuthenticatedUsers access.", "check_public_buckets"),
    ("gcp_005", "Cloud SQL instances are publicly accessible", "Detects Cloud SQL instances with 0.0.0.0/0 authorised networks.", "check_public_sql"),
    ("gcp_006", "Instances use default service account", "Flags Compute Engine instances running with the default service account.", "check_default_sa"),
    ("gcp_007", "Cloud SQL backups not enabled", "Checks that automated backups are configured for Cloud SQL.", "check_sql_backups"),
    ("gcp_008", "VPC flow logs disabled", "Detects VPC sub-networks without flow logs enabled.", "check_flow_logs"),
    ("gcp_009", "OS Login not enabled on project", "Checks that the OS Login metadata key is set to TRUE.", "check_os_login"),
    ("gcp_010", "API keys not restricted", "Flags API keys that are not restricted to specific APIs or referrers.", "check_api_key_restrictions"),
]


def seed_cloud_checks() -> None:
    """Insert the 10 default GCP compliance checks (idempotent)."""
    conn = _get_conn()
    try:
        for rule_code, title, description, check_fn in _GCP_CHECKS:
            conn.execute(
                """INSERT OR IGNORE INTO cloud_checks
                   (id, provider, rule_code, title, description, category, check_function)
                   VALUES (?, 'gcp', ?, ?, ?, 'standard', ?)""",
                (str(uuid.uuid4()), rule_code, title, description, check_fn),
            )
        conn.commit()
    finally:
        conn.close()


def list_cloud_checks(provider: str = "gcp", category: str = "") -> list[dict]:
    """List compliance checks, optionally filtered by category."""
    conn = _get_conn()
    try:
        query = "SELECT * FROM cloud_checks WHERE provider = ?"
        params: list = [provider]
        if category:
            query += " AND category = ?"
            params.append(category)
        query += " ORDER BY rule_code"
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
