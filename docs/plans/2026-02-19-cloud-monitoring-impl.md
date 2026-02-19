# Cloud Monitoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static "Log Sources" page with a full "Clouds" monitoring section that scans GCP projects for security issues, discovers assets, runs compliance checks, and feeds Cloud Logging into the existing threat detection pipeline.

**Architecture:** Backend-first approach. New SQLite tables for cloud accounts/assets/issues/checks. A GCP scanner module tries service-specific APIs (Compute, Storage, IAM) if available; falls back to Cloud Logging only. Frontend follows NeuralWarden's UI patterns with cloud list, connect wizard, and tabbed detail view.

**Tech Stack:** Next.js 16 + React 19 + Tailwind v4 (frontend), FastAPI + SQLite + Google Cloud Python clients (backend). Per-user data isolation via `user_email` header.

**Key constraint:** GCP service APIs (compute, storage, etc.) are optional — scan them only if the libraries are installed and the service account has permissions. Always fall back to Cloud Logging as the baseline.

---

### Task 1: Database Schema — Cloud Tables

**Files:**
- Modify: `api/database.py`
- Create: `api/cloud_database.py`
- Test: `tests/test_cloud_database.py`

**Step 1: Write the failing test**

Create `tests/test_cloud_database.py`:

```python
"""Tests for cloud monitoring database operations."""
import os
import pytest

os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"

from api.cloud_database import (
    init_cloud_tables,
    create_cloud_account,
    list_cloud_accounts,
    get_cloud_account,
    delete_cloud_account,
    update_cloud_account,
    save_cloud_assets,
    list_cloud_assets,
    save_cloud_issues,
    list_cloud_issues,
    update_cloud_issue_status,
    list_cloud_checks,
    get_issue_counts,
)


@pytest.fixture(autouse=True)
def fresh_db():
    from api.database import _get_conn, init_db
    init_db()
    init_cloud_tables()
    yield


def test_create_and_list_cloud_accounts():
    acc_id = create_cloud_account(
        user_email="test@example.com",
        provider="gcp",
        name="My GCP",
        project_id="my-project-123",
        purpose="production",
        credentials_json='{"type": "service_account"}',
        services=["cloud_logging", "compute"],
    )
    assert acc_id
    accounts = list_cloud_accounts(user_email="test@example.com")
    assert len(accounts) == 1
    assert accounts[0]["name"] == "My GCP"
    assert accounts[0]["project_id"] == "my-project-123"


def test_get_cloud_account():
    acc_id = create_cloud_account(
        user_email="test@example.com",
        provider="gcp",
        name="Test Cloud",
        project_id="proj-1",
    )
    acc = get_cloud_account(acc_id)
    assert acc is not None
    assert acc["name"] == "Test Cloud"


def test_delete_cloud_account():
    acc_id = create_cloud_account(
        user_email="test@example.com",
        provider="gcp",
        name="Delete Me",
        project_id="proj-del",
    )
    delete_cloud_account(acc_id)
    assert get_cloud_account(acc_id) is None


def test_save_and_list_cloud_issues():
    acc_id = create_cloud_account(
        user_email="test@example.com",
        provider="gcp",
        name="Scan Target",
        project_id="proj-scan",
    )
    issues = [
        {
            "rule_code": "gcp_001",
            "title": "MFA not enabled",
            "description": "Root account missing MFA",
            "severity": "critical",
            "location": "Scan Target",
            "fix_time": "5 min",
        },
        {
            "rule_code": "gcp_002",
            "title": "Open SSH",
            "description": "Firewall allows 0.0.0.0/0:22",
            "severity": "high",
            "location": "Scan Target",
            "fix_time": "10 min",
        },
    ]
    save_cloud_issues(acc_id, issues)
    found = list_cloud_issues(acc_id)
    assert len(found) == 2
    assert found[0]["severity"] == "critical"


def test_update_issue_status():
    acc_id = create_cloud_account(
        user_email="test@example.com",
        provider="gcp",
        name="Status Test",
        project_id="proj-status",
    )
    save_cloud_issues(acc_id, [{
        "rule_code": "gcp_003",
        "title": "Old keys",
        "severity": "medium",
    }])
    issues = list_cloud_issues(acc_id)
    update_cloud_issue_status(issues[0]["id"], "ignored")
    updated = list_cloud_issues(acc_id)
    assert updated[0]["status"] == "ignored"


def test_get_issue_counts():
    acc_id = create_cloud_account(
        user_email="test@example.com",
        provider="gcp",
        name="Counts",
        project_id="proj-counts",
    )
    save_cloud_issues(acc_id, [
        {"rule_code": "gcp_001", "title": "A", "severity": "critical"},
        {"rule_code": "gcp_002", "title": "B", "severity": "high"},
        {"rule_code": "gcp_003", "title": "C", "severity": "high"},
        {"rule_code": "gcp_004", "title": "D", "severity": "medium"},
    ])
    counts = get_issue_counts(acc_id)
    assert counts["critical"] == 1
    assert counts["high"] == 2
    assert counts["medium"] == 1
    assert counts["total"] == 4
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/test_cloud_database.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.cloud_database'`

**Step 3: Write the implementation**

Create `api/cloud_database.py`:

