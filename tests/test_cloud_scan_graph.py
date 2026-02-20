"""Tests for the cloud scan super agent graph."""
import json
from unittest.mock import patch, MagicMock
from pipeline.cloud_scan_graph import build_scan_pipeline, run_cloud_scan, _discover_assets


def test_build_scan_pipeline_compiles():
    graph = build_scan_pipeline()
    assert graph is not None


def test_discover_assets_parses_metadata_json():
    """_discover_assets should convert metadata_json strings to metadata dicts."""
    mock_result = {
        "assets": [
            {
                "asset_type": "firewall_rule",
                "name": "allow-ssh",
                "metadata_json": json.dumps({"source_ranges": ["0.0.0.0/0"], "direction": "INGRESS"}),
            },
            {
                "asset_type": "compute_instance",
                "name": "web-vm",
                "metadata_json": json.dumps({"networkInterfaces": [{"accessConfigs": [{}]}]}),
            },
        ],
        "issues": [],
        "scan_log": {"services_attempted": ["compute"]},
    }
    with patch("api.gcp_scanner.run_scan", return_value=mock_result):
        assets, scan_log = _discover_assets("proj", "{}", ["compute"])
        assert assets[0]["metadata"]["source_ranges"] == ["0.0.0.0/0"]
        assert "metadata_json" not in assets[0]  # should be removed
        assert "accessConfigs" in assets[1]["metadata"]["networkInterfaces"][0]
        assert scan_log["services_attempted"] == ["compute"]


def test_run_cloud_scan_with_mock_discovery():
    """Full scan with mocked GCP APIs produces issues and correct status."""
    mock_assets = [
        {"asset_type": "firewall_rule", "name": "open-ssh",
         "metadata": {"source_ranges": ["0.0.0.0/0"], "direction": "INGRESS"}},
        {"asset_type": "compute_instance", "name": "internal-vm",
         "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.1"}]}},
    ]

    with patch("pipeline.cloud_scan_graph._discover_assets", return_value=(mock_assets, {})):
        with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=[]):
            result = run_cloud_scan(
                cloud_account_id="test-id",
                project_id="test-proj",
                credentials_json="{}",
                enabled_services=["cloud_logging", "compute"],
            )
            assert result["scan_status"] == "complete"
            assert len(result.get("scan_issues", [])) >= 1  # open-ssh -> gcp_002
            assert result["total_assets"] == 2


def test_run_cloud_scan_no_assets():
    """Scan with no assets still completes."""
    with patch("pipeline.cloud_scan_graph._discover_assets", return_value=([], {})):
        result = run_cloud_scan(
            cloud_account_id="test-id",
            project_id="empty-proj",
            credentials_json="{}",
        )
        assert result["scan_status"] == "complete"
        assert result["total_assets"] == 0


def test_correlation_engine_e2e():
    """Full pipeline: scanner finds open firewall, logs show brute force → active exploit."""
    mock_assets = [
        # Public: open firewall → active scanner will flag gcp_002
        {"asset_type": "firewall_rule", "name": "allow-ssh",
         "metadata": {"source_ranges": ["0.0.0.0/0"], "direction": "INGRESS"}},
        # Private: internal VM → log analyzer will check its logs
        {"asset_type": "compute_instance", "name": "allow-ssh",
         "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.5"}]}},
    ]

    # Log analyzer returns logs that match the firewall resource AND brute-force patterns
    brute_force_logs = [
        "2025-01-01 WARNING allow-ssh: Failed password for root from 203.0.113.5",
        "2025-01-01 WARNING allow-ssh: Invalid user admin from 203.0.113.5",
        "2025-01-01 WARNING allow-ssh: Failed password for ubuntu from 198.51.100.1",
        "2025-01-01 WARNING allow-ssh: Connection closed by authenticating user root",
    ]

    with patch("pipeline.cloud_scan_graph._discover_assets", return_value=(mock_assets, {})):
        with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=brute_force_logs):
            result = run_cloud_scan(
                cloud_account_id="test-id",
                project_id="test-proj",
                credentials_json="{}",
                enabled_services=["cloud_logging", "firewall"],
            )

            assert result["scan_status"] == "complete"
            assert result["active_exploits_detected"] >= 1

            # The correlated issues list should have the upgraded issue
            correlated = result.get("correlated_issues", [])
            active_issues = [i for i in correlated if i.get("correlated")]
            assert len(active_issues) >= 1

            active = active_issues[0]
            assert active["severity"] == "critical"
            assert active["title"].startswith("[ACTIVE]")
            assert active["verdict"] == "Brute Force Attempt in Progress"
            assert active["mitre_tactic"] == "TA0006"
            assert active["mitre_technique"] == "T1110"
