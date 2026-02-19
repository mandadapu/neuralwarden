# Super Agent & Router Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the basic `run_scan()` with a LangGraph-based Super Agent that routes each asset to active scanning or log analysis, then feeds results into the existing threat pipeline — all with SSE streaming.

**Architecture:** A new LangGraph StateGraph (`cloud_scan_graph.py`) orchestrates: Discovery → Router → parallel Active Scanner / Log Analyzer agents → Aggregate → feed into existing threat pipeline (Detect → Validate → Classify → Report). The scan endpoint becomes SSE-streaming.

**Tech Stack:** LangGraph (StateGraph, Send), FastAPI SSE (sse-starlette), existing threat pipeline, existing gcp_scanner.py check functions.

---

### Task 1: Scan Agent State Definition

**Files:**
- Create: `pipeline/cloud_scan_state.py`
- Test: `tests/test_cloud_scan_state.py`

**Step 1: Write the failing test**

Create `tests/test_cloud_scan_state.py`:

```python
"""Tests for cloud scan agent state."""
import pytest
from pipeline.cloud_scan_state import ScanAgentState


def test_state_has_required_keys():
    state = ScanAgentState(
        cloud_account_id="abc",
        project_id="my-proj",
        credentials_json="{}",
        enabled_services=["cloud_logging"],
    )
    assert state["cloud_account_id"] == "abc"
    assert state["project_id"] == "my-proj"


def test_scan_issues_aggregation():
    """Annotated list fields should support operator.add for parallel fan-in."""
    import operator
    from typing import get_type_hints, Annotated
    hints = get_type_hints(ScanAgentState, include_extras=True)
    # scan_issues should be Annotated with operator.add
    assert hasattr(hints["scan_issues"], "__metadata__")
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_cloud_scan_state.py -v`
Expected: FAIL — module not found

**Step 3: Implement**

Create `pipeline/cloud_scan_state.py`:

```python
"""State definition for the cloud scan super agent."""

from __future__ import annotations

import operator
from typing import Annotated, Any

from typing_extensions import TypedDict

from models.log_entry import LogEntry
from models.threat import ClassifiedThreat
from models.incident_report import IncidentReport


class ScanAgentState(TypedDict, total=False):
    """Shared state for the cloud scan LangGraph pipeline."""

    # ── Input (set once at start) ──
    cloud_account_id: str
    project_id: str
    credentials_json: str
    enabled_services: list[str]

    # ── Discovery ──
    discovered_assets: list[dict]

    # ── Router decisions ──
    public_assets: list[dict]
    private_assets: list[dict]

    # ── Scanner results (Annotated for parallel fan-in) ──
    scan_issues: Annotated[list[dict], operator.add]
    log_lines: Annotated[list[str], operator.add]
    scanned_assets: Annotated[list[dict], operator.add]

    # ── Progress tracking ──
    scan_status: str
    assets_scanned: int
    total_assets: int

    # ── Threat pipeline results ──
    parsed_logs: list[LogEntry]
    threats: list[Any]
    classified_threats: list[ClassifiedThreat]
    report: IncidentReport | None
    agent_metrics: dict[str, dict[str, Any]]

    # ── Metadata ──
    error: str | None
    scan_type: str  # "full" or "cloud_logging_only"
```

**Step 4: Run test**

Run: `.venv/bin/python -m pytest tests/test_cloud_scan_state.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add pipeline/cloud_scan_state.py tests/test_cloud_scan_state.py
git commit -m "feat(super-agent): add ScanAgentState TypedDict"
```

---

### Task 2: Router Node — Public/Private Detection

**Files:**
- Create: `pipeline/agents/cloud_router.py`
- Test: `tests/test_cloud_router.py`

**Step 1: Write the failing test**

Create `tests/test_cloud_router.py`:

