"""Persistence for repository monitoring: connections, assets, issues, scan logs.

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

_CREATE_REPO_CONNECTIONS = """
CREATE TABLE IF NOT EXISTS repo_connections (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL,
    provider TEXT DEFAULT 'github',
    name TEXT NOT NULL,
    org_name TEXT NOT NULL,
    installation_id TEXT DEFAULT '',
    github_token TEXT DEFAULT '',
    purpose TEXT DEFAULT 'production',
    scan_config TEXT DEFAULT '{}',
    last_scan_at TEXT,
    created_at TEXT NOT NULL,
    status TEXT DEFAULT 'active'
)
"""

_CREATE_REPO_ASSETS = """
CREATE TABLE IF NOT EXISTS repo_assets (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    repo_full_name TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    language TEXT DEFAULT '',
    default_branch TEXT DEFAULT 'main',
    is_private INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    discovered_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES repo_connections(id)
)
"""

_CREATE_REPO_ISSUES = """
CREATE TABLE IF NOT EXISTS repo_issues (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    repo_asset_id TEXT,
    rule_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    severity TEXT NOT NULL,
    location TEXT DEFAULT '',
    fix_time TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    remediation_script TEXT DEFAULT '',
    discovered_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES repo_connections(id),
    FOREIGN KEY (repo_asset_id) REFERENCES repo_assets(id)
)
"""

_CREATE_REPO_SCAN_LOGS = """
CREATE TABLE IF NOT EXISTS repo_scan_logs (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    summary_json TEXT DEFAULT '{}',
    log_entries_json TEXT DEFAULT '[]',
    FOREIGN KEY (connection_id) REFERENCES repo_connections(id)
)
"""


def init_repo_tables() -> None:
    """Create all repo monitoring tables if they don't exist."""
    conn = get_conn()
    try:
        conn.execute(_CREATE_REPO_CONNECTIONS)
        conn.execute(_CREATE_REPO_ASSETS)
        conn.execute(_CREATE_REPO_ISSUES)
        conn.execute(_CREATE_REPO_SCAN_LOGS)
        conn.commit()

        # Migration: add github_token column if missing
        try:
            conn.execute("SAVEPOINT add_github_token")
            conn.execute("ALTER TABLE repo_connections ADD COLUMN github_token TEXT DEFAULT ''")
            conn.execute("RELEASE SAVEPOINT add_github_token")
            conn.commit()
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT add_github_token")
    finally:
        conn.close()


# ── Repo connections CRUD ──────────────────────────────────────────


def create_repo_connection(
    user_email: str,
    provider: str = "github",
    name: str = "",
    org_name: str = "",
    installation_id: str = "",
    github_token: str = "",
    purpose: str = "production",
    scan_config: str = "{}",
) -> str:
    """Create a repo connection and return its ID."""
    connection_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    p = placeholder
    conn = get_conn()
    try:
        conn.execute(
            f"""INSERT INTO repo_connections
               (id, user_email, provider, name, org_name, installation_id,
                github_token, purpose, scan_config, created_at, status)
               VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, 'active')""",
            (
                connection_id,
                user_email,
                provider,
                name,
                org_name,
                installation_id,
                github_token,
                purpose,
                scan_config if isinstance(scan_config, str) else json.dumps(scan_config),
                now,
            ),
        )
        conn.commit()
        return connection_id
    finally:
        conn.close()


