"""Persistence for cloud monitoring: accounts, assets, issues, checks.

Supports SQLite (local dev) and PostgreSQL (Cloud Run) via api.db layer.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from api.db import get_conn, adapt_sql, placeholder, insert_or_ignore, is_postgres

# ── Severity ordering (lower = more severe) ─────────────────────────

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

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
    remediation_script TEXT DEFAULT '',
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

_CREATE_SCAN_LOGS = """
CREATE TABLE IF NOT EXISTS scan_logs (
    id TEXT PRIMARY KEY,
    cloud_account_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    summary_json TEXT DEFAULT '{}',
    log_entries_json TEXT DEFAULT '[]',
    FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id)
)
"""


def init_cloud_tables() -> None:
    """Create all cloud monitoring tables if they don't exist."""
    conn = get_conn()
    try:
        conn.execute(_CREATE_CLOUD_ACCOUNTS)
        conn.execute(_CREATE_CLOUD_ASSETS)
        conn.execute(_CREATE_CLOUD_ISSUES)
        conn.execute(_CREATE_CLOUD_CHECKS)
        conn.execute(_CREATE_SCAN_LOGS)
        # Migrations — add columns that may not exist on older DBs
        # Use SAVEPOINT for PostgreSQL so a failure doesn't abort the transaction
        try:
            if is_postgres():
                conn.execute("SAVEPOINT alter_migration")
            conn.execute(
                "ALTER TABLE cloud_issues ADD COLUMN remediation_script TEXT DEFAULT ''"
            )
            if is_postgres():
                conn.execute("RELEASE SAVEPOINT alter_migration")
        except Exception:
            if is_postgres():
                conn.execute("ROLLBACK TO SAVEPOINT alter_migration")
            # column already exists — safe to ignore
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
    p = placeholder
    conn = get_conn()
    try:
        conn.execute(
            f"""INSERT INTO cloud_accounts
               (id, user_email, provider, name, project_id, purpose,
                credentials_json, services, created_at, status)
               VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, 'active')""",
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
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql("SELECT * FROM cloud_accounts WHERE user_email = ? ORDER BY created_at DESC"),
            (user_email,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_cloud_account(account_id: str) -> dict | None:
    """Get a cloud account by ID, or None."""
    conn = get_conn()
    try:
        row = conn.execute(
            adapt_sql("SELECT * FROM cloud_accounts WHERE id = ?"), (account_id,)
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
    p = placeholder
    set_clause = ", ".join(f"{k} = {p}" for k in updates)
    values = list(updates.values()) + [account_id]
    conn = get_conn()
    try:
        conn.execute(
            f"UPDATE cloud_accounts SET {set_clause} WHERE id = {p}",
            values,
        )
        conn.commit()
    finally:
        conn.close()


def delete_cloud_account(account_id: str) -> None:
    """Delete an account and cascade-delete its assets, issues, and scan logs."""
    conn = get_conn()
    try:
        conn.execute(adapt_sql("DELETE FROM scan_logs WHERE cloud_account_id = ?"), (account_id,))
        conn.execute(adapt_sql("DELETE FROM cloud_issues WHERE cloud_account_id = ?"), (account_id,))
        conn.execute(adapt_sql("DELETE FROM cloud_assets WHERE cloud_account_id = ?"), (account_id,))
        conn.execute(adapt_sql("DELETE FROM cloud_accounts WHERE id = ?"), (account_id,))
        conn.commit()
    finally:
        conn.close()


# ── Cloud assets CRUD ───────────────────────────────────────────────


def save_cloud_assets(account_id: str, assets: list[dict]) -> None:
    """Clear old assets for this account and insert new ones."""
    now = datetime.now(timezone.utc).isoformat()
    p = placeholder
    conn = get_conn()
    try:
        conn.execute(adapt_sql("DELETE FROM cloud_assets WHERE cloud_account_id = ?"), (account_id,))
        for asset in assets:
            conn.execute(
                f"""INSERT INTO cloud_assets
                   (id, cloud_account_id, asset_type, name, region, metadata_json, discovered_at)
                   VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p})""",
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
    conn = get_conn()
    try:
        if asset_type:
            rows = conn.execute(
                adapt_sql("SELECT * FROM cloud_assets WHERE cloud_account_id = ? AND asset_type = ?"),
                (account_id, asset_type),
            ).fetchall()
        else:
            rows = conn.execute(
                adapt_sql("SELECT * FROM cloud_assets WHERE cloud_account_id = ?"),
                (account_id,),
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_asset_counts(account_id: str) -> dict:
    """Count assets by type for an account."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql(
                """SELECT asset_type, COUNT(*) as cnt
                   FROM cloud_assets
                   WHERE cloud_account_id = ?
                   GROUP BY asset_type"""
            ),
            (account_id,),
        ).fetchall()
        by_type = {r["asset_type"]: r["cnt"] for r in rows}
        return {
            "total": sum(by_type.values()),
            "by_type": by_type,
        }
    finally:
        conn.close()


# ── Cloud issues CRUD ───────────────────────────────────────────────


def save_cloud_issues(account_id: str, issues: list[dict]) -> int:
    """Insert new issues for an account, skipping duplicates.

    Deduplication key: rule_code + location (within the same account).
    Existing unresolved issues are never deleted — they persist until
    the user marks them as resolved or ignored.

    Returns the number of newly inserted issues.
    """
    now = datetime.now(timezone.utc).isoformat()
    p = placeholder
    conn = get_conn()
    try:
        # Build set of existing (rule_code, location) for this account
        existing = conn.execute(
            adapt_sql("SELECT rule_code, location FROM cloud_issues WHERE cloud_account_id = ?"),
            (account_id,),
        ).fetchall()
        existing_keys = {(r["rule_code"], r["location"]) for r in existing}

        inserted = 0
        for issue in issues:
            key = (issue.get("rule_code", ""), issue.get("location", ""))
            if key in existing_keys:
                continue  # already tracked — keep existing status

            conn.execute(
                f"""INSERT INTO cloud_issues
                   (id, cloud_account_id, asset_id, rule_code, title, description,
                    severity, location, fix_time, status, remediation_script,
                    discovered_at)
                   VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})""",
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
                    issue.get("remediation_script", ""),
                    issue.get("discovered_at", now),
                ),
            )
            inserted += 1

        conn.commit()
        return inserted
    finally:
        conn.close()


def list_cloud_issues(
    account_id: str, status: str = "", severity: str = ""
) -> list[dict]:
    """List issues sorted by severity (critical first) then discovered_at desc."""
    p = placeholder
    conn = get_conn()
    try:
        query = f"SELECT * FROM cloud_issues WHERE cloud_account_id = {p}"
        params: list = [account_id]
        if status:
            query += f" AND status = {p}"
            params.append(status)
        if severity:
            query += f" AND severity = {p}"
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
    conn = get_conn()
    try:
        conn.execute(
            adapt_sql("UPDATE cloud_issues SET status = ? WHERE id = ?"),
            (status, issue_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_cloud_issue_severity(issue_id: str, severity: str) -> None:
    """Update the severity of a single issue."""
    conn = get_conn()
    try:
        conn.execute(
            adapt_sql("UPDATE cloud_issues SET severity = ? WHERE id = ?"),
            (severity, issue_id),
        )
        conn.commit()
    finally:
        conn.close()


def clear_cloud_issues(account_id: str) -> None:
    """Delete all issues for an account."""
    conn = get_conn()
    try:
        conn.execute(
            adapt_sql("DELETE FROM cloud_issues WHERE cloud_account_id = ?"), (account_id,)
        )
        conn.commit()
    finally:
        conn.close()


def list_all_user_issues(user_email: str, status: str = "", severity: str = "") -> list[dict]:
    """List all cloud issues across all accounts for a user, sorted by severity."""
    p = placeholder
    conn = get_conn()
    try:
        query = f"""
            SELECT ci.*, ca.name as cloud_name, ca.project_id
            FROM cloud_issues ci
            JOIN cloud_accounts ca ON ci.cloud_account_id = ca.id
            WHERE ca.user_email = {p}
        """
        params: list = [user_email]
        if status:
            query += f" AND ci.status = {p}"
            params.append(status)
        if severity:
            query += f" AND ci.severity = {p}"
            params.append(severity)
        rows = conn.execute(query, params).fetchall()
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


def get_issue_counts(account_id: str) -> dict:
    """Count open (todo + in_progress) issues by severity."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql(
                """SELECT severity, COUNT(*) as cnt
                   FROM cloud_issues
                   WHERE cloud_account_id = ? AND status IN ('todo', 'in_progress')
                   GROUP BY severity"""
            ),
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
    p = placeholder
    conn = get_conn()
    try:
        for rule_code, title, description, check_fn in _GCP_CHECKS:
            sql = insert_or_ignore(
                "cloud_checks",
                ["id", "provider", "rule_code", "title", "description", "category", "check_function"],
                f"{p}, 'gcp', {p}, {p}, {p}, 'standard', {p}",
            )
            conn.execute(sql, (str(uuid.uuid4()), rule_code, title, description, check_fn))
        conn.commit()
    finally:
        conn.close()


def list_cloud_checks(provider: str = "gcp", category: str = "") -> list[dict]:
    """List compliance checks, optionally filtered by category."""
    p = placeholder
    conn = get_conn()
    try:
        query = f"SELECT * FROM cloud_checks WHERE provider = {p}"
        params: list = [provider]
        if category:
            query += f" AND category = {p}"
            params.append(category)
        query += " ORDER BY rule_code"
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


# ── Scan logs CRUD ─────────────────────────────────────────────────


def create_scan_log(cloud_account_id: str, started_at: str) -> str:
    """Create a scan log entry in 'running' state. Returns the log ID."""
    log_id = str(uuid.uuid4())
    p = placeholder
    conn = get_conn()
    try:
        conn.execute(
            f"""INSERT INTO scan_logs
               (id, cloud_account_id, started_at, status)
               VALUES ({p}, {p}, {p}, 'running')""",
            (log_id, cloud_account_id, started_at),
        )
        conn.commit()
        return log_id
    finally:
        conn.close()


def complete_scan_log(
    log_id: str,
    status: str,
    completed_at: str,
    summary_json: str,
    log_entries_json: str,
) -> None:
    """Finalize a scan log with results."""
    conn = get_conn()
    try:
        conn.execute(
            adapt_sql(
                """UPDATE scan_logs
                   SET status = ?, completed_at = ?,
                       summary_json = ?, log_entries_json = ?
                   WHERE id = ?"""
            ),
            (status, completed_at, summary_json, log_entries_json, log_id),
        )
        conn.commit()
    finally:
        conn.close()


def list_scan_logs(cloud_account_id: str, limit: int = 20) -> list[dict]:
    """List recent scan logs for an account, newest first (no log entries)."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql(
                """SELECT id, cloud_account_id, started_at, completed_at,
                          status, summary_json
                   FROM scan_logs
                   WHERE cloud_account_id = ?
                   ORDER BY started_at DESC
                   LIMIT ?"""
            ),
            (cloud_account_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_scan_log(log_id: str) -> dict | None:
    """Get full scan log detail including log entries."""
    conn = get_conn()
    try:
        row = conn.execute(
            adapt_sql("SELECT * FROM scan_logs WHERE id = ?"), (log_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