```python
"""Tests for the cloud router node — public/private asset detection."""
import pytest
from pipeline.agents.cloud_router import is_public, router_node


class TestIsPublic:
    def test_compute_with_external_ip(self):
        asset = {
            "asset_type": "compute_instance",
            "name": "web-server",
            "metadata": {"networkInterfaces": [{"accessConfigs": [{"natIP": "35.1.2.3"}]}]},
        }
        assert is_public(asset) is True

    def test_compute_internal_only(self):
        asset = {
            "asset_type": "compute_instance",
            "name": "internal-vm",
            "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.5"}]},
        }
        assert is_public(asset) is False

    def test_gcs_bucket_public(self):
        asset = {
            "asset_type": "gcs_bucket",
            "name": "public-data",
            "metadata": {"publicAccessPrevention": "inherited"},
        }
        assert is_public(asset) is True

    def test_gcs_bucket_private(self):
        asset = {
            "asset_type": "gcs_bucket",
            "name": "private-data",
            "metadata": {"publicAccessPrevention": "enforced"},
        }
        assert is_public(asset) is False

    def test_firewall_open(self):
        asset = {
            "asset_type": "firewall_rule",
            "name": "allow-all-ssh",
            "metadata": {"source_ranges": ["0.0.0.0/0"]},
        }
        assert is_public(asset) is True

    def test_firewall_restricted(self):
        asset = {
            "asset_type": "firewall_rule",
            "name": "corp-ssh",
            "metadata": {"source_ranges": ["10.0.0.0/8"]},
        }
        assert is_public(asset) is False

    def test_cloud_sql_public_ip(self):
        asset = {
            "asset_type": "cloud_sql",
            "name": "prod-db",
            "metadata": {"publicIp": "34.56.78.90"},
        }
        assert is_public(asset) is True

    def test_cloud_sql_private(self):
        asset = {
            "asset_type": "cloud_sql",
            "name": "private-db",
            "metadata": {},
        }
        assert is_public(asset) is False


class TestRouterNode:
    def test_splits_assets_correctly(self):
        state = {
            "discovered_assets": [
                {"asset_type": "compute_instance", "name": "web", "metadata": {"networkInterfaces": [{"accessConfigs": [{}]}]}},
                {"asset_type": "compute_instance", "name": "internal", "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.1"}]}},
                {"asset_type": "gcs_bucket", "name": "pub", "metadata": {"publicAccessPrevention": "inherited"}},
            ]
        }
        result = router_node(state)
        assert len(result["public_assets"]) == 2  # web + pub
        assert len(result["private_assets"]) == 1  # internal
```

**Step 2: Implement**

Create `pipeline/agents/cloud_router.py`:

```python
"""Router node — inspects asset metadata to determine public vs private."""

from __future__ import annotations

from pipeline.cloud_scan_state import ScanAgentState


def is_public(asset: dict) -> bool:
    """Determine if a cloud asset is publicly exposed based on its metadata."""
    metadata = asset.get("metadata", {})
    asset_type = asset.get("asset_type", "")

    # Compute Engine: has external IP via accessConfigs
    if asset_type == "compute_instance":
        for iface in metadata.get("networkInterfaces", []):
            if "accessConfigs" in iface:
                return True

    # GCS Bucket: publicAccessPrevention not enforced
    if asset_type == "gcs_bucket":
        if metadata.get("publicAccessPrevention") != "enforced":
            return True

    # Firewall Rule: allows 0.0.0.0/0 or ::/0
    if asset_type == "firewall_rule":
        for src in metadata.get("source_ranges", []):
            if src in ("0.0.0.0/0", "::/0"):
                return True

    # Cloud SQL: has public IP
    if asset_type == "cloud_sql":
        if metadata.get("publicIp"):
            return True

    return False


def router_node(state: ScanAgentState) -> dict:
    """Split discovered assets into public and private lists."""
    assets = state.get("discovered_assets", [])
    public = []
    private = []
    for asset in assets:
        if is_public(asset):
            public.append(asset)
        else:
            private.append(asset)

    return {
        "public_assets": public,
        "private_assets": private,
        "total_assets": len(assets),
        "scan_status": "routing",
    }
```

**Step 3: Run tests, commit**

Run: `.venv/bin/python -m pytest tests/test_cloud_router.py -v`

```bash
git add pipeline/agents/cloud_router.py tests/test_cloud_router.py
git commit -m "feat(super-agent): add router node with public/private detection"
```

---

### Task 3: Active Scanner Agent Node

**Files:**
- Create: `pipeline/agents/active_scanner.py`
- Test: `tests/test_active_scanner.py`

**Step 1: Write the failing test**

