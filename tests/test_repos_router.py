"""Tests for the repos API router."""

from __future__ import annotations

import os
import sqlite3

# ── Bootstrap: patch DB connections BEFORE importing api.main ──────
os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"

# Create a shared in-memory connection that won't actually close
_shared_conn = sqlite3.connect(":memory:", check_same_thread=False)
_shared_conn.row_factory = sqlite3.Row
_shared_conn.execute("PRAGMA foreign_keys = ON")


class _NonClosingConnection:
    """Wraps a real connection so close() is a no-op."""

    def __init__(self, real_conn):
        self._conn = real_conn

    def close(self):
        pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


_wrapper = _NonClosingConnection(_shared_conn)

# Patch _sqlite_conn in api.db so ALL modules that call get_conn() use our wrapper
import api.db as db_layer

db_layer._sqlite_conn = lambda: _wrapper

import pytest
from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.main import app
from api.repo_database import save_repo_issues

TEST_USER = "test@example.com"
OTHER_USER = "other@example.com"
app.dependency_overrides[get_current_user] = lambda: TEST_USER

client = TestClient(app)
HEADERS: dict[str, str] = {}


# ── Helpers ──────────────────────────────────────────────────────────


def _create_connection(name: str = "Test Org", org_name: str = "test-org") -> dict:
    """Create a repo connection and return the response JSON."""
    res = client.post(
        "/api/repos",
        headers=HEADERS,
        json={
            "name": name,
            "org_name": org_name,
            "provider": "github",
            "purpose": "production",
        },
    )
    assert res.status_code == 201
    return res.json()


def _insert_issues(connection_id: str) -> None:
    """Insert sample issues directly via the database layer."""
    save_repo_issues(
        connection_id,
        [
            {
                "rule_code": "semgrep_001",
                "title": "Hardcoded secret in config.py",
                "severity": "critical",
                "location": "src/config.py:42",
            },
            {
                "rule_code": "dep_001",
                "title": "Vulnerable lodash dependency",
                "severity": "high",
                "location": "package.json:lodash@4.17.15",
            },
            {
                "rule_code": "license_001",
                "title": "GPL-3.0 license in production dep",
                "severity": "medium",
                "location": "node_modules/some-pkg",
            },
        ],
    )


# ── Connection CRUD ──────────────────────────────────────────────────


