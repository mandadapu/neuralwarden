"""Tests for simple API routers (samples, generator, health, watcher)."""

from __future__ import annotations

import os
import sqlite3

os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"
os.environ["WATCHER_BASE_DIR"] = "/tmp"

class _NonClosingConnection:
    def __init__(self, real_conn):
        self._conn = real_conn
    def close(self):
        pass
    def __getattr__(self, name):
        return getattr(self._conn, name)

_shared_real_conn = sqlite3.connect(":memory:", check_same_thread=False)
_shared_real_conn.row_factory = sqlite3.Row
_shared_real_conn.execute("PRAGMA foreign_keys = ON")
_shared_wrapper = _NonClosingConnection(_shared_real_conn)

import api.db as db_layer
db_layer._sqlite_conn = lambda: _shared_wrapper

import pytest
from fastapi.testclient import TestClient
from api.auth import get_current_user
from api.main import app

TEST_USER = "test@example.com"
app.dependency_overrides[get_current_user] = lambda: TEST_USER

client = TestClient(app)
HEADERS: dict[str, str] = {}


# ── Health endpoint ───────────────────────────────────────────────────


def test_health():
    """GET /api/health returns status ok and version 2.0.0."""
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body == {"status": "ok", "version": "2.0.0"}


# ── Samples router ───────────────────────────────────────────────────


def test_list_samples():
    """GET /api/samples returns a non-empty list of samples."""
    res = client.get("/api/samples", headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert "samples" in body
    assert len(body["samples"]) > 0


def test_get_sample():
    """GET /api/samples/{id} returns sample content for a valid ID."""
    # First fetch the list to get a real sample ID
    samples = client.get("/api/samples", headers=HEADERS).json()["samples"]
    sample_id = samples[0]["id"]

    res = client.get(f"/api/samples/{sample_id}", headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert "content" in body
    assert len(body["content"]) > 0


def test_get_sample_404():
    """GET /api/samples/nonexistent returns 404."""
    res = client.get("/api/samples/nonexistent", headers=HEADERS)
    assert res.status_code == 404


# ── Generator router ─────────────────────────────────────────────────


def test_list_scenarios():
    """GET /api/scenarios returns a list of available scenarios."""
    res = client.get("/api/scenarios", headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert "scenarios" in body


def test_generate_logs():
    """POST /api/generate with valid params returns logs and log_count."""
    res = client.post(
        "/api/generate",
        json={"scenario": "apt_intrusion", "count": 10},
        headers=HEADERS,
    )
    assert res.status_code == 200
    body = res.json()
    assert "logs" in body
    assert "log_count" in body
    assert body["log_count"] >= 1


def test_generate_logs_validation():
    """POST /api/generate with count below minimum (10) returns 422."""
    res = client.post(
        "/api/generate",
        json={"scenario": "apt_intrusion", "count": 5},
        headers=HEADERS,
    )
    assert res.status_code == 422


# ── Watcher router ───────────────────────────────────────────────────


def test_watcher_status():
    """GET /api/watcher/status returns running as a boolean."""
    res = client.get("/api/watcher/status", headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert "running" in body
    assert isinstance(body["running"], bool)


def test_watcher_start_stop():
    """POST /api/watcher/start then /stop toggles the watcher state."""
    # Use /tmp which matches WATCHER_BASE_DIR set above
    watch_dir = "/tmp/nw_watcher_test"

    # Start the watcher
    res = client.post(
        "/api/watcher/start",
        json={"watch_dir": watch_dir},
        headers=HEADERS,
    )
    assert res.status_code == 200
    assert res.json()["running"] is True

    # Stop the watcher
    res = client.post("/api/watcher/stop", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["running"] is False


# ── Reports router ───────────────────────────────────────────────────


def test_list_reports_empty():
    """GET /api/reports returns 200 with an empty reports list."""
    res = client.get("/api/reports", headers=HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert "reports" in body
    assert body["reports"] == []


def test_get_report_404():
    """GET /api/reports/nonexistent returns 404."""
    res = client.get("/api/reports/nonexistent", headers=HEADERS)
    assert res.status_code == 404
