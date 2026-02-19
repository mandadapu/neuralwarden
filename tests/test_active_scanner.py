"""Tests for the active scanner agent node."""
from pipeline.agents.active_scanner import active_scanner_node, _check_firewall_asset, _check_compute_asset


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
    assert result["scanned_assets"][0]["route"] == "active"
    assert len(result["scan_issues"]) == 1
    assert result["scan_issues"][0]["rule_code"] == "gcp_002"


def test_firewall_no_issue_when_restricted():
    state = {
        "current_asset": {
            "asset_type": "firewall_rule",
            "name": "corp-only",
            "metadata": {"source_ranges": ["10.0.0.0/8"], "direction": "INGRESS"},
        },
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    result = active_scanner_node(state)
    assert len(result["scan_issues"]) == 0


def test_check_compute_default_sa():
    asset = {
        "name": "prod-vm",
        "metadata": {
            "serviceAccounts": [{"email": "123-compute@developer.gserviceaccount.com", "scopes": []}],
        },
    }
    issues = _check_compute_asset(asset)
    assert len(issues) == 1
    assert issues[0]["rule_code"] == "gcp_006"


def test_check_compute_custom_sa():
    asset = {
        "name": "secure-vm",
        "metadata": {
            "serviceAccounts": [{"email": "my-app@my-project.iam.gserviceaccount.com", "scopes": []}],
        },
    }
    issues = _check_compute_asset(asset)
    assert len(issues) == 0


def test_unknown_asset_type_returns_empty():
    state = {
        "current_asset": {"asset_type": "unknown_thing", "name": "mystery", "metadata": {}},
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    result = active_scanner_node(state)
    assert result["scan_issues"] == []
    assert len(result["scanned_assets"]) == 1