Create `tests/test_active_scanner.py`:

```python
"""Tests for the active scanner agent node."""
from unittest.mock import patch, MagicMock
from pipeline.agents.active_scanner import active_scanner_node


def test_scans_firewall_asset():
    state = {
        "current_asset": {
            "asset_type": "firewall_rule",
            "name": "allow-all-ssh",
            "metadata": {"source_ranges": ["0.0.0.0/0"], "direction": "INGRESS"},
        },
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    result = active_scanner_node(state)
    assert "scan_issues" in result
    assert "scanned_assets" in result
    assert len(result["scanned_assets"]) == 1


def test_scans_bucket_asset():
    state = {
        "current_asset": {
            "asset_type": "gcs_bucket",
            "name": "public-bucket",
            "metadata": {},
        },
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    with patch("pipeline.agents.active_scanner._check_bucket_public", return_value=[]):
        result = active_scanner_node(state)
        assert len(result["scanned_assets"]) == 1
```

**Step 2: Implement**

Create `pipeline/agents/active_scanner.py`:

```python
"""Active Scanner Agent — runs compliance checks on public-facing assets."""

from __future__ import annotations

from pipeline.cloud_scan_state import ScanAgentState


def _check_firewall_asset(asset: dict) -> list[dict]:
    """Run firewall compliance checks on a single asset."""
    metadata = asset.get("metadata", {})
    issues = []
    sources = metadata.get("source_ranges", [])
    if any(s in ("0.0.0.0/0", "::/0") for s in sources):
        direction = metadata.get("direction", "INGRESS")
        if direction == "INGRESS":
            issues.append({
                "rule_code": "gcp_002",
                "title": f"Firewall '{asset['name']}' allows unrestricted ingress",
                "description": f"Firewall rule '{asset['name']}' allows traffic from 0.0.0.0/0. Restrict source ranges.",
                "severity": "high",
                "location": f"Firewall: {asset['name']}",
                "fix_time": "10 min",
            })
    return issues


def _check_bucket_public(asset: dict, project_id: str, credentials_json: str) -> list[dict]:
    """Check if a GCS bucket is publicly accessible via IAM."""
    try:
        from api.gcp_scanner import _make_credentials
        from google.cloud.storage import Client as StorageClient
        creds = _make_credentials(credentials_json)
        client = StorageClient(project=project_id, credentials=creds)
        bucket = client.get_bucket(asset["name"])
        policy = bucket.get_iam_policy()
        for binding in policy.bindings:
            if "allUsers" in binding.get("members", []) or "allAuthenticatedUsers" in binding.get("members", []):
                return [{
                    "rule_code": "gcp_004",
                    "title": f"GCS bucket '{asset['name']}' is publicly accessible",
                    "description": f"Bucket has public IAM binding. Remove allUsers/allAuthenticatedUsers.",
                    "severity": "critical",
                    "location": f"GCS: {asset['name']}",
                    "fix_time": "5 min",
                }]
    except Exception:
        pass
    return []


def _check_compute_asset(asset: dict) -> list[dict]:
    """Check compute instance for default service account."""
    metadata = asset.get("metadata", {})
    issues = []
    for sa in metadata.get("service_accounts", []):
        if "compute@developer.gserviceaccount.com" in sa.get("email", ""):
            issues.append({
                "rule_code": "gcp_006",
                "title": f"Instance '{asset['name']}' uses default service account",
                "description": "Use a dedicated service account with least-privilege permissions.",
                "severity": "medium",
                "location": f"VM: {asset['name']}",
                "fix_time": "15 min",
            })
    return issues


def active_scanner_node(state: ScanAgentState) -> dict:
    """Scan a single public asset and return issues found."""
    asset = state["current_asset"]
    asset_type = asset.get("asset_type", "")
    project_id = state.get("project_id", "")
    creds = state.get("credentials_json", "")

    issues = []
    if asset_type == "firewall_rule":
        issues = _check_firewall_asset(asset)
    elif asset_type == "gcs_bucket":
        issues = _check_bucket_public(asset, project_id, creds)
    elif asset_type == "compute_instance":
        issues = _check_compute_asset(asset)

    return {
        "scan_issues": issues,
        "scanned_assets": [{"asset": asset["name"], "route": "active", "issues_found": len(issues)}],
    }
```