```python
"""SQLite persistence for cloud monitoring — accounts, assets, issues, checks."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from api.database import _get_conn


def init_cloud_tables() -> None:
    """Create cloud monitoring tables if they don't exist."""
    conn = _get_conn()
    try:
        conn.executescript("""
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
            );

            CREATE TABLE IF NOT EXISTS cloud_assets (
                id TEXT PRIMARY KEY,
                cloud_account_id TEXT NOT NULL,
                asset_type TEXT NOT NULL,
                name TEXT NOT NULL,
                region TEXT DEFAULT '',
                metadata_json TEXT DEFAULT '{}',
                discovered_at TEXT NOT NULL,
                FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE
            );

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
                discovered_at TEXT NOT NULL,
                FOREIGN KEY (cloud_account_id) REFERENCES cloud_accounts(id) ON DELETE CASCADE,
                FOREIGN KEY (asset_id) REFERENCES cloud_assets(id)
            );

            CREATE TABLE IF NOT EXISTS cloud_checks (
                id TEXT PRIMARY KEY,
                provider TEXT DEFAULT 'gcp',
                rule_code TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category TEXT DEFAULT 'standard',
                check_function TEXT NOT NULL
            );
        """)
        conn.commit()
    finally:
        conn.close()


# ── Cloud Accounts ──

def create_cloud_account(
    user_email: str,
    provider: str = "gcp",
    name: str = "",
    project_id: str = "",
    purpose: str = "production",
    credentials_json: str = "",
    services: list[str] | None = None,
) -> str:
    acc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        conn.execute(
            """INSERT INTO cloud_accounts
               (id, user_email, provider, name, project_id, purpose,
                credentials_json, services, created_at, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')""",
            (acc_id, user_email, provider, name, project_id, purpose,
             credentials_json, json.dumps(services or []), now),
        )
        conn.commit()
        return acc_id
    finally:
        conn.close()


def list_cloud_accounts(user_email: str = "") -> list[dict]:
    conn = _get_conn()
    try:
        if user_email:
            rows = conn.execute(
                "SELECT * FROM cloud_accounts WHERE user_email = ? ORDER BY created_at DESC",
                (user_email,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM cloud_accounts ORDER BY created_at DESC"
            ).fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["services"] = json.loads(d.get("services", "[]"))
            results.append(d)
        return results
    finally:
        conn.close()


def get_cloud_account(account_id: str) -> dict | None:
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM cloud_accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["services"] = json.loads(d.get("services", "[]"))
        return d
    finally:
        conn.close()


def update_cloud_account(account_id: str, **fields) -> None:
    allowed = {"name", "purpose", "credentials_json", "services", "status", "last_scan_at"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    if "services" in updates and isinstance(updates["services"], list):
        updates["services"] = json.dumps(updates["services"])
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [account_id]
    conn = _get_conn()
    try:
        conn.execute(
            f"UPDATE cloud_accounts SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
    finally:
        conn.close()


def delete_cloud_account(account_id: str) -> None:
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM cloud_issues WHERE cloud_account_id = ?", (account_id,))
        conn.execute("DELETE FROM cloud_assets WHERE cloud_account_id = ?", (account_id,))
        conn.execute("DELETE FROM cloud_accounts WHERE id = ?", (account_id,))
        conn.commit()
    finally:
        conn.close()


# ── Cloud Assets ──

def save_cloud_assets(account_id: str, assets: list[dict]) -> int:
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        # Clear old assets for this account before re-scan
        conn.execute("DELETE FROM cloud_assets WHERE cloud_account_id = ?", (account_id,))
        for asset in assets:
            conn.execute(
                """INSERT INTO cloud_assets
                   (id, cloud_account_id, asset_type, name, region, metadata_json, discovered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), account_id, asset["asset_type"], asset["name"],
                 asset.get("region", ""), json.dumps(asset.get("metadata", {})), now),
            )
        conn.commit()
        return len(assets)
    finally:
        conn.close()


def list_cloud_assets(account_id: str, asset_type: str = "") -> list[dict]:
    conn = _get_conn()
    try:
        if asset_type:
            rows = conn.execute(
                "SELECT * FROM cloud_assets WHERE cloud_account_id = ? AND asset_type = ? ORDER BY name",
                (account_id, asset_type),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM cloud_assets WHERE cloud_account_id = ? ORDER BY asset_type, name",
                (account_id,),
            ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


# ── Cloud Issues ──

def save_cloud_issues(account_id: str, issues: list[dict]) -> int:
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn()
    try:
        for issue in issues:
            conn.execute(
                """INSERT INTO cloud_issues
                   (id, cloud_account_id, asset_id, rule_code, title, description,
                    severity, location, fix_time, status, discovered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?)""",
                (str(uuid.uuid4()), account_id, issue.get("asset_id"),
                 issue["rule_code"], issue["title"], issue.get("description", ""),
                 issue["severity"], issue.get("location", ""),
                 issue.get("fix_time", ""), now),
            )
        conn.commit()
        return len(issues)
    finally:
        conn.close()


def list_cloud_issues(account_id: str, status: str = "", severity: str = "") -> list[dict]:
    conn = _get_conn()
    try:
        query = "SELECT * FROM cloud_issues WHERE cloud_account_id = ?"
        params: list = [account_id]
        if status:
            query += " AND status = ?"
            params.append(status)
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        query += " ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, discovered_at DESC"
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def update_cloud_issue_status(issue_id: str, status: str) -> None:
    conn = _get_conn()
    try:
        conn.execute(
            "UPDATE cloud_issues SET status = ? WHERE id = ?", (status, issue_id)
        )
        conn.commit()
    finally:
        conn.close()


def clear_cloud_issues(account_id: str) -> None:
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM cloud_issues WHERE cloud_account_id = ?", (account_id,))
        conn.commit()
    finally:
        conn.close()


def get_issue_counts(account_id: str) -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            """SELECT severity, COUNT(*) as cnt FROM cloud_issues
               WHERE cloud_account_id = ? AND status = 'todo'
               GROUP BY severity""",
            (account_id,),
        ).fetchall()
        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "total": 0}
        for row in rows:
            sev = row["severity"]
            cnt = row["cnt"]
            if sev in counts:
                counts[sev] = cnt
            counts["total"] += cnt
        return counts
    finally:
        conn.close()


# ── Cloud Checks (static definitions) ──

GCP_CHECKS = [
    {"rule_code": "gcp_001", "title": "Project should have org-level MFA", "description": "The root/org account should enforce multi-factor authentication for all users.", "category": "standard", "check_function": "check_org_mfa"},
    {"rule_code": "gcp_002", "title": "Firewall allows unrestricted SSH (0.0.0.0/0:22)", "description": "Firewall rules should not allow unrestricted SSH access from the internet.", "category": "standard", "check_function": "check_open_ssh"},
    {"rule_code": "gcp_003", "title": "Service account keys older than 90 days", "description": "Service account keys should be rotated within 90 days to limit exposure.", "category": "standard", "check_function": "check_key_rotation"},
    {"rule_code": "gcp_004", "title": "GCS buckets are publicly accessible", "description": "Cloud Storage buckets should not be publicly accessible unless required.", "category": "standard", "check_function": "check_public_buckets"},
    {"rule_code": "gcp_005", "title": "Cloud SQL instances are publicly accessible", "description": "Cloud SQL instances should restrict authorized networks to known IPs.", "category": "standard", "check_function": "check_public_sql"},
    {"rule_code": "gcp_006", "title": "Instances use default service account", "description": "Compute instances should use dedicated service accounts, not the default.", "category": "standard", "check_function": "check_default_sa"},
    {"rule_code": "gcp_007", "title": "Cloud SQL backups not enabled", "description": "Cloud SQL instances should have automated backups configured.", "category": "standard", "check_function": "check_sql_backups"},
    {"rule_code": "gcp_008", "title": "VPC flow logs disabled", "description": "VPC subnets should have flow logs enabled for network monitoring.", "category": "standard", "check_function": "check_flow_logs"},
    {"rule_code": "gcp_009", "title": "OS Login not enabled on project", "description": "OS Login should be enabled at the project level for centralized SSH management.", "category": "standard", "check_function": "check_os_login"},
    {"rule_code": "gcp_010", "title": "API keys not restricted", "description": "API keys should have application and API restrictions applied.", "category": "standard", "check_function": "check_api_key_restrictions"},
]


def seed_cloud_checks() -> None:
    conn = _get_conn()
    try:
        for check in GCP_CHECKS:
            conn.execute(
                """INSERT OR IGNORE INTO cloud_checks
                   (id, provider, rule_code, title, description, category, check_function)
                   VALUES (?, 'gcp', ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), check["rule_code"], check["title"],
                 check["description"], check["category"], check["check_function"]),
            )
        conn.commit()
    finally:
        conn.close()


def list_cloud_checks(provider: str = "gcp", category: str = "") -> list[dict]:
    conn = _get_conn()
    try:
        query = "SELECT * FROM cloud_checks WHERE provider = ?"
        params: list = [provider]
        if category:
            query += " AND category = ?"
            params.append(category)
        query += " ORDER BY rule_code"
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()
```

