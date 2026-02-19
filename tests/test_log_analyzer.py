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
        assert result["scan_issues"] == []


def test_high_error_count_generates_issue():
    mock_lines = ["2026-02-19T10:00:00Z ERROR vm/test: fail"] * 10
    state = {
        "current_asset": {"asset_type": "compute_instance", "name": "error-vm", "metadata": {}},
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=mock_lines):
        result = log_analyzer_node(state)
        assert len(result["scan_issues"]) == 1
        assert result["scan_issues"][0]["rule_code"] == "log_001"


def test_auth_failures_generate_issue():
    mock_lines = ["2026-02-19T10:00:00Z WARNING vm/test: GET /api status=403 src=1.2.3.4"] * 5
    state = {
        "current_asset": {"asset_type": "compute_instance", "name": "auth-vm", "metadata": {}},
        "project_id": "test-proj",
        "credentials_json": "{}",
    }
    with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=mock_lines):
        result = log_analyzer_node(state)
        assert len(result["scan_issues"]) == 1
        assert result["scan_issues"][0]["rule_code"] == "log_002"
