"""Persistence for analysis report history.

Supports SQLite (local dev) and PostgreSQL (Cloud Run) via api.db layer.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from api.db import get_conn, adapt_sql, is_postgres, placeholder


def _json_serial(obj):
    """JSON serializer for objects not serializable by default json code."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


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


def init_db() -> None:
    """Initialize the database schema."""
    conn = get_conn()
    try:
        conn.execute(_CREATE_TABLE)
        # Migrations — use SAVEPOINT on PostgreSQL so failures don't abort the transaction
        for migration in [
            "ALTER TABLE analyses ADD COLUMN user_email TEXT DEFAULT ''",
        ]:
            try:
                if is_postgres():
                    conn.execute("SAVEPOINT analyses_migration")
                conn.execute(migration)
                if is_postgres():
                    conn.execute("RELEASE SAVEPOINT analyses_migration")
            except Exception:
                if is_postgres():
                    conn.execute("ROLLBACK TO SAVEPOINT analyses_migration")
                # column already exists — safe to ignore
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

    p = placeholder
    conn = get_conn()
    try:
        conn.execute(
            f"""INSERT INTO analyses
               (id, created_at, user_email, status, log_count, threat_count, critical_count,
                pipeline_time, pipeline_cost, summary, threats_json, report_json,
                metrics_json, full_response_json)
               VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})""",
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
                json.dumps(response_data.get("classified_threats", []), default=_json_serial),
                json.dumps(report, default=_json_serial),
                json.dumps(metrics, default=_json_serial),
                json.dumps(response_data, default=_json_serial),
            ),
        )
        conn.commit()
        return analysis_id
    finally:
        conn.close()


def list_analyses(limit: int = 50, user_email: str = "") -> list[dict]:
    """List recent analyses, newest first. Filter by user_email if provided."""
    conn = get_conn()
    try:
        if user_email:
            rows = conn.execute(
                adapt_sql(
                    """SELECT id, created_at, user_email, status, log_count, threat_count,
                              critical_count, pipeline_time, pipeline_cost, summary
                       FROM analyses WHERE user_email = ? ORDER BY created_at DESC LIMIT ?"""
                ),
                (user_email, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                adapt_sql(
                    """SELECT id, created_at, user_email, status, log_count, threat_count,
                              critical_count, pipeline_time, pipeline_cost, summary
                       FROM analyses ORDER BY created_at DESC LIMIT ?"""
                ),
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_analysis(analysis_id: str) -> dict | None:
    """Get a full analysis by ID."""
    conn = get_conn()
    try:
        row = conn.execute(
            adapt_sql("SELECT * FROM analyses WHERE id = ?"), (analysis_id,)
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