**Step 4: Hook up init in `api/database.py`**

Add to `api/database.py` `init_db()` function — after the existing schema init, call cloud table init:

At the end of `init_db()` (line 58, before `conn.close()`), add:
```python
    # Initialize cloud monitoring tables
    from api.cloud_database import init_cloud_tables, seed_cloud_checks
    init_cloud_tables()
    seed_cloud_checks()
```

Actually better: call it right after `init_db()` in `api/main.py`:
```python
from api.cloud_database import init_cloud_tables, seed_cloud_checks
init_cloud_tables()
seed_cloud_checks()
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/test_cloud_database.py -v`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add api/cloud_database.py tests/test_cloud_database.py api/main.py
git commit -m "feat(clouds): add database schema and CRUD for cloud accounts, assets, issues, checks"
```

---

### Task 2: GCP Scanner Backend

**Files:**
- Create: `api/gcp_scanner.py`
- Modify: `pyproject.toml` (add optional deps)
- Test: `tests/test_gcp_scanner.py`

**Step 1: Write the failing test**

Create `tests/test_gcp_scanner.py`:

```python
"""Tests for the GCP scanner — compliance checks against mock GCP data."""
import pytest
from unittest.mock import MagicMock, patch

from api.gcp_scanner import (
    probe_available_services,
    run_scan,
    _check_open_ssh,
    _check_public_buckets,
    _check_default_sa,
)


def test_probe_available_services_all_unavailable():
    """When no GCP libraries are installed, only cloud_logging is available."""
    with patch("api.gcp_scanner._try_import", return_value=False):
        services = probe_available_services()
        assert services == ["cloud_logging"]


def test_check_open_ssh_finds_violation():
    """Firewall rule allowing 0.0.0.0/0 to port 22 should produce an issue."""
    firewall = MagicMock()
    firewall.name = "default-allow-ssh"
    firewall.direction = "INGRESS"
    firewall.source_ranges = ["0.0.0.0/0"]
    firewall.allowed = [MagicMock(I_p_protocol="tcp", ports=["22"])]
    issues = _check_open_ssh([firewall])
    assert len(issues) == 1
    assert issues[0]["rule_code"] == "gcp_002"
    assert issues[0]["severity"] == "high"


def test_check_open_ssh_clean():
    """Firewall rule with restricted source should not produce issue."""
    firewall = MagicMock()
    firewall.name = "restricted-ssh"
    firewall.direction = "INGRESS"
    firewall.source_ranges = ["10.0.0.0/8"]
    firewall.allowed = [MagicMock(I_p_protocol="tcp", ports=["22"])]
    issues = _check_open_ssh([firewall])
    assert len(issues) == 0


def test_check_public_buckets_violation():
    """Bucket with allUsers/allAuthenticatedUsers should flag."""
    bucket = MagicMock()
    bucket.name = "my-public-bucket"
    policy = MagicMock()
    binding = MagicMock()
    binding.role = "roles/storage.objectViewer"
    binding.members = ["allUsers"]
    policy.bindings = [binding]
    bucket.get_iam_policy.return_value = policy
    issues = _check_public_buckets([bucket])
    assert len(issues) == 1
    assert issues[0]["rule_code"] == "gcp_004"


def test_check_default_sa():
    """Instance using default service account should flag."""
    instance = MagicMock()
    instance.name = "my-vm"
    instance.zone = "us-central1-a"
    sa = MagicMock()
    sa.email = "123456-compute@developer.gserviceaccount.com"
    instance.service_accounts = [sa]
    issues = _check_default_sa([instance])
    assert len(issues) == 1
    assert issues[0]["rule_code"] == "gcp_006"


def test_run_scan_cloud_logging_fallback():
    """When no GCP service APIs are available, scan falls back to cloud logging only."""
    with patch("api.gcp_scanner.probe_available_services", return_value=["cloud_logging"]):
        with patch("api.gcp_scanner._scan_cloud_logging", return_value=([], [])):
            result = run_scan(
                project_id="test-project",
                credentials_json="{}",
                services=["compute", "storage", "cloud_logging"],
            )
            assert result["scan_type"] == "cloud_logging_only"
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/test_gcp_scanner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api.gcp_scanner'`

**Step 3: Write the implementation**

Create `api/gcp_scanner.py`:

