"""Tests for cloud monitoring persistence layer."""

from __future__ import annotations

import os

# Patch DB_PATH before importing any database module
os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"

import pytest

import api.cloud_database as cloud_db
from api.cloud_database import (
    init_cloud_tables,
    seed_cloud_checks,
    create_cloud_account,
    list_cloud_accounts,
    get_cloud_account,
    update_cloud_account,
    delete_cloud_account,
    save_cloud_assets,
    list_cloud_assets,
    save_cloud_issues,
    list_cloud_issues,
    update_cloud_issue_status,
    clear_cloud_issues,
    get_issue_counts,
    list_cloud_checks,
)


class _NonClosingConnection:
    """Wraps a sqlite3.Connection so that close() is a no-op.
    This lets the production code call conn.close() in its finally blocks
    without destroying the shared in-memory connection used by tests."""

    def __init__(self, real_conn):
        self._conn = real_conn

    def close(self):
        pass  # no-op

    def __getattr__(self, name):
        return getattr(self._conn, name)


@pytest.fixture(autouse=True)
def fresh_db():
    """Use in-memory DB for every test; re-initialize tables."""
    import sqlite3

    real_conn = sqlite3.connect(":memory:")
    real_conn.row_factory = sqlite3.Row
    real_conn.execute("PRAGMA foreign_keys = ON")
    wrapper = _NonClosingConnection(real_conn)

    original_get_conn = cloud_db.get_conn

    def _shared_conn():
        return wrapper

    cloud_db.get_conn = _shared_conn
    init_cloud_tables()
    yield
    real_conn.close()
    cloud_db.get_conn = original_get_conn


# ── Cloud accounts ──────────────────────────────────────────────────


class TestCloudAccounts:
    def test_create_and_list(self):
        """Create accounts for a user and list them back."""
        aid = create_cloud_account(
            user_email="alice@example.com",
            provider="gcp",
            name="My Project",
            project_id="proj-123",
        )
        assert aid  # non-empty uuid string

        accounts = list_cloud_accounts("alice@example.com")
        assert len(accounts) == 1
        assert accounts[0]["name"] == "My Project"
        assert accounts[0]["project_id"] == "proj-123"
        assert accounts[0]["provider"] == "gcp"
        assert accounts[0]["status"] == "active"

    def test_list_filters_by_email(self):
        """Accounts for different users should not leak."""
        create_cloud_account(
            user_email="alice@example.com",
            provider="gcp",
            name="Alice Project",
            project_id="proj-a",
        )
        create_cloud_account(
            user_email="bob@example.com",
            provider="gcp",
            name="Bob Project",
            project_id="proj-b",
        )

        assert len(list_cloud_accounts("alice@example.com")) == 1
        assert len(list_cloud_accounts("bob@example.com")) == 1

    def test_get_cloud_account(self):
        """Retrieve a specific account by ID."""
        aid = create_cloud_account(
            user_email="alice@example.com",
            provider="gcp",
            name="Test",
            project_id="proj-1",
        )
        account = get_cloud_account(aid)
        assert account is not None
        assert account["id"] == aid
        assert account["user_email"] == "alice@example.com"

    def test_get_cloud_account_missing(self):
        """Non-existent ID returns None."""
        assert get_cloud_account("no-such-id") is None

    def test_update_cloud_account(self):
        """Update allowed fields on an account."""
        aid = create_cloud_account(
            user_email="alice@example.com",
            provider="gcp",
            name="Old Name",
            project_id="proj-1",
        )
        update_cloud_account(aid, name="New Name", purpose="staging")
        account = get_cloud_account(aid)
        assert account["name"] == "New Name"
        assert account["purpose"] == "staging"

    def test_delete_cloud_account_cascades(self):
        """Deleting an account removes its assets and issues."""
        aid = create_cloud_account(
            user_email="alice@example.com",
            provider="gcp",
            name="Doomed",
            project_id="proj-doom",
        )
        save_cloud_assets(aid, [
            {"asset_type": "vm", "name": "instance-1"},
        ])
        save_cloud_issues(aid, [
            {
                "rule_code": "gcp_001",
                "title": "No MFA",
                "severity": "critical",
            },
        ])

        # Verify they exist before deletion
        assert len(list_cloud_assets(aid)) == 1
        assert len(list_cloud_issues(aid)) == 1

        delete_cloud_account(aid)

        assert get_cloud_account(aid) is None
        assert list_cloud_assets(aid) == []
        assert list_cloud_issues(aid) == []


# ── Cloud issues ────────────────────────────────────────────────────