**Step 3: Run tests, commit**

```bash
git add pipeline/agents/active_scanner.py tests/test_active_scanner.py
git commit -m "feat(super-agent): add active scanner agent node"
```

---

### Task 4: Log Analysis Agent Node

**Files:**
- Create: `pipeline/agents/log_analyzer.py`
- Test: `tests/test_log_analyzer.py`

**Step 1: Write the failing test**

Create `tests/test_log_analyzer.py`:

```python
"""Tests for the log analysis agent node."""
from unittest.mock import patch
from pipeline.agents.log_analyzer import log_analyzer_node


def test_returns_log_lines_for_private_asset():
    mock_lines = [
        "2026-02-19T10:00:00Z WARNING compute/internal-vm: GET /admin status=403 src=1.2.3.4",
        "2026-02-19T10:01:00Z ERROR compute/internal-vm: connection refused",
    ]
    state = {
        "current_asset": {
            "asset_type": "compute_instance",
            "name": "internal-vm",
            "metadata": {},
        },
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=mock_lines):
        result = log_analyzer_node(state)
        assert len(result["log_lines"]) == 2
        assert len(result["scanned_assets"]) == 1
        assert result["scanned_assets"][0]["route"] == "log"


def test_empty_logs_returns_empty():
    state = {
        "current_asset": {"asset_type": "compute_instance", "name": "quiet-vm", "metadata": {}},
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=[]):
        result = log_analyzer_node(state)
        assert result["log_lines"] == []
```

**Step 2: Implement**

Create `pipeline/agents/log_analyzer.py`:

```python
"""Log Analysis Agent — queries Cloud Logging for private assets."""

from __future__ import annotations

import os
import tempfile

from pipeline.cloud_scan_state import ScanAgentState


def _fetch_asset_logs(
    project_id: str,
    asset_name: str,
    asset_type: str,
    credentials_json: str,
) -> list[str]:
    """Fetch Cloud Logging entries for a specific resource."""
    try:
        from api.gcp_logging import fetch_logs
    except ImportError:
        return []

    # Build resource-specific filter
    resource_filter = ""
    if asset_type == "compute_instance":
        resource_filter = f'resource.type="gce_instance" AND resource.labels.instance_id="{asset_name}"'
    elif asset_type == "cloud_sql":
        resource_filter = f'resource.type="cloudsql_database" AND resource.labels.database_id="{asset_name}"'
    elif asset_type == "gcs_bucket":
        resource_filter = f'resource.type="gcs_bucket" AND resource.labels.bucket_name="{asset_name}"'
    else:
        resource_filter = f'resource.labels.service_name="{asset_name}"'

    log_filter = f'({resource_filter}) AND severity>=WARNING'

    # Temporarily set credentials
    creds_path = None
    old_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_json:
        fd, creds_path = tempfile.mkstemp(suffix=".json", prefix="gcp_creds_")
        with os.fdopen(fd, "w") as f:
            f.write(credentials_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

    try:
        return fetch_logs(project_id, log_filter=log_filter, max_entries=200, hours_back=24)
    except Exception:
        return []
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


def log_analyzer_node(state: ScanAgentState) -> dict:
    """Analyze a private asset by querying its Cloud Logging entries."""
    asset = state["current_asset"]
    project_id = state.get("project_id", "")
    creds = state.get("credentials_json", "")

    lines = _fetch_asset_logs(
        project_id=project_id,
        asset_name=asset["name"],
        asset_type=asset.get("asset_type", ""),
        credentials_json=creds,
    )

    # Also generate log-based issues from the lines
    scan_issues = []
    if lines:
        error_count = sum(1 for l in lines if " ERROR " in l or " CRITICAL " in l)
        auth_count = sum(1 for l in lines if "status=401" in l or "status=403" in l)

        if error_count > 5:
            scan_issues.append({
                "rule_code": "log_001",
                "title": f"{error_count} errors on '{asset['name']}' in last 24h",
                "description": f"Resource '{asset['name']}' has {error_count} error-level log entries.",
                "severity": "medium",
                "location": f"Logs: {asset['name']}",
                "fix_time": "30 min",
            })
        if auth_count > 3:
            scan_issues.append({
                "rule_code": "log_002",
                "title": f"{auth_count} auth failures on '{asset['name']}'",
                "description": f"Multiple authentication failures detected on '{asset['name']}'.",
                "severity": "high",
                "location": f"Logs: {asset['name']}",
                "fix_time": "15 min",
            })

    return {
        "log_lines": lines,
        "scan_issues": scan_issues,
        "scanned_assets": [{"asset": asset["name"], "route": "log", "issues_found": len(scan_issues)}],
    }
```