def list_repo_connections(user_email: str) -> list[dict]:
    """List all repo connections for a given user."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql("SELECT * FROM repo_connections WHERE user_email = ? ORDER BY created_at DESC"),
            (user_email,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_repo_connection(connection_id: str) -> dict | None:
    """Get a repo connection by ID, or None."""
    conn = get_conn()
    try:
        row = conn.execute(
            adapt_sql("SELECT * FROM repo_connections WHERE id = ?"), (connection_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


_ALLOWED_CONNECTION_FIELDS = {
    "name",
    "purpose",
    "scan_config",
    "status",
    "last_scan_at",
}


def update_repo_connection(connection_id: str, **fields) -> None:
    """Update allowed fields on a repo connection."""
    updates = {k: v for k, v in fields.items() if k in _ALLOWED_CONNECTION_FIELDS}
    if not updates:
        return
    p = placeholder
    set_clause = ", ".join(f"{k} = {p}" for k in updates)
    values = list(updates.values()) + [connection_id]
    conn = get_conn()
    try:
        conn.execute(
            f"UPDATE repo_connections SET {set_clause} WHERE id = {p}",
            values,
        )
        conn.commit()
    finally:
        conn.close()


def delete_repo_connection(connection_id: str) -> None:
    """Delete a connection and cascade-delete its scan logs, issues, and assets."""
    conn = get_conn()
    try:
        conn.execute(adapt_sql("DELETE FROM repo_scan_logs WHERE connection_id = ?"), (connection_id,))
        conn.execute(adapt_sql("DELETE FROM repo_issues WHERE connection_id = ?"), (connection_id,))
        conn.execute(adapt_sql("DELETE FROM repo_assets WHERE connection_id = ?"), (connection_id,))
        conn.execute(adapt_sql("DELETE FROM repo_connections WHERE id = ?"), (connection_id,))
        conn.commit()
    finally:
        conn.close()


# ── Repo assets CRUD ───────────────────────────────────────────────


def save_repo_assets(connection_id: str, assets: list[dict]) -> None:
    """Clear old assets for this connection and insert new ones."""
    now = datetime.now(timezone.utc).isoformat()
    p = placeholder
    conn = get_conn()
    try:
        conn.execute(adapt_sql("DELETE FROM repo_assets WHERE connection_id = ?"), (connection_id,))
        for asset in assets:
            conn.execute(
                f"""INSERT INTO repo_assets
                   (id, connection_id, repo_full_name, repo_name, language,
                    default_branch, is_private, metadata_json, discovered_at)
                   VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})""",
                (
                    str(uuid.uuid4()),
                    connection_id,
                    asset.get("repo_full_name", ""),
                    asset.get("repo_name", ""),
                    asset.get("language", ""),
                    asset.get("default_branch", "main"),
                    asset.get("is_private", 0),
                    asset.get("metadata_json", "{}") if isinstance(asset.get("metadata_json"), str) else json.dumps(asset.get("metadata_json", {})),
                    asset.get("discovered_at", now),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def list_repo_assets(connection_id: str) -> list[dict]:
    """List assets for a connection."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql("SELECT * FROM repo_assets WHERE connection_id = ?"),
            (connection_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_repo_asset_counts(connection_id: str) -> dict:
    """Count assets by language for a connection."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql(
                """SELECT language, COUNT(*) as cnt
                   FROM repo_assets
                   WHERE connection_id = ?
                   GROUP BY language"""
            ),
            (connection_id,),
        ).fetchall()
        by_language = {r["language"]: r["cnt"] for r in rows}
        return {
            "total": sum(by_language.values()),
            "by_language": by_language,
        }
    finally:
        conn.close()


# ── Repo issues CRUD ──────────────────────────────────────────────


def save_repo_issues(connection_id: str, issues: list[dict]) -> int:
    """Insert new issues for a connection, skipping duplicates.

    Deduplication key: rule_code + location (within the same connection).
    Existing unresolved issues are never deleted — they persist until
    the user marks them as resolved or ignored.

    Returns the number of newly inserted issues.
    """
    now = datetime.now(timezone.utc).isoformat()
    p = placeholder
    conn = get_conn()
    try:
        # Build set of existing (rule_code, location) for this connection
        existing = conn.execute(
            adapt_sql("SELECT rule_code, location FROM repo_issues WHERE connection_id = ?"),
            (connection_id,),
        ).fetchall()
        existing_keys = {(r["rule_code"], r["location"]) for r in existing}

        inserted = 0
        for issue in issues:
            key = (issue.get("rule_code", ""), issue.get("location", ""))
            if key in existing_keys:
                continue  # already tracked — keep existing status

            conn.execute(
                f"""INSERT INTO repo_issues
                   (id, connection_id, repo_asset_id, rule_code, title, description,
                    severity, location, fix_time, status, remediation_script,
                    discovered_at)
                   VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})""",
                (
                    str(uuid.uuid4()),
                    connection_id,
                    issue.get("repo_asset_id"),
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


def list_repo_issues(
    connection_id: str, status: str = "", severity: str = ""
) -> list[dict]:
    """List issues sorted by severity (critical first) then discovered_at desc."""
    p = placeholder
    conn = get_conn()
    try:
        query = f"SELECT * FROM repo_issues WHERE connection_id = {p}"
        params: list = [connection_id]
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


def list_all_user_repo_issues(
    user_email: str, status: str = "", severity: str = ""
) -> list[dict]:
    """List all repo issues across all connections for a user, sorted by severity."""
    p = placeholder
    conn = get_conn()
    try:
        query = f"""
            SELECT ri.*, rc.name as connection_name
            FROM repo_issues ri
            JOIN repo_connections rc ON ri.connection_id = rc.id
            WHERE rc.user_email = {p}
        """
        params: list = [user_email]
        if status:
            query += f" AND ri.status = {p}"
            params.append(status)
        if severity:
            query += f" AND ri.severity = {p}"
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


def get_repo_issue(issue_id: str) -> dict | None:
    """Return a single repo issue by ID, or None."""
    conn = get_conn()
    try:
        row = conn.execute(
            adapt_sql("SELECT * FROM repo_issues WHERE id = ?"),
            (issue_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_repo_issue_status(issue_id: str, status: str) -> None:
    """Update the status of a single issue."""
    conn = get_conn()
    try:
        conn.execute(
            adapt_sql("UPDATE repo_issues SET status = ? WHERE id = ?"),
            (status, issue_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_repo_issue_severity(issue_id: str, severity: str) -> None:
    """Update the severity of a single issue."""
    conn = get_conn()
    try:
        conn.execute(
            adapt_sql("UPDATE repo_issues SET severity = ? WHERE id = ?"),
            (severity, issue_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_repo_issue_counts(connection_id: str) -> dict:
    """Count open (todo + in_progress) issues by severity."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql(
                """SELECT severity, COUNT(*) as cnt
                   FROM repo_issues
                   WHERE connection_id = ? AND status IN ('todo', 'in_progress')
                   GROUP BY severity"""
            ),
            (connection_id,),
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