class TestCloudIssues:
    def _make_account(self):
        return create_cloud_account(
            user_email="test@example.com",
            provider="gcp",
            name="Test",
            project_id="proj-1",
        )

    def test_save_and_list_sorted_by_severity(self):
        """Issues should be sorted by severity (critical first) then date."""
        aid = self._make_account()
        save_cloud_issues(aid, [
            {"rule_code": "gcp_001", "title": "Low issue", "severity": "low"},
            {"rule_code": "gcp_002", "title": "Critical issue", "severity": "critical"},
            {"rule_code": "gcp_003", "title": "High issue", "severity": "high"},
            {"rule_code": "gcp_004", "title": "Medium issue", "severity": "medium"},
        ])

        issues = list_cloud_issues(aid)
        assert len(issues) == 4
        severities = [i["severity"] for i in issues]
        assert severities == ["critical", "high", "medium", "low"]

    def test_list_filter_by_status(self):
        """Filter issues by status."""
        aid = self._make_account()
        save_cloud_issues(aid, [
            {"rule_code": "gcp_001", "title": "Issue 1", "severity": "high"},
            {"rule_code": "gcp_002", "title": "Issue 2", "severity": "low"},
        ])
        # Update one to 'resolved'
        issues = list_cloud_issues(aid)
        update_cloud_issue_status(issues[0]["id"], "resolved")

        todo_issues = list_cloud_issues(aid, status="todo")
        assert len(todo_issues) == 1
        assert todo_issues[0]["title"] == "Issue 2"

    def test_list_filter_by_severity(self):
        """Filter issues by severity."""
        aid = self._make_account()
        save_cloud_issues(aid, [
            {"rule_code": "gcp_001", "title": "Critical", "severity": "critical"},
            {"rule_code": "gcp_002", "title": "Low", "severity": "low"},
        ])
        critical = list_cloud_issues(aid, severity="critical")
        assert len(critical) == 1
        assert critical[0]["severity"] == "critical"

    def test_update_issue_status(self):
        """Change an issue from todo to resolved."""
        aid = self._make_account()
        save_cloud_issues(aid, [
            {"rule_code": "gcp_001", "title": "Issue", "severity": "high"},
        ])
        issue = list_cloud_issues(aid)[0]
        assert issue["status"] == "todo"

        update_cloud_issue_status(issue["id"], "resolved")

        updated = list_cloud_issues(aid)[0]
        assert updated["status"] == "resolved"

    def test_get_issue_counts_only_todo(self):
        """get_issue_counts should only count issues with status='todo'."""
        aid = self._make_account()
        save_cloud_issues(aid, [
            {"rule_code": "gcp_001", "title": "C1", "severity": "critical"},
            {"rule_code": "gcp_002", "title": "H1", "severity": "high"},
            {"rule_code": "gcp_003", "title": "H2", "severity": "high"},
            {"rule_code": "gcp_004", "title": "M1", "severity": "medium"},
            {"rule_code": "gcp_005", "title": "L1", "severity": "low"},
        ])
        # Resolve one high issue
        issues = list_cloud_issues(aid)
        high_issue = [i for i in issues if i["severity"] == "high"][0]
        update_cloud_issue_status(high_issue["id"], "resolved")

        counts = get_issue_counts(aid)
        assert counts["critical"] == 1
        assert counts["high"] == 1  # one resolved, one remaining
        assert counts["medium"] == 1
        assert counts["low"] == 1
        assert counts["total"] == 4  # 5 total minus 1 resolved

    def test_clear_cloud_issues(self):
        """clear_cloud_issues removes all issues for an account."""
        aid = self._make_account()
        save_cloud_issues(aid, [
            {"rule_code": "gcp_001", "title": "Issue", "severity": "high"},
        ])
        assert len(list_cloud_issues(aid)) == 1
        clear_cloud_issues(aid)
        assert list_cloud_issues(aid) == []


# ── Cloud assets ────────────────────────────────────────────────────


class TestCloudAssets:
    def _make_account(self):
        return create_cloud_account(
            user_email="test@example.com",
            provider="gcp",
            name="Test",
            project_id="proj-1",
        )

    def test_save_and_list(self):
        """Save assets and list them back."""
        aid = self._make_account()
        save_cloud_assets(aid, [
            {"asset_type": "vm", "name": "instance-1", "region": "us-central1"},
            {"asset_type": "bucket", "name": "my-bucket"},
        ])
        assets = list_cloud_assets(aid)
        assert len(assets) == 2

    def test_list_filter_by_type(self):
        """Filter assets by type."""
        aid = self._make_account()
        save_cloud_assets(aid, [
            {"asset_type": "vm", "name": "instance-1"},
            {"asset_type": "bucket", "name": "my-bucket"},
        ])
        vms = list_cloud_assets(aid, asset_type="vm")
        assert len(vms) == 1
        assert vms[0]["asset_type"] == "vm"

    def test_save_replaces_old(self):
        """Saving assets clears old ones first."""
        aid = self._make_account()
        save_cloud_assets(aid, [
            {"asset_type": "vm", "name": "old-instance"},
        ])
        assert len(list_cloud_assets(aid)) == 1

        save_cloud_assets(aid, [
            {"asset_type": "bucket", "name": "new-bucket-1"},
            {"asset_type": "bucket", "name": "new-bucket-2"},
        ])
        assets = list_cloud_assets(aid)
        assert len(assets) == 2
        assert all(a["asset_type"] == "bucket" for a in assets)


# ── Cloud checks ────────────────────────────────────────────────────


class TestCloudChecks:
    def test_seed_and_list(self):
        """Seeded checks should be retrievable."""
        seed_cloud_checks()
        checks = list_cloud_checks("gcp")
        assert len(checks) == 10

    def test_list_filter_by_category(self):
        """Filter checks by category."""
        seed_cloud_checks()
        # All seeded checks have category 'standard' by default
        checks = list_cloud_checks("gcp", category="standard")
        assert len(checks) == 10
        # Non-existent category returns empty
        assert list_cloud_checks("gcp", category="nope") == []

    def test_seed_idempotent(self):
        """Calling seed_cloud_checks twice should not duplicate."""
        seed_cloud_checks()
        seed_cloud_checks()
        checks = list_cloud_checks("gcp")
        assert len(checks) == 10