**Step 3: Run tests, commit**

```bash
git add pipeline/agents/log_analyzer.py tests/test_log_analyzer.py
git commit -m "feat(super-agent): add log analysis agent node"
```

---

### Task 5: Cloud Scan LangGraph — The Super Agent

**Files:**
- Create: `pipeline/cloud_scan_graph.py`
- Test: `tests/test_cloud_scan_graph.py`

**Step 1: Write the failing test**

Create `tests/test_cloud_scan_graph.py`:

```python
"""Tests for the cloud scan super agent graph."""
from unittest.mock import patch, MagicMock
from pipeline.cloud_scan_graph import build_scan_pipeline, run_cloud_scan


def test_build_scan_pipeline_compiles():
    graph = build_scan_pipeline()
    assert graph is not None


def test_run_cloud_scan_with_mock_discovery():
    """Full scan with mocked GCP APIs produces issues."""
    mock_assets = [
        {"asset_type": "firewall_rule", "name": "open-ssh", "region": "global",
         "metadata": {"source_ranges": ["0.0.0.0/0"], "direction": "INGRESS"}},
        {"asset_type": "compute_instance", "name": "internal-vm", "region": "us-central1",
         "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.1"}]}},
    ]

    with patch("pipeline.cloud_scan_graph._discover_assets", return_value=mock_assets):
        with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=[]):
            result = run_cloud_scan(
                cloud_account_id="test-id",
                project_id="test-proj",
                credentials_json="{}",
                enabled_services=["cloud_logging", "compute"],
            )
            assert result["scan_status"] == "complete"
            assert len(result.get("scan_issues", [])) >= 1  # open-ssh should produce gcp_002
            assert result["total_assets"] == 2
```

**Step 2: Implement**

Create `pipeline/cloud_scan_graph.py`:

