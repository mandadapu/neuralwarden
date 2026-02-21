"""Tests for report history database."""

from __future__ import annotations

import os
import sqlite3

import pytest

# Patch DB_PATH before importing database module
os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"

import api.database as db
from api.database import init_db, save_analysis, list_analyses, get_analysis


class _NonClosingConnection:
    """Wraps a sqlite3.Connection so that close() is a no-op."""

    def __init__(self, real_conn):
        self._conn = real_conn

    def close(self):
        pass  # no-op

    def __getattr__(self, name):
        return getattr(self._conn, name)


@pytest.fixture(autouse=True)
def setup_db():
    """Initialize a fresh in-memory database for each test."""
    real_conn = sqlite3.connect(":memory:")
    real_conn.row_factory = sqlite3.Row
    wrapper = _NonClosingConnection(real_conn)

    original_get_conn = db.get_conn

    def _shared_conn():
        return wrapper

    db.get_conn = _shared_conn
    init_db()
    yield
    real_conn.close()
    db.get_conn = original_get_conn


class TestDatabase:
    def test_round_trip(self):
        """Save an analysis and retrieve it."""
        data = {
            "status": "completed",
            "summary": {
                "total_threats": 3,
                "severity_counts": {"critical": 1, "high": 1, "medium": 1, "low": 0},
                "total_logs": 50,
            },
            "classified_threats": [
                {"threat_id": "RULE-BF-001", "type": "dast", "risk": "critical"}
            ],
            "report": {"summary": "Test report summary"},
            "agent_metrics": {
                "ingest": {"cost_usd": 0.001},
                "detect": {"cost_usd": 0.01},
            },
            "pipeline_time": 12.5,
        }

        analysis_id = save_analysis(data)
        assert analysis_id  # non-empty string

        # Retrieve
        result = get_analysis(analysis_id)
        assert result is not None
        assert result["status"] == "completed"
        assert result["threat_count"] == 3
        assert result["log_count"] == 50
        assert result["pipeline_time"] == 12.5
        assert result["summary"] == "Test report summary"

    def test_list_analyses(self):
        """Multiple analyses should be listed newest first."""
        for i in range(3):
            save_analysis({
                "status": "completed",
                "summary": {"total_threats": i, "total_logs": 10},
                "pipeline_time": float(i),
            })

        results = list_analyses()
        assert len(results) == 3
        # Newest first (highest pipeline_time was saved last)
        assert results[0]["pipeline_time"] == 2.0

    def test_get_missing_analysis(self):
        """Non-existent ID returns None."""
        assert get_analysis("non-existent-id") is None

    def test_list_empty(self):
        """Empty database returns empty list."""
        assert list_analyses() == []