def test_list_connections_empty():
    """GET /api/repos returns empty list when no connections exist."""
    res = client.get("/api/repos", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == []


def test_create_connection():
    """POST /api/repos returns 201 with correct fields."""
    data = _create_connection(name="My GitHub Org", org_name="my-org")
    assert "id" in data
    assert data["name"] == "My GitHub Org"
    assert data["provider"] == "github"
    assert data["purpose"] == "production"
    assert data["status"] == "active"
    assert "issue_counts" in data
    assert data["issue_counts"]["total"] == 0
    assert "asset_counts" in data
    assert data["asset_counts"]["total"] == 0
    # github_token must be stripped from responses
    assert "github_token" not in data


def test_list_connections():
    """After creating a connection, list includes it."""
    created = _create_connection(name="Listed Org", org_name="listed-org")
    res = client.get("/api/repos", headers=HEADERS)
    assert res.status_code == 200
    connections = res.json()
    assert any(c["id"] == created["id"] for c in connections)


def test_get_connection():
    """GET /api/repos/{id} returns correct data."""
    created = _create_connection(name="Get Org", org_name="get-org")
    conn_id = created["id"]

    res = client.get(f"/api/repos/{conn_id}", headers=HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == conn_id
    assert data["name"] == "Get Org"
    assert "issue_counts" in data
    assert "asset_counts" in data
    # github_token must be stripped
    assert "github_token" not in data


def test_get_connection_wrong_user():
    """Other user gets 404 when accessing a connection they don't own."""
    created = _create_connection(name="Private Org", org_name="private-org")
    conn_id = created["id"]

    # Switch to a different user
    app.dependency_overrides[get_current_user] = lambda: OTHER_USER
    res = client.get(f"/api/repos/{conn_id}", headers=HEADERS)
    assert res.status_code == 404

    # Restore original user
    app.dependency_overrides[get_current_user] = lambda: TEST_USER


def test_update_connection():
    """PUT /api/repos/{id} updates mutable fields."""
    created = _create_connection(name="Update Org", org_name="update-org")
    conn_id = created["id"]

    res = client.put(
        f"/api/repos/{conn_id}",
        headers=HEADERS,
        json={"name": "Renamed Org", "purpose": "staging"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Renamed Org"
    assert data["purpose"] == "staging"

    # Verify the update persisted
    get_res = client.get(f"/api/repos/{conn_id}", headers=HEADERS)
    assert get_res.json()["name"] == "Renamed Org"
    assert get_res.json()["purpose"] == "staging"


def test_delete_connection():
    """DELETE /api/repos/{id} then GET returns 404."""
    created = _create_connection(name="Delete Org", org_name="delete-org")
    conn_id = created["id"]

    del_res = client.delete(f"/api/repos/{conn_id}", headers=HEADERS)
    assert del_res.status_code == 200
    assert del_res.json()["detail"] == "deleted"

    get_res = client.get(f"/api/repos/{conn_id}", headers=HEADERS)
    assert get_res.status_code == 404


def test_toggle_connection():
    """POST /api/repos/{id}/toggle toggles between active and disabled."""
    created = _create_connection(name="Toggle Org", org_name="toggle-org")
    conn_id = created["id"]
    assert created["status"] == "active"

    # Toggle to disabled
    res = client.post(f"/api/repos/{conn_id}/toggle", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["status"] == "disabled"

    # Toggle back to active
    res = client.post(f"/api/repos/{conn_id}/toggle", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["status"] == "active"


# ── Issues ───────────────────────────────────────────────────────────


def test_list_issues_empty():
    """No issues initially for a new connection."""
    created = _create_connection(name="Clean Org", org_name="clean-org")
    conn_id = created["id"]

    res = client.get(f"/api/repos/{conn_id}/issues", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == []


def test_update_issue_status():
    """PATCH /api/repos/issues/{id} updates issue status."""
    created = _create_connection(name="Issue Status Org", org_name="issue-status-org")
    conn_id = created["id"]

    _insert_issues(conn_id)

    # Fetch issues to get an ID
    issues_res = client.get(f"/api/repos/{conn_id}/issues", headers=HEADERS)
    issues = issues_res.json()
    assert len(issues) == 3
    issue_id = issues[0]["id"]

    # Patch the status
    patch_res = client.patch(
        f"/api/repos/issues/{issue_id}",
        headers=HEADERS,
        json={"status": "in_progress"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "in_progress"


def test_update_issue_severity():
    """PATCH /api/repos/issues/{id}/severity updates issue severity."""
    created = _create_connection(name="Issue Severity Org", org_name="issue-severity-org")
    conn_id = created["id"]

    _insert_issues(conn_id)

    # Fetch issues to get an ID
    issues_res = client.get(f"/api/repos/{conn_id}/issues", headers=HEADERS)
    issues = issues_res.json()
    issue_id = issues[0]["id"]

    # Patch the severity
    patch_res = client.patch(
        f"/api/repos/issues/{issue_id}/severity",
        headers=HEADERS,
        json={"severity": "low"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["severity"] == "low"


# ── Assets ───────────────────────────────────────────────────────────


def test_list_repos_empty():
    """GET /api/repos/{id}/repos returns empty list when no assets stored."""
    created = _create_connection(name="No Repos Org", org_name="no-repos-org")
    conn_id = created["id"]

    res = client.get(f"/api/repos/{conn_id}/repos", headers=HEADERS)
    assert res.status_code == 200
    assert res.json() == []


# ── Cross-connection queries ─────────────────────────────────────────


def test_all_issues():
    """GET /api/repos/all-issues returns issues across connections."""
    conn1 = _create_connection(name="All Issues Org 1", org_name="all-issues-org-1")
    conn2 = _create_connection(name="All Issues Org 2", org_name="all-issues-org-2")

    save_repo_issues(
        conn1["id"],
        [
            {
                "rule_code": "rule_a",
                "title": "Issue A",
                "severity": "high",
                "location": "file_a.py:1",
            },
        ],
    )
    save_repo_issues(
        conn2["id"],
        [
            {
                "rule_code": "rule_b",
                "title": "Issue B",
                "severity": "medium",
                "location": "file_b.py:1",
            },
        ],
    )

    res = client.get("/api/repos/all-issues", headers=HEADERS)
    assert res.status_code == 200
    all_issues = res.json()
    titles = {i["title"] for i in all_issues}
    assert "Issue A" in titles
    assert "Issue B" in titles
    # Each issue should include connection_name from the JOIN
    for issue in all_issues:
        if issue["title"] in ("Issue A", "Issue B"):
            assert "connection_name" in issue


# ── Ownership tests ──────────────────────────────────────────────────


def test_delete_connection_wrong_user():
    """Other user gets 404 when trying to delete a connection they don't own."""
    created = _create_connection(name="Protected Org", org_name="protected-org")
    conn_id = created["id"]

    # Switch to a different user
    app.dependency_overrides[get_current_user] = lambda: OTHER_USER
    res = client.delete(f"/api/repos/{conn_id}", headers=HEADERS)
    assert res.status_code == 404

    # Restore original user -- connection should still exist
    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    get_res = client.get(f"/api/repos/{conn_id}", headers=HEADERS)
    assert get_res.status_code == 200