```python
"""Cloud Scan Super Agent — LangGraph pipeline for intelligent GCP scanning.

Discovery → Router → parallel Active Scanner / Log Analyzer → Aggregate →
feed into existing threat pipeline (Detect → Validate → Classify → Report).
"""

from __future__ import annotations

import json
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from pipeline.cloud_scan_state import ScanAgentState
from pipeline.agents.cloud_router import router_node, is_public
from pipeline.agents.active_scanner import active_scanner_node
from pipeline.agents.log_analyzer import log_analyzer_node


# ── Discovery Node ──


def _discover_assets(project_id: str, credentials_json: str, services: list[str]) -> list[dict]:
    """Discover GCP assets using the existing scanner's discovery functions."""
    from api.gcp_scanner import run_scan
    result = run_scan(project_id, credentials_json, services)
    return result.get("assets", [])


def discovery_node(state: ScanAgentState) -> dict:
    """Enumerate all GCP assets for the project."""
    assets = _discover_assets(
        state["project_id"],
        state.get("credentials_json", ""),
        state.get("enabled_services", ["cloud_logging"]),
    )
    return {
        "discovered_assets": assets,
        "scan_status": "discovered",
    }


# ── Dispatch Node (fan-out) ──


def dispatch_agents(state: ScanAgentState) -> list[Send]:
    """Route each asset to the appropriate scanner agent via Send()."""
    public = state.get("public_assets", [])
    private = state.get("private_assets", [])
    sends = []

    for asset in public:
        sends.append(Send("active_scanner", {
            "current_asset": asset,
            "project_id": state["project_id"],
            "credentials_json": state.get("credentials_json", ""),
        }))

    for asset in private:
        sends.append(Send("log_analyzer", {
            "current_asset": asset,
            "project_id": state["project_id"],
            "credentials_json": state.get("credentials_json", ""),
        }))

    if not sends:
        return "aggregate"

    return sends


# ── Aggregate Node ──


def aggregate_node(state: ScanAgentState) -> dict:
    """Merge results from all scanner agents."""
    issues = state.get("scan_issues", [])
    log_lines = state.get("log_lines", [])
    scanned = state.get("scanned_assets", [])
    public_count = sum(1 for s in scanned if s.get("route") == "active")
    private_count = sum(1 for s in scanned if s.get("route") == "log")

    scan_type = "full" if public_count > 0 else "cloud_logging_only"

    return {
        "scan_status": "scanned",
        "assets_scanned": len(scanned),
        "scan_type": scan_type,
    }


# ── Threat Pipeline Bridge ──


def should_run_threat_pipeline(state: ScanAgentState) -> str:
    """Only run the threat pipeline if we have log lines to analyze."""
    log_lines = state.get("log_lines", [])
    if log_lines:
        return "threat_pipeline"
    return "finalize"


def threat_pipeline_node(state: ScanAgentState) -> dict:
    """Feed collected log lines into the existing threat detection pipeline."""
    from api.gcp_logging import deterministic_parse

    log_lines = state.get("log_lines", [])
    if not log_lines:
        return {}

    parsed = deterministic_parse(log_lines)

    # Run the threat pipeline (detect → validate → classify → report)
    from pipeline.graph import build_pipeline
    threat_graph = build_pipeline(enable_hitl=False)

    result = threat_graph.invoke({
        "raw_logs": log_lines,
        "parsed_logs": parsed,
        "invalid_count": 0,
        "total_count": len(parsed),
        "threats": [],
        "detection_stats": {},
        "classified_threats": [],
        "report": None,
        "error": None,
        "pipeline_cost": 0.0,
        "pipeline_time": 0.0,
        "validator_findings": [],
        "validator_sample_size": 0,
        "validator_missed_count": 0,
        "rag_context": {},
        "human_decisions": [],
        "hitl_required": False,
        "pending_critical_threats": [],
        "agent_metrics": {},
        "burst_mode": False,
        "chunk_count": 0,
    })

    return {
        "classified_threats": result.get("classified_threats", []),
        "report": result.get("report"),
        "agent_metrics": result.get("agent_metrics", {}),
    }


def finalize_node(state: ScanAgentState) -> dict:
    """Mark scan as complete."""
    return {"scan_status": "complete"}


# ── Build the Graph ──


def build_scan_pipeline():
    """Build and compile the cloud scan super agent graph."""
    workflow = StateGraph(ScanAgentState)

    workflow.add_node("discovery", discovery_node)
    workflow.add_node("router", router_node)
    workflow.add_node("active_scanner", active_scanner_node)
    workflow.add_node("log_analyzer", log_analyzer_node)
    workflow.add_node("aggregate", aggregate_node)
    workflow.add_node("threat_pipeline", threat_pipeline_node)
    workflow.add_node("finalize", finalize_node)

    # Flow: START → discovery → router → dispatch (fan-out) → aggregate
    workflow.add_edge(START, "discovery")
    workflow.add_edge("discovery", "router")
    workflow.add_conditional_edges("router", dispatch_agents)
    workflow.add_edge("active_scanner", "aggregate")
    workflow.add_edge("log_analyzer", "aggregate")

    # After aggregate: optionally run threat pipeline
    workflow.add_conditional_edges(
        "aggregate",
        should_run_threat_pipeline,
        {"threat_pipeline": "threat_pipeline", "finalize": "finalize"},
    )
    workflow.add_edge("threat_pipeline", "finalize")
    workflow.add_edge("finalize", END)

    return workflow.compile()


# ── Convenience runner ──


def run_cloud_scan(
    cloud_account_id: str,
    project_id: str,
    credentials_json: str = "",
    enabled_services: list[str] | None = None,
) -> dict:
    """Run the full cloud scan super agent and return results."""
    graph = build_scan_pipeline()
    result = graph.invoke({
        "cloud_account_id": cloud_account_id,
        "project_id": project_id,
        "credentials_json": credentials_json,
        "enabled_services": enabled_services or ["cloud_logging"],
        "discovered_assets": [],
        "public_assets": [],
        "private_assets": [],
        "scan_issues": [],
        "log_lines": [],
        "scanned_assets": [],
        "scan_status": "starting",
        "assets_scanned": 0,
        "total_assets": 0,
    })
    return result
```