```python
"""GCP Scanner — discover assets and run compliance checks.

Tries GCP service APIs if available; falls back to Cloud Logging only.
"""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any


def _try_import(module: str) -> bool:
    """Check if a Python module is importable."""
    try:
        __import__(module)
        return True
    except ImportError:
        return False


def probe_available_services() -> list[str]:
    """Return list of GCP services we can actually scan (libraries installed)."""
    available = ["cloud_logging"]  # Always available (already a dependency)
    if _try_import("google.cloud.compute_v1"):
        available.extend(["compute", "firewall"])
    if _try_import("google.cloud.storage"):
        available.append("storage")
    if _try_import("google.cloud.resourcemanager_v3"):
        available.append("resource_manager")
    return available


def _make_credentials(credentials_json: str):
    """Create GCP credentials from a service account JSON string."""
    from google.oauth2 import service_account
    info = json.loads(credentials_json)
    return service_account.Credentials.from_service_account_info(info)


def _temp_credentials_file(credentials_json: str) -> str:
    """Write credentials to a temp file and return the path."""
    fd, path = tempfile.mkstemp(suffix=".json", prefix="gcp_creds_")
    with os.fdopen(fd, "w") as f:
        f.write(credentials_json)
    return path


# ── Compliance Check Functions ──


def _check_open_ssh(firewall_rules: list) -> list[dict]:
    """gcp_002: Check for firewall rules allowing 0.0.0.0/0 to port 22."""
    issues = []
    for rule in firewall_rules:
        if getattr(rule, "direction", "") != "INGRESS":
            continue
        sources = getattr(rule, "source_ranges", []) or []
        if "0.0.0.0/0" not in sources and "::/0" not in sources:
            continue
        for allowed in getattr(rule, "allowed", []):
            ports = getattr(allowed, "ports", []) or []
            proto = getattr(allowed, "I_p_protocol", "") or ""
            if proto in ("tcp", "all") and ("22" in ports or not ports):
                issues.append({
                    "rule_code": "gcp_002",
                    "title": f"Firewall '{rule.name}' allows unrestricted SSH (0.0.0.0/0:22)",
                    "description": f"Firewall rule '{rule.name}' allows SSH access from any IP. Restrict source_ranges to known CIDR blocks.",
                    "severity": "high",
                    "location": f"Firewall: {rule.name}",
                    "fix_time": "10 min",
                })
    return issues


def _check_public_buckets(buckets: list) -> list[dict]:
    """gcp_004: Check for publicly accessible GCS buckets."""
    issues = []
    for bucket in buckets:
        try:
            policy = bucket.get_iam_policy()
            for binding in getattr(policy, "bindings", []):
                members = getattr(binding, "members", []) or []
                if "allUsers" in members or "allAuthenticatedUsers" in members:
                    issues.append({
                        "rule_code": "gcp_004",
                        "title": f"GCS bucket '{bucket.name}' is publicly accessible",
                        "description": f"Bucket '{bucket.name}' has public IAM binding ({binding.role}). Remove allUsers/allAuthenticatedUsers unless intentional.",
                        "severity": "high",
                        "location": f"GCS: {bucket.name}",
                        "fix_time": "5 min",
                    })
                    break
        except Exception:
            continue
    return issues


def _check_default_sa(instances: list) -> list[dict]:
    """gcp_006: Check for instances using the default Compute Engine service account."""
    issues = []
    for inst in instances:
        for sa in getattr(inst, "service_accounts", []) or []:
            email = getattr(sa, "email", "")
            if "compute@developer.gserviceaccount.com" in email:
                issues.append({
                    "rule_code": "gcp_006",
                    "title": f"Instance '{inst.name}' uses default service account",
                    "description": f"VM '{inst.name}' uses the default Compute Engine SA. Create a dedicated SA with least-privilege permissions.",
                    "severity": "medium",
                    "location": f"VM: {inst.name} ({getattr(inst, 'zone', 'unknown')})",
                    "fix_time": "15 min",
                })
    return issues


# ── Service Scanners ──


def _scan_compute(project_id: str, credentials) -> tuple[list[dict], list[dict]]:
    """Scan Compute Engine instances and firewall rules."""
    from google.cloud.compute_v1 import InstancesClient, FirewallsClient
    assets = []
    issues = []

    # Firewall rules
    try:
        fw_client = FirewallsClient(credentials=credentials)
        firewalls = list(fw_client.list(project=project_id))
        for fw in firewalls:
            assets.append({
                "asset_type": "firewall_rule",
                "name": fw.name,
                "region": "global",
                "metadata": {"direction": fw.direction, "priority": fw.priority},
            })
        issues.extend(_check_open_ssh(firewalls))
    except Exception:
        pass

    # Instances (across all zones)
    try:
        inst_client = InstancesClient(credentials=credentials)
        agg = inst_client.aggregated_list(project=project_id)
        instances = []
        for zone, response in agg:
            for inst in getattr(response, "instances", []) or []:
                instances.append(inst)
                assets.append({
                    "asset_type": "compute_instance",
                    "name": inst.name,
                    "region": zone.split("/")[-1] if "/" in zone else zone,
                    "metadata": {"machine_type": inst.machine_type, "status": inst.status},
                })
        issues.extend(_check_default_sa(instances))
    except Exception:
        pass

    return assets, issues


def _scan_storage(project_id: str, credentials) -> tuple[list[dict], list[dict]]:
    """Scan GCS buckets."""
    from google.cloud.storage import Client as StorageClient
    assets = []
    issues = []

    try:
        client = StorageClient(project=project_id, credentials=credentials)
        buckets = list(client.list_buckets())
        for b in buckets:
            assets.append({
                "asset_type": "gcs_bucket",
                "name": b.name,
                "region": b.location or "multi-region",
                "metadata": {"storage_class": b.storage_class},
            })
        issues.extend(_check_public_buckets(buckets))
    except Exception:
        pass

    return assets, issues


def _scan_cloud_logging(project_id: str, credentials_json: str) -> tuple[list[dict], list[dict]]:
    """Fetch recent Cloud Logging entries and detect issues via deterministic parser."""
    from api.gcp_logging import fetch_logs, deterministic_parse

    # Temporarily set credentials for the logging client
    creds_path = _temp_credentials_file(credentials_json) if credentials_json else None
    old_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

    assets = []
    issues = []
    try:
        lines = fetch_logs(project_id, log_filter="severity>=WARNING", max_entries=500, hours_back=24)
        if lines:
            entries = deterministic_parse(lines)
            # Count error types for issue generation
            error_count = sum(1 for e in entries if e.event_type in ("server_error", "error"))
            auth_fail_count = sum(1 for e in entries if e.event_type == "failed_auth")
            recon_count = sum(1 for e in entries if e.event_type == "recon_probe")

            if error_count > 10:
                issues.append({
                    "rule_code": "log_001",
                    "title": f"{error_count} server errors in last 24h",
                    "description": f"Detected {error_count} error-level log entries. Investigate application health.",
                    "severity": "medium",
                    "location": f"Cloud Logging ({project_id})",
                    "fix_time": "30 min",
                })
            if auth_fail_count > 5:
                issues.append({
                    "rule_code": "log_002",
                    "title": f"{auth_fail_count} failed authentication attempts",
                    "description": f"Detected {auth_fail_count} auth failures (401/403). Possible brute-force or misconfigured clients.",
                    "severity": "high",
                    "location": f"Cloud Logging ({project_id})",
                    "fix_time": "15 min",
                })
            if recon_count > 3:
                issues.append({
                    "rule_code": "log_003",
                    "title": f"{recon_count} reconnaissance probes detected",
                    "description": f"Requests to common attack paths (/wp-admin, /.env, /.git). Consider WAF rules.",
                    "severity": "medium",
                    "location": f"Cloud Logging ({project_id})",
                    "fix_time": "20 min",
                })
    except Exception:
        pass
    finally:
        if old_creds:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = old_creds
        elif creds_path and "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
        if creds_path:
            try:
                os.unlink(creds_path)
            except OSError:
                pass

    return assets, issues


# ── Main Scan Orchestrator ──


def run_scan(
    project_id: str,
    credentials_json: str = "",
    services: list[str] | None = None,
) -> dict[str, Any]:
    """Run a full scan of a GCP project.

    Tries each requested service API; falls back to Cloud Logging if
    service-specific APIs are unavailable.
    """
    requested = set(services or ["cloud_logging"])
    available = set(probe_available_services())

    all_assets: list[dict] = []
    all_issues: list[dict] = []
    scanned_services: list[str] = []
    scan_type = "full"

    credentials = None
    if credentials_json and _try_import("google.oauth2.service_account"):
        try:
            credentials = _make_credentials(credentials_json)
        except Exception:
            pass

    # Scan compute (VMs + firewalls) if available
    if "compute" in requested and "compute" in available and credentials:
        assets, issues = _scan_compute(project_id, credentials)
        all_assets.extend(assets)
        all_issues.extend(issues)
        scanned_services.append("compute")

    # Scan storage if available
    if "storage" in requested and "storage" in available and credentials:
        assets, issues = _scan_storage(project_id, credentials)
        all_assets.extend(assets)
        all_issues.extend(issues)
        scanned_services.append("storage")

    # Always scan cloud logging
    if "cloud_logging" in requested:
        assets, issues = _scan_cloud_logging(project_id, credentials_json)
        all_assets.extend(assets)
        all_issues.extend(issues)
        scanned_services.append("cloud_logging")

    if scanned_services == ["cloud_logging"]:
        scan_type = "cloud_logging_only"

    return {
        "scan_type": scan_type,
        "scanned_services": scanned_services,
        "assets": all_assets,
        "issues": all_issues,
        "asset_count": len(all_assets),
        "issue_count": len(all_issues),
    }
```

