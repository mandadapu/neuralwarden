"""SQLite persistence for analysis report history."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone


DB_PATH = os.getenv("NEURALWARDEN_DB_PATH", os.getenv("NEURALWARDEN_DB_PATH", "data/neuralwarden.db"))

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    user_email TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'completed',
    log_count INTEGER DEFAULT 0,
    threat_count INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    pipeline_time REAL DEFAULT 0.0,
    pipeline_cost REAL DEFAULT 0.0,
    summary TEXT DEFAULT '',
    threats_json TEXT DEFAULT '[]',
    report_json TEXT DEFAULT '{}',
    metrics_json TEXT DEFAULT '{}',
    full_response_json TEXT DEFAULT '{}'
)
"""

_MIGRATE_USER_EMAIL = """
ALTER TABLE analyses ADD COLUMN user_email TEXT DEFAULT ''
"""


def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection, creating the DB directory if needed."""
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the database schema."""
    conn = _get_conn()
    try:
        conn.execute(_CREATE_TABLE)
        # Migrate: add user_email column if missing
        try:
            conn.execute(_MIGRATE_USER_EMAIL)
        except sqlite3.OperationalError:
            pass  # column already exists
        conn.commit()
    finally:
        conn.close()


def save_analysis(response_data: dict, user_email: str = "") -> str:
    """Save a completed analysis response. Returns the analysis ID."""
    analysis_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    summary = response_data.get("summary", {})
    report = response_data.get("report") or {}
    metrics = response_data.get("agent_metrics", {})

    # Compute total cost from agent metrics
    total_cost = sum(
        m.get("cost_usd", 0) for m in metrics.values() if isinstance(m, dict)
    )

    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO analyses
               (id, created_at, user_email, status, log_count, threat_count, critical_count,
                pipeline_time, pipeline_cost, summary, threats_json, report_json,
                metrics_json, full_response_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis_id,
                now,
                user_email,
                response_data.get("status", "completed"),
                summary.get("total_logs", 0),
                summary.get("total_threats", 0),
                summary.get("severity_counts", {}).get("critical", 0),
                response_data.get("pipeline_time", 0.0),
                total_cost,
                report.get("summary", "") if isinstance(report, dict) else "",
                json.dumps(response_data.get("classified_threats", [])),
                json.dumps(report),
                json.dumps(metrics),
                json.dumps(response_data),
            ),
        )
        conn.commit()
        return analysis_id
    finally:
        conn.close()


def list_analyses(limit: int = 50, user_email: str = "") -> list[dict]:
    """List recent analyses, newest first. Filter by user_email if provided."""
    conn = _get_conn()
    try:
        if user_email:
            rows = conn.execute(
                """SELECT id, created_at, user_email, status, log_count, threat_count,
                          critical_count, pipeline_time, pipeline_cost, summary
                   FROM analyses WHERE user_email = ? ORDER BY created_at DESC LIMIT ?""",
                (user_email, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT id, created_at, user_email, status, log_count, threat_count,
                          critical_count, pipeline_time, pipeline_cost, summary
                   FROM analyses ORDER BY created_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_analysis(analysis_id: str) -> dict | None:
    """Get a full analysis by ID."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        # Parse JSON columns
        for col in ("threats_json", "report_json", "metrics_json", "full_response_json"):
            if result.get(col):
                result[col] = json.loads(result[col])
        return result
    finally:
        conn.close()
