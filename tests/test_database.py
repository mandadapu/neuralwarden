"""Tests for SQLite report history database."""

from __future__ import annotations

import os
import tempfile

import pytest

# Patch DB_PATH before importing database module
_tmp = tempfile.mktemp(suffix=".db")
os.environ["NEURALWARDEN_DB_PATH"] = _tmp

from api.database import init_db, save_analysis, list_analyses, get_analysis


@pytest.fixture(autouse=True)
def setup_db():
    """Initialize a fresh temp database for each test."""
    os.environ["NEURALWARDEN_DB_PATH"] = tempfile.mktemp(suffix=".db")
    # Re-import to pick up new path
    import api.database as db
    db.DB_PATH = os.environ["NEURALWARDEN_DB_PATH"]
    init_db()
    yield
    try:
        os.unlink(db.DB_PATH)
    except OSError:
        pass


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
                {"threat_id": "RULE-BF-001", "type": "brute_force", "risk": "critical"}
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
