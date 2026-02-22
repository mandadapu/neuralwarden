"""Tests for the clouds API router."""

from __future__ import annotations

import os
import sqlite3

# ── Bootstrap: patch DB connections BEFORE importing api.main ──────
# api.main runs init_db(), init_cloud_tables(), and seed_cloud_checks()
# at import time.  With NEURALWARDEN_DB_PATH=":memory:" each get_conn()
# call opens a *separate* in-memory DB, so tables vanish between calls.
# We must monkey-patch get_conn in all three modules to share one connection
# BEFORE api.main is imported.

os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"


class _NonClosingConnection:
    """Wraps a sqlite3.Connection so that close() is a no-op."""

    def __init__(self, real_conn):
        self._conn = real_conn

    def close(self):
        pass  # no-op

    def __getattr__(self, name):
        return getattr(self._conn, name)


# Create the shared connection for module-level init.
# check_same_thread=False is needed because the FastAPI TestClient runs
# the async handlers in a different thread than the test thread.
_shared_real_conn = sqlite3.connect(":memory:", check_same_thread=False)
_shared_real_conn.row_factory = sqlite3.Row
_shared_real_conn.execute("PRAGMA foreign_keys = ON")
_shared_wrapper = _NonClosingConnection(_shared_real_conn)

import api.db as db_layer
import api.cloud_database as cloud_db
import api.database as db


def _shared_conn():
    return _shared_wrapper


# Patch get_conn in all modules that imported it
db_layer.get_conn = _shared_conn
cloud_db.get_conn = _shared_conn
db.get_conn = _shared_conn

# NOW it is safe to import api.main — its init_db / init_cloud_tables /
# seed_cloud_checks will use our shared in-memory connection.
import pytest
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.cloud_database import (
    init_cloud_tables,
    save_cloud_issues,
    seed_cloud_checks,
)
from api.database import init_db
from api.main import app

TEST_USER = "test@example.com"
app.dependency_overrides[get_current_user] = lambda: TEST_USER
HEADERS: dict[str, str] = {}

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_db():
    """Re-create all tables for every test (clean slate)."""
    # Drop all relevant tables
    for table in ("cloud_issues", "cloud_assets", "cloud_accounts", "cloud_checks", "analyses"):
        _shared_real_conn.execute(f"DROP TABLE IF EXISTS {table}")
    _shared_real_conn.commit()

    # Re-create them
    init_db()
    init_cloud_tables()
    seed_cloud_checks()

    yield


# ── Account CRUD ─────────────────────────────────────────────────


def test_list_clouds_empty():
    """GET /api/clouds returns empty list when no accounts exist."""
    res = client.get("/api/clouds", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == []


def test_create_cloud():
    """POST /api/clouds returns 201 with the created account ID."""
    res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={
            "name": "My GCP Project",
            "project_id": "proj-123",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert "id" in data
    assert data["name"] == "My GCP Project"
    assert data["project_id"] == "proj-123"
    assert data["provider"] == "gcp"


def test_get_cloud():
    """GET /api/clouds/{id} returns cloud with issue_counts."""
    create_res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={"name": "Test Cloud", "project_id": "proj-456"},
    )
    cloud_id = create_res.json()["id"]

    res = client.get(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == cloud_id
    assert data["name"] == "Test Cloud"
    assert "issue_counts" in data
    assert data["issue_counts"]["total"] == 0


def test_delete_cloud():
    """DELETE then GET returns 404."""
    create_res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={"name": "To Delete", "project_id": "proj-del"},
    )
    cloud_id = create_res.json()["id"]

    del_res = client.delete(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert del_res.status_code == 200

    get_res = client.get(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert get_res.status_code == 404


def test_list_checks():
    """GET /api/clouds/checks returns 10+ seeded compliance checks."""
    res = client.get("/api/clouds/checks", headers=HEADERS)
    assert res.status_code == 200
    checks = res.json()
    assert len(checks) >= 10


def test_list_issues_empty():
    """GET /api/clouds/{id}/issues returns empty list when no issues."""
    create_res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={"name": "No Issues Cloud", "project_id": "proj-clean"},
    )
    cloud_id = create_res.json()["id"]

    res = client.get(f"/api/clouds/{cloud_id}/issues", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == []


def test_update_issue_status():
    """PATCH /api/clouds/issues/{id} updates the issue status."""
    create_res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={"name": "Issue Cloud", "project_id": "proj-issue"},
    )
    cloud_id = create_res.json()["id"]

    # Insert an issue directly via the database layer
    save_cloud_issues(cloud_id, [
        {
            "rule_code": "gcp_002",
            "title": "Open SSH",
            "severity": "high",
        },
    ])

    # Fetch the issue to get its ID
    issues_res = client.get(f"/api/clouds/{cloud_id}/issues", headers=HEADERS)
    issue_id = issues_res.json()[0]["id"]

    # Patch the status
    patch_res = client.patch(
        f"/api/clouds/issues/{issue_id}",
        headers=HEADERS,
        json={"status": "in_progress"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "in_progress"

    # Verify the update persisted
    issues_res2 = client.get(f"/api/clouds/{cloud_id}/issues", headers=HEADERS)
    assert issues_res2.json()[0]["status"] == "in_progress"


def test_get_cloud_404():
    """GET /api/clouds/nonexistent returns 404."""
    res = client.get("/api/clouds/nonexistent", headers=HEADERS)
    assert res.status_code == 404


# ── Ownership tests ─────────────────────────────────────────────────


def test_get_cloud_wrong_user_returns_404():
    """User A creates a cloud, user B gets 404 trying to access it."""
    # Create as test user
    create_res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={"name": "Owner Cloud", "project_id": "proj-own"},
    )
    cloud_id = create_res.json()["id"]

    # Switch to a different user
    app.dependency_overrides[get_current_user] = lambda: "other@example.com"
    res = client.get(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert res.status_code == 404

    # Restore original user
    app.dependency_overrides[get_current_user] = lambda: TEST_USER


def test_delete_cloud_wrong_user_returns_404():
    """User A creates a cloud, user B gets 404 trying to delete it."""
    create_res = client.post(
        "/api/clouds",
        headers=HEADERS,
        json={"name": "Delete Blocked", "project_id": "proj-del2"},
    )
    cloud_id = create_res.json()["id"]

    # Switch to a different user
    app.dependency_overrides[get_current_user] = lambda: "other@example.com"
    res = client.delete(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert res.status_code == 404

    # Restore original user — cloud should still exist
    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    res = client.get(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert res.status_code == 200