# ── Repo scan logs CRUD ───────────────────────────────────────────


def create_repo_scan_log(connection_id: str, started_at: str) -> str:
    """Create a scan log entry in 'running' state. Returns the log ID."""
    log_id = str(uuid.uuid4())
    p = placeholder
    conn = get_conn()
    try:
        conn.execute(
            f"""INSERT INTO repo_scan_logs
               (id, connection_id, started_at, status)
               VALUES ({p}, {p}, {p}, 'running')""",
            (log_id, connection_id, started_at),
        )
        conn.commit()
        return log_id
    finally:
        conn.close()


def complete_repo_scan_log(
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
                """UPDATE repo_scan_logs
                   SET status = ?, completed_at = ?,
                       summary_json = ?, log_entries_json = ?
                   WHERE id = ?"""
            ),
            (status, completed_at, summary_json, log_entries_json, log_id),
        )
        conn.commit()
    finally:
        conn.close()


def list_repo_scan_logs(connection_id: str, limit: int = 20) -> list[dict]:
    """List recent scan logs for a connection, newest first (no log entries)."""
    conn = get_conn()
    try:
        rows = conn.execute(
            adapt_sql(
                """SELECT id, connection_id, started_at, completed_at,
                          status, summary_json
                   FROM repo_scan_logs
                   WHERE connection_id = ?
                   ORDER BY started_at DESC
                   LIMIT ?"""
            ),
            (connection_id, limit),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_repo_scan_log(log_id: str) -> dict | None:
    """Get full scan log detail including log entries."""
    conn = get_conn()
    try:
        row = conn.execute(
            adapt_sql("SELECT * FROM repo_scan_logs WHERE id = ?"), (log_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