**Step 3: Run tests, commit**

```bash
git add pipeline/cloud_scan_graph.py tests/test_cloud_scan_graph.py
git commit -m "feat(super-agent): add cloud scan LangGraph with discovery, router, and agent nodes"
```

---

### Task 6: SSE Streaming Scan Endpoint

**Files:**
- Modify: `api/routers/clouds.py:153-191` — replace `trigger_scan` with SSE streaming version
- Modify: `frontend/src/lib/api.ts` — add `scanCloudStream()` SSE function
- Modify: `frontend/src/lib/types.ts` — add scan event types

**Step 1: Replace the scan endpoint**

In `api/routers/clouds.py`, replace the `trigger_scan` function with:

```python
@router.post("/{cloud_id}/scan")
async def trigger_scan(cloud_id: str):
    """Trigger a scan via the super agent with SSE streaming."""
    from sse_starlette.sse import EventSourceResponse

    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")

    services = account.get("services", "[]")
    if isinstance(services, str):
        services = json.loads(services)

    async def scan_generator():
        import asyncio
        from pipeline.cloud_scan_graph import build_scan_pipeline

        graph = build_scan_pipeline()

        initial_state = {
            "cloud_account_id": cloud_id,
            "project_id": account["project_id"],
            "credentials_json": account.get("credentials_json", ""),
            "enabled_services": services,
            "discovered_assets": [],
            "public_assets": [],
            "private_assets": [],
            "scan_issues": [],
            "log_lines": [],
            "scanned_assets": [],
            "scan_status": "starting",
            "assets_scanned": 0,
            "total_assets": 0,
        }

        prev_status = ""
        try:
            for event in await asyncio.to_thread(
                lambda: list(graph.stream(initial_state, stream_mode="values"))
            ):
                status = event.get("scan_status", "")
                if status != prev_status:
                    prev_status = status
                    yield json.dumps({
                        "event": status,
                        "total_assets": event.get("total_assets", 0),
                        "assets_scanned": event.get("assets_scanned", 0),
                        "scan_type": event.get("scan_type", ""),
                        "public_count": len(event.get("public_assets", [])),
                        "private_count": len(event.get("private_assets", [])),
                    })

            # Get final state
            final = event  # last event from stream

            # Save results to database
            clear_cloud_issues(cloud_id)
            issues = final.get("scan_issues", [])
            assets = final.get("discovered_assets", [])
            if assets:
                save_cloud_assets(cloud_id, assets)
            if issues:
                save_cloud_issues(cloud_id, issues)
            update_cloud_account(
                cloud_id,
                last_scan_at=datetime.now(timezone.utc).isoformat(),
            )

            yield json.dumps({
                "event": "complete",
                "scan_type": final.get("scan_type", "unknown"),
                "asset_count": len(assets),
                "issue_count": len(issues),
                "issue_counts": get_issue_counts(cloud_id),
                "has_report": final.get("report") is not None,
            })

        except Exception as e:
            logger.exception("Scan failed")
            yield json.dumps({"event": "error", "message": str(e)})

    return EventSourceResponse(scan_generator())
```

**Step 2: Add frontend SSE scan function**

Append to `frontend/src/lib/types.ts`:

```typescript
export interface ScanStreamEvent {
  event: string;
  total_assets?: number;
  assets_scanned?: number;
  scan_type?: string;
  public_count?: number;
  private_count?: number;
  asset_count?: number;
  issue_count?: number;
  issue_counts?: IssueCounts;
  has_report?: boolean;
  message?: string;
}
```

Append to `frontend/src/lib/api.ts`:

```typescript
export async function scanCloudStream(
  cloudId: string,
  onEvent: (event: ScanStreamEvent) => void
): Promise<void> {
  const res = await fetch(`${BASE}/clouds/${cloudId}/scan`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Scan failed: ${res.statusText}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          onEvent(data);
        } catch {
          // skip
        }
      }
    }
  }
}
```

**Step 3: Commit**

```bash
git add api/routers/clouds.py frontend/src/lib/api.ts frontend/src/lib/types.ts
git commit -m "feat(super-agent): add SSE streaming scan endpoint and frontend client"
```