**Step 4: Update pyproject.toml optional dependencies**

Add to `pyproject.toml` `[project.optional-dependencies]`:

```toml
[project.optional-dependencies]
gcp = [
    "google-cloud-logging>=3.9.0",
    "google-cloud-compute>=1.0.0",
    "google-cloud-storage>=2.0.0",
    "google-cloud-resource-manager>=1.0.0",
    "google-auth>=2.0.0",
]
```

**Step 5: Run tests**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/test_gcp_scanner.py -v`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add api/gcp_scanner.py tests/test_gcp_scanner.py pyproject.toml
git commit -m "feat(clouds): add GCP scanner with compliance checks and cloud logging fallback"
```

---

### Task 3: Clouds API Router

**Files:**
- Create: `api/routers/clouds.py`
- Modify: `api/main.py:18,41` (register new router)
- Test: `tests/test_clouds_router.py`

**Step 1: Write the failing test**

Create `tests/test_clouds_router.py`:

```python
"""Tests for the /api/clouds endpoints."""
import os
import pytest
from fastapi.testclient import TestClient

os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"

from api.main import app
from api.cloud_database import init_cloud_tables, seed_cloud_checks

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    from api.database import init_db
    init_db()
    init_cloud_tables()
    seed_cloud_checks()
    yield


HEADERS = {"X-User-Email": "test@example.com"}


def test_list_clouds_empty():
    res = client.get("/api/clouds", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["accounts"] == []


def test_create_cloud():
    res = client.post("/api/clouds", headers=HEADERS, json={
        "name": "My GCP Project",
        "project_id": "my-proj-123",
        "purpose": "production",
        "credentials_json": '{"type": "service_account"}',
        "services": ["cloud_logging"],
    })
    assert res.status_code == 201
    data = res.json()
    assert data["id"]
    assert data["name"] == "My GCP Project"


def test_get_cloud():
    create_res = client.post("/api/clouds", headers=HEADERS, json={
        "name": "Get Test",
        "project_id": "get-proj",
    })
    cloud_id = create_res.json()["id"]
    res = client.get(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["name"] == "Get Test"


def test_delete_cloud():
    create_res = client.post("/api/clouds", headers=HEADERS, json={
        "name": "Del Test",
        "project_id": "del-proj",
    })
    cloud_id = create_res.json()["id"]
    res = client.delete(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert res.status_code == 200
    get_res = client.get(f"/api/clouds/{cloud_id}", headers=HEADERS)
    assert get_res.status_code == 404


def test_list_checks():
    res = client.get("/api/clouds/checks")
    assert res.status_code == 200
    checks = res.json()["checks"]
    assert len(checks) >= 10
    assert checks[0]["rule_code"] == "gcp_001"


def test_list_issues_empty():
    create_res = client.post("/api/clouds", headers=HEADERS, json={
        "name": "Issue Test",
        "project_id": "issue-proj",
    })
    cloud_id = create_res.json()["id"]
    res = client.get(f"/api/clouds/{cloud_id}/issues", headers=HEADERS)
    assert res.status_code == 200
    assert res.json()["issues"] == []


def test_update_issue_status():
    create_res = client.post("/api/clouds", headers=HEADERS, json={
        "name": "Status Proj",
        "project_id": "status-proj",
    })
    cloud_id = create_res.json()["id"]
    # Manually insert an issue to test status update
    from api.cloud_database import save_cloud_issues, list_cloud_issues
    save_cloud_issues(cloud_id, [{"rule_code": "gcp_001", "title": "Test", "severity": "critical"}])
    issues = list_cloud_issues(cloud_id)
    issue_id = issues[0]["id"]
    res = client.patch(f"/api/clouds/issues/{issue_id}", headers=HEADERS, json={"status": "ignored"})
    assert res.status_code == 200
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/test_clouds_router.py -v`
Expected: FAIL (router doesn't exist yet)

**Step 3: Write the implementation**

Create `api/routers/clouds.py`:

```python
"""Router for Cloud Monitoring — accounts, scanning, issues, checks."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.cloud_database import (
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
    seed_cloud_checks,
)

router = APIRouter(prefix="/api/clouds", tags=["clouds"])


# ── Schemas ──

class CreateCloudRequest(BaseModel):
    name: str
    project_id: str
    provider: str = "gcp"
    purpose: str = "production"
    credentials_json: str = ""
    services: list[str] = Field(default_factory=lambda: ["cloud_logging"])


class UpdateCloudRequest(BaseModel):
    name: str | None = None
    purpose: str | None = None
    credentials_json: str | None = None
    services: list[str] | None = None


class UpdateIssueStatusRequest(BaseModel):
    status: str  # todo, in_progress, ignored, solved


# ── Helper ──

def _get_user_email(request: Request) -> str:
    return request.headers.get("X-User-Email", "")


# ── Account Endpoints ──

@router.get("")
async def list_clouds(request: Request):
    email = _get_user_email(request)
    accounts = list_cloud_accounts(user_email=email)
    # Attach issue counts
    for acc in accounts:
        acc["issue_counts"] = get_issue_counts(acc["id"])
    return {"accounts": accounts}


@router.post("", status_code=201)
async def create_cloud(req: CreateCloudRequest, request: Request):
    email = _get_user_email(request)
    acc_id = create_cloud_account(
        user_email=email,
        provider=req.provider,
        name=req.name,
        project_id=req.project_id,
        purpose=req.purpose,
        credentials_json=req.credentials_json,
        services=req.services,
    )
    acc = get_cloud_account(acc_id)
    return acc


@router.get("/checks")
async def get_checks(category: str = ""):
    checks = list_cloud_checks(category=category)
    return {"checks": checks}


@router.get("/{cloud_id}")
async def get_cloud(cloud_id: str, request: Request):
    acc = get_cloud_account(cloud_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    acc["issue_counts"] = get_issue_counts(cloud_id)
    return acc


@router.put("/{cloud_id}")
async def update_cloud(cloud_id: str, req: UpdateCloudRequest, request: Request):
    acc = get_cloud_account(cloud_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    update_cloud_account(cloud_id, **updates)
    return get_cloud_account(cloud_id)


@router.delete("/{cloud_id}")
async def remove_cloud(cloud_id: str, request: Request):
    acc = get_cloud_account(cloud_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    delete_cloud_account(cloud_id)
    return {"deleted": True}


# ── Scan ──

@router.post("/{cloud_id}/scan")
async def scan_cloud(cloud_id: str, request: Request):
    acc = get_cloud_account(cloud_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Cloud account not found")

    from api.gcp_scanner import run_scan

    result = await asyncio.to_thread(
        run_scan,
        project_id=acc["project_id"],
        credentials_json=acc.get("credentials_json", ""),
        services=acc.get("services", ["cloud_logging"]),
    )

    # Clear old issues and save new ones
    clear_cloud_issues(cloud_id)
    if result["assets"]:
        save_cloud_assets(cloud_id, result["assets"])
    if result["issues"]:
        save_cloud_issues(cloud_id, result["issues"])

    # Update last_scan_at
    from datetime import datetime, timezone
    update_cloud_account(cloud_id, last_scan_at=datetime.now(timezone.utc).isoformat())

    return {
        "scan_type": result["scan_type"],
        "scanned_services": result["scanned_services"],
        "asset_count": result["asset_count"],
        "issue_count": result["issue_count"],
        "issue_counts": get_issue_counts(cloud_id),
    }


# ── Issues ──

@router.get("/{cloud_id}/issues")
async def get_cloud_issues(cloud_id: str, status: str = "", severity: str = ""):
    issues = list_cloud_issues(cloud_id, status=status, severity=severity)
    return {"issues": issues}


@router.patch("/issues/{issue_id}")
async def patch_issue(issue_id: str, req: UpdateIssueStatusRequest):
    update_cloud_issue_status(issue_id, req.status)
    return {"updated": True}


# ── Assets ──

@router.get("/{cloud_id}/assets")
async def get_cloud_assets(cloud_id: str, asset_type: str = ""):
    assets = list_cloud_assets(cloud_id, asset_type=asset_type)
    return {"assets": assets}
```

**Step 4: Register router in `api/main.py`**

Add to imports (line 18):
```python
from api.routers import analyze, clouds, export, gcp_logging, generator, hitl, reports, samples, stream, watcher
```

Add after line 41:
```python
app.include_router(clouds.router)
```

Also add cloud table init after `init_db()`:
```python
from api.cloud_database import init_cloud_tables, seed_cloud_checks
init_cloud_tables()
seed_cloud_checks()
```

**Step 5: Run tests**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/test_clouds_router.py -v`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add api/routers/clouds.py tests/test_clouds_router.py api/main.py
git commit -m "feat(clouds): add /api/clouds REST endpoints for accounts, scanning, issues, assets"
```

---

### Task 4: Frontend Types & API Client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add TypeScript types**

Append to `frontend/src/lib/types.ts`:

```typescript
// ── Cloud Monitoring ──

export interface CloudAccount {
  id: string;
  user_email: string;
  provider: string;
  name: string;
  project_id: string;
  purpose: string;
  services: string[];
  last_scan_at: string | null;
  created_at: string;
  status: string;
  issue_counts?: IssueCounts;
}

export interface IssueCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface CloudAsset {
  id: string;
  cloud_account_id: string;
  asset_type: string;
  name: string;
  region: string;
  metadata_json: string;
  discovered_at: string;
}

export interface CloudIssue {
  id: string;
  cloud_account_id: string;
  asset_id: string | null;
  rule_code: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  fix_time: string;
  status: "todo" | "in_progress" | "ignored" | "solved";
  discovered_at: string;
}

export interface CloudCheck {
  id: string;
  provider: string;
  rule_code: string;
  title: string;
  description: string;
  category: string;
  check_function: string;
}

export interface ScanResult {
  scan_type: string;
  scanned_services: string[];
  asset_count: number;
  issue_count: number;
  issue_counts: IssueCounts;
}
```

**Step 2: Add API client functions**

Append to `frontend/src/lib/api.ts`:

```typescript
// ── Cloud Monitoring ──

import type {
  CloudAccount,
  CloudAsset,
  CloudIssue,
  CloudCheck,
  ScanResult,
} from "./types";

export async function listClouds(): Promise<CloudAccount[]> {
  const res = await fetch(`${BASE}/clouds`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list clouds: ${res.statusText}`);
  const data = await res.json();
  return data.accounts;
}