---

### Task 7: Wire UI Scan Button to SSE Stream

**Files:**
- Modify: `frontend/src/app/(dashboard)/clouds/[id]/layout.tsx`

**Step 1: Update the layout**

Replace the scan button handler to use `scanCloudStream()` instead of `scanCloud()`. Show a progress panel during scanning with:
- "Discovering assets..." → "Found N assets (X public, Y private)"
- "Scanning assets..." with progress count
- "Running threat analysis..." (if log lines found)
- "Complete — N issues found"

Import `scanCloudStream` from `@/lib/api` and `ScanStreamEvent` from `@/lib/types`.

Replace the `handleScan` function to open the SSE stream and update local state as events arrive.

**Step 2: Commit**

```bash
git add frontend/src/app/\(dashboard\)/clouds/\[id\]/layout.tsx
git commit -m "feat(super-agent): wire scan button to SSE streaming with progress UI"
```

---

### Task 8: Update Agents Page

**Files:**
- Modify: `frontend/src/app/(dashboard)/agents/page.tsx`

**Step 1: Update the agents list**

Add the new super agent nodes to the agents page:

```typescript
const AGENTS = [
  // Threat Pipeline
  { name: "Ingest", model: "Haiku 4.5", role: "Parses raw logs into structured entries", status: "Ready", group: "Threat Pipeline" },
  { name: "Detect", model: "Sonnet 4.5", role: "Rule-based + AI threat detection", status: "Ready", group: "Threat Pipeline" },
  { name: "Classify", model: "Sonnet 4.5", role: "Risk scoring and MITRE mapping", status: "Ready", group: "Threat Pipeline" },
  { name: "Validate", model: "Haiku 4.5", role: "Cross-checks detections for accuracy", status: "Ready", group: "Threat Pipeline" },
  { name: "HITL Gate", model: "—", role: "Human-in-the-loop review for critical threats", status: "Ready", group: "Threat Pipeline" },
  { name: "Report", model: "Opus 4.6", role: "Generates incident reports and action plans", status: "Ready", group: "Threat Pipeline" },
  // Cloud Scan Super Agent
  { name: "Discovery", model: "—", role: "Enumerates GCP assets (VMs, buckets, firewalls, SQL)", status: "Ready", group: "Cloud Scan" },
  { name: "Router", model: "—", role: "Routes assets to active scan (public) or log analysis (private)", status: "Ready", group: "Cloud Scan" },
  { name: "Active Scanner", model: "—", role: "Runs compliance checks on public-facing assets", status: "Ready", group: "Cloud Scan" },
  { name: "Log Analyzer", model: "—", role: "Queries Cloud Logging for private resource audit events", status: "Ready", group: "Cloud Scan" },
];
```

Group them visually with section headers.

**Step 2: Commit**

```bash
git add frontend/src/app/\(dashboard\)/agents/page.tsx
git commit -m "feat(super-agent): update agents page with cloud scan super agent nodes"
```

---

### Task 9: Integration Test

**Step 1: Run all backend tests**

Run: `.venv/bin/python -m pytest tests/ -v --ignore=tests/test_database.py`
Expected: All tests pass

**Step 2: Build frontend**

Run: `cd frontend && npx next build`
Expected: Zero errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete super agent with router, active scanner, log analyzer, and SSE streaming"
```

---

## Task Summary

| # | Task | Key Files | Purpose |
|---|------|-----------|---------|
| 1 | Scan state | `cloud_scan_state.py` | TypedDict for the super agent |
| 2 | Router node | `cloud_router.py` | Public/private asset detection |
| 3 | Active scanner | `active_scanner.py` | Compliance checks on public assets |
| 4 | Log analyzer | `log_analyzer.py` | Cloud Logging queries for private assets |
| 5 | Scan graph | `cloud_scan_graph.py` | LangGraph StateGraph orchestrating everything |
| 6 | SSE endpoint | `clouds.py`, `api.ts` | Streaming scan with real-time progress |
| 7 | UI wiring | `layout.tsx` | Scan button → SSE progress panel |
| 8 | Agents page | `agents/page.tsx` | Show new agent nodes |
| 9 | Integration | all | Run tests + build |