export async function createCloud(cloud: {
  name: string;
  project_id: string;
  purpose?: string;
  credentials_json?: string;
  services?: string[];
}): Promise<CloudAccount> {
  const res = await fetch(`${BASE}/clouds`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(cloud),
  });
  if (!res.ok) throw new Error(`Failed to create cloud: ${res.statusText}`);
  return res.json();
}

export async function getCloud(id: string): Promise<CloudAccount> {
  const res = await fetch(`${BASE}/clouds/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to get cloud: ${res.statusText}`);
  return res.json();
}

export async function updateCloud(id: string, updates: Partial<CloudAccount>): Promise<CloudAccount> {
  const res = await fetch(`${BASE}/clouds/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update cloud: ${res.statusText}`);
  return res.json();
}

export async function deleteCloud(id: string): Promise<void> {
  const res = await fetch(`${BASE}/clouds/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete cloud: ${res.statusText}`);
}

export async function scanCloud(id: string): Promise<ScanResult> {
  const res = await fetch(`${BASE}/clouds/${id}/scan`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Scan failed: ${res.statusText}`);
  return res.json();
}

export async function listCloudIssues(
  cloudId: string,
  status?: string,
  severity?: string,
): Promise<CloudIssue[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  const res = await fetch(`${BASE}/clouds/${cloudId}/issues?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list issues: ${res.statusText}`);
  const data = await res.json();
  return data.issues;
}

export async function updateIssueStatus(issueId: string, status: string): Promise<void> {
  const res = await fetch(`${BASE}/clouds/issues/${issueId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update issue: ${res.statusText}`);
}

export async function listCloudAssets(cloudId: string, assetType?: string): Promise<CloudAsset[]> {
  const params = new URLSearchParams();
  if (assetType) params.set("asset_type", assetType);
  const res = await fetch(`${BASE}/clouds/${cloudId}/assets?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list assets: ${res.statusText}`);
  const data = await res.json();
  return data.assets;
}

export async function listCloudChecks(category?: string): Promise<CloudCheck[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const res = await fetch(`${BASE}/clouds/checks?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list checks: ${res.statusText}`);
  const data = await res.json();
  return data.checks;
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat(clouds): add TypeScript types and API client for cloud monitoring"
```

---

### Task 5: Sidebar — Replace Log Sources with Clouds

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx:53`

**Step 1: Replace the Log Sources nav item**

Change line 53 from:
```tsx
<NavItem href="/log-sources" icon={<BoxIcon />} label="Log Sources" count="4" active={pathname === "/log-sources"} />
```
To:
```tsx
<NavItem href="/clouds" icon={<CloudIcon />} label="Clouds" active={pathname.startsWith("/clouds")} />
```

**Step 2: Add CloudIcon function**

After the existing icon functions (around line 157), add:
```tsx
function CloudIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat(clouds): replace Log Sources nav with Clouds in sidebar"
```

---

### Task 6: Cloud List Page (`/clouds`)

**Files:**
- Create: `frontend/src/app/(dashboard)/clouds/page.tsx`

**Step 1: Create the cloud list page**

Use the `@frontend-design` skill for polished UI. The page should:

- `PageShell` with title "Clouds" and cloud icon
- Badge: "N connected clouds" (green pill)
- "Connect Cloud" button (top-right, primary purple)
- Search bar
- Table: Type (GCP icon) | Name | Purpose | Project ID | Issues (severity color dots) | Ignored | Last scan
- Empty state: "No clouds connected yet. Connect your first cloud to start scanning."
- Each row links to `/clouds/[id]`

Create `frontend/src/app/(dashboard)/clouds/page.tsx` — a full page component that:
1. Calls `listClouds()` on mount
2. Renders the table with severity badge dots (red for critical, orange for high, yellow for medium, blue for low)
3. Has a "Connect Cloud" button that navigates to `/clouds/connect`

**Step 2: Verify in browser**

Run: `cd /Users/suryamandadapu/src/neuralwarden/frontend && npm run dev`
Navigate to `http://localhost:3000/clouds`
Expected: Empty state page with "Connect Cloud" button

**Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/page.tsx
git commit -m "feat(clouds): add cloud list page with table"
```

---

### Task 7: Connect Cloud Wizard (`/clouds/connect`)

**Files:**
- Create: `frontend/src/app/(dashboard)/clouds/connect/page.tsx`

**Step 1: Create the connect wizard page**

Multi-step wizard:

1. **Step 1 — Choose Provider**: Cards for "Google Cloud Platform" (active), "AWS" (disabled/coming soon), "Azure" (disabled/coming soon). Similar to NeuralWarden's onboarding screenshot.

2. **Step 2 — Authentication**: Project ID input + Service Account JSON file upload with drag-and-drop zone. Shows validation status.

3. **Step 3 — Configure**: Cloud name input, Purpose dropdown (Production/Staging/Development), Service checkboxes.

4. **Step 4 — Save**: Calls `createCloud()` API, shows success, redirects to `/clouds/[id]`.

The wizard should use the dark left panel + white right panel split layout from the NeuralWarden screenshots.

**Step 2: Verify**

Navigate to `http://localhost:3000/clouds/connect`
Expected: Wizard with GCP provider card selection

**Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/connect/page.tsx
git commit -m "feat(clouds): add connect cloud wizard with GCP auth and service selection"
```

---

### Task 8: Cloud Detail Page — Issues Tab (`/clouds/[id]`)

**Files:**
- Create: `frontend/src/app/(dashboard)/clouds/[id]/page.tsx`
- Create: `frontend/src/app/(dashboard)/clouds/[id]/layout.tsx`

**Step 1: Create the layout with tabs**

The layout provides:
- Header: Cloud name + issue count badge + "Configure" gear button + provider badge (GCP) + "Start Scan" button
- Tab navigation: Issues | Assets | Virtual Machines | Checks
- Shared state for the cloud account data

**Step 2: Create the Issues tab page**

Table matching NeuralWarden's style:
- Type icon (cloud icon for config issues, log icon for log-based) | Name + description subtitle | Severity badge | Location | Fix time | Status pill (To Do / In Progress / Ignored / Solved)
- Search bar
- "All types" dropdown filter
- Filter icon button
- "Actions" dropdown for bulk operations
- Click a row to see details (later: slide-out panel)

**Step 3: Verify**

1. Create a cloud via `/clouds/connect`
2. Navigate to `/clouds/[id]`
3. Click "Start Scan"
4. See issues populate the table

**Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/\[id\]/layout.tsx frontend/src/app/\(dashboard\)/clouds/\[id\]/page.tsx
git commit -m "feat(clouds): add cloud detail layout with tabs and issues page"
```

---

### Task 9: Cloud Detail — Assets Tab

**Files:**
- Create: `frontend/src/app/(dashboard)/clouds/[id]/assets/page.tsx`

**Step 1: Create the assets page**

- Table: Type icon | Name | Region | Status | # Issues
- Filter by asset type (All / Compute Instance / GCS Bucket / Firewall Rule / Cloud SQL / Cloud Run)
- Search bar
- Empty state if no assets discovered yet

**Step 2: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/\[id\]/assets/page.tsx
git commit -m "feat(clouds): add cloud assets tab with type filtering"
```

---

### Task 10: Cloud Detail — Virtual Machines Tab

**Files:**
- Create: `frontend/src/app/(dashboard)/clouds/[id]/virtual-machines/page.tsx`

**Step 1: Create the VMs page**

- Table: Name (zone + instance count) | # Open issues | # Ignored | Severity (highest) | Purpose | Last scan
- "Scan VMs" button (triggers scan with compute filter)
- "Disconnect VMs" button
- Filters the cloud_assets table for `asset_type = 'compute_instance'`

**Step 2: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/\[id\]/virtual-machines/page.tsx
git commit -m "feat(clouds): add virtual machines tab"
```

---

### Task 11: Cloud Detail — Checks Tab

**Files:**
- Create: `frontend/src/app/(dashboard)/clouds/[id]/checks/page.tsx`

**Step 1: Create the checks page**

- Sub-tab filters: Standard | Advanced | Custom
- Table: Rule code | Title | Description | Compliance status (Compliant = green badge, Non-compliant = orange warning badge)
- Compliance status determined by cross-referencing `cloud_checks` with `cloud_issues` — if an issue exists for a rule_code, it's non-compliant
- Search bar

**Step 2: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/\[id\]/checks/page.tsx
git commit -m "feat(clouds): add compliance checks tab with standard/advanced/custom filters"
```

---

### Task 12: Cloud Configure Modal

**Files:**
- Create: `frontend/src/components/CloudConfigModal.tsx`
- Modify: `frontend/src/app/(dashboard)/clouds/[id]/layout.tsx` (wire up gear button)

**Step 1: Create the modal**

Modal matching NeuralWarden's "Edit connected cloud" dialog:
- "Let's configure your cloud" heading
- Name input
- Purpose dropdown (Production / Staging / Development)
- Service account JSON (show current status, allow re-upload)
- "Delete" button (red, bottom-left) with confirmation
- "Cancel" and "Save" buttons (bottom-right)

**Step 2: Commit**

```bash
git add frontend/src/components/CloudConfigModal.tsx frontend/src/app/\(dashboard\)/clouds/\[id\]/layout.tsx
git commit -m "feat(clouds): add cloud configuration modal with edit and delete"
```

---

### Task 13: Remove Old Log Sources Page

**Files:**
- Delete: `frontend/src/app/(dashboard)/log-sources/page.tsx`

**Step 1: Delete the old page**

```bash
rm frontend/src/app/\(dashboard\)/log-sources/page.tsx
```

Verify no other files import from log-sources.

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove old log-sources page (replaced by /clouds)"
```

---

### Task 14: Integration Test — Full Flow

**Step 1: Run all backend tests**

Run: `cd /Users/suryamandadapu/src/neuralwarden && python -m pytest tests/ -v`
Expected: All tests pass (existing + new cloud tests)

**Step 2: Run frontend dev server**

Run: `cd /Users/suryamandadapu/src/neuralwarden/frontend && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Manual verification**

1. Navigate to `/clouds` — see empty list
2. Click "Connect Cloud" — complete wizard
3. See cloud in list
4. Click cloud → see Issues tab (empty before scan)
5. Click "Start Scan" — see issues populate
6. Check Assets, VMs, Checks tabs
7. Configure modal — edit name, change purpose
8. Delete cloud — removed from list

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(clouds): complete cloud monitoring feature — GCP scanning, compliance checks, UI"
```

---

## Task Summary

| # | Task | Files | Est. Steps |
|---|------|-------|------------|
| 1 | Database schema + CRUD | `cloud_database.py`, `database.py` | 6 |
| 2 | GCP Scanner backend | `gcp_scanner.py`, `pyproject.toml` | 6 |
| 3 | Clouds API router | `routers/clouds.py`, `main.py` | 6 |
| 4 | Frontend types + API client | `types.ts`, `api.ts` | 3 |
| 5 | Sidebar nav update | `Sidebar.tsx` | 3 |
| 6 | Cloud list page | `clouds/page.tsx` | 3 |
| 7 | Connect cloud wizard | `clouds/connect/page.tsx` | 3 |
| 8 | Cloud detail — Issues tab | `clouds/[id]/page.tsx`, layout | 4 |
| 9 | Cloud detail — Assets tab | `assets/page.tsx` | 2 |
| 10 | Cloud detail — VMs tab | `virtual-machines/page.tsx` | 2 |
| 11 | Cloud detail — Checks tab | `checks/page.tsx` | 2 |
| 12 | Cloud configure modal | `CloudConfigModal.tsx` | 2 |
| 13 | Remove old log-sources | delete page | 2 |
| 14 | Integration test | all | 4 |
