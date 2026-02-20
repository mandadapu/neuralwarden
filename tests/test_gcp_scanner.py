"""Tests for GCP Scanner backend — asset discovery and compliance checks."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# --------------- probe_available_services ---------------


class TestProbeAvailableServices:
    @patch("api.gcp_scanner._try_import", return_value=False)
    def test_probe_available_services_all_unavailable(self, mock_import):
        """When _try_import returns False for everything, only cloud_logging is listed."""
        from api.gcp_scanner import probe_available_services

        services = probe_available_services()
        assert "cloud_logging" in services
        # No other services should be present
        assert "compute" not in services
        assert "firewall" not in services
        assert "storage" not in services
        assert "resource_manager" not in services


# --------------- Compliance checks ---------------


class TestCheckOpenSSH:
    def test_check_open_ssh_finds_violation(self):
        """Firewall rule allowing 0.0.0.0/0 to port 22 should be flagged."""
        from api.gcp_scanner import _check_open_ssh

        rules = [
            {
                "name": "default-allow-ssh",
                "direction": "INGRESS",
                "allowed": [{"IPProtocol": "tcp", "ports": ["22"]}],
                "sourceRanges": ["0.0.0.0/0"],
            }
        ]
        issues = _check_open_ssh(rules)
        assert len(issues) == 1
        assert issues[0]["rule_code"] == "gcp_002"
        assert issues[0]["severity"] == "high"
        assert "default-allow-ssh" in issues[0]["title"]

    def test_check_open_ssh_clean(self):
        """Firewall rule with restricted source should produce no issues."""
        from api.gcp_scanner import _check_open_ssh

        rules = [
            {
                "name": "restricted-ssh",
                "direction": "INGRESS",
                "allowed": [{"IPProtocol": "tcp", "ports": ["22"]}],
                "sourceRanges": ["10.0.0.0/8"],
            }
        ]
        issues = _check_open_ssh(rules)
        assert len(issues) == 0

    def test_check_open_ssh_ipv6_violation(self):
        """Firewall rule allowing ::/0 to port 22 should also be flagged."""
        from api.gcp_scanner import _check_open_ssh

        rules = [
            {
                "name": "allow-ssh-v6",
                "direction": "INGRESS",
                "allowed": [{"IPProtocol": "tcp", "ports": ["22"]}],
                "sourceRanges": ["::/0"],
            }
        ]
        issues = _check_open_ssh(rules)
        assert len(issues) == 1
        assert issues[0]["rule_code"] == "gcp_002"


class TestCheckPublicBuckets:
    def test_check_public_buckets_violation(self):
        """Bucket with allUsers binding should be flagged."""
        from api.gcp_scanner import _check_public_buckets

        buckets = [
            {
                "name": "my-public-bucket",
                "iam_policy": {
                    "bindings": [
                        {"role": "roles/storage.objectViewer", "members": ["allUsers"]}
                    ]
                },
            }
        ]
        issues = _check_public_buckets(buckets)
        assert len(issues) == 1
        assert issues[0]["rule_code"] == "gcp_004"
        assert issues[0]["severity"] == "critical"
        assert "my-public-bucket" in issues[0]["title"]

    def test_check_public_buckets_clean(self):
        """Bucket without public bindings should produce no issues."""
        from api.gcp_scanner import _check_public_buckets

        buckets = [
            {
                "name": "private-bucket",
                "iam_policy": {
                    "bindings": [
                        {
                            "role": "roles/storage.objectViewer",
                            "members": ["serviceAccount:sa@proj.iam.gserviceaccount.com"],
                        }
                    ]
                },
            }
        ]
        issues = _check_public_buckets(buckets)
        assert len(issues) == 0


class TestCheckDefaultSA:
    def test_check_default_sa(self):
        """Instance with default compute SA should be flagged."""
        from api.gcp_scanner import _check_default_sa

        instances = [
            {
                "name": "instance-1",
                "serviceAccounts": [
                    {"email": "123456-compute@developer.gserviceaccount.com"}
                ],
            }
        ]
        issues = _check_default_sa(instances)
        assert len(issues) == 1
        assert issues[0]["rule_code"] == "gcp_006"
        assert issues[0]["severity"] == "medium"
        assert "instance-1" in issues[0]["title"]

    def test_check_default_sa_clean(self):
        """Instance with custom SA should produce no issues."""
        from api.gcp_scanner import _check_default_sa

        instances = [
            {
                "name": "instance-2",
                "serviceAccounts": [
                    {"email": "my-custom-sa@my-project.iam.gserviceaccount.com"}
                ],
            }
        ]
        issues = _check_default_sa(instances)
        assert len(issues) == 0


# --------------- run_scan orchestrator ---------------


class TestRunScan:
    @patch("api.gcp_scanner._scan_cloud_logging", return_value=([], [], []))
    @patch("api.gcp_scanner.probe_available_services", return_value=["cloud_logging"])
    def test_run_scan_cloud_logging_fallback(self, mock_probe, mock_scan_logging):
        """When no service APIs are available, scan_type should be cloud_logging_only."""
        from api.gcp_scanner import run_scan

        result = run_scan(
            project_id="test-project",
            credentials_json='{"type":"service_account"}',
            services=["compute", "storage", "cloud_logging"],
        )
        assert result["scan_type"] == "cloud_logging_only"
        assert "cloud_logging" in result["scanned_services"]
        assert "compute" not in result["scanned_services"]
        assert "storage" not in result["scanned_services"]
        assert isinstance(result["assets"], list)
        assert isinstance(result["issues"], list)
        assert result["asset_count"] == 0
        assert result["issue_count"] == 0

    @patch("api.gcp_scanner._scan_cloud_logging", return_value=(
        [{"asset_type": "log_summary", "name": "cloud_logging_summary"}],
        [{"rule_code": "log_001", "title": "High error count", "severity": "high"}],
        ["2025-01-01 INFO test log line"],
    ))
    @patch("api.gcp_scanner._scan_compute", return_value=(
        [{"asset_type": "firewall_rule", "name": "allow-ssh"}],
        [{"rule_code": "gcp_002", "title": "Open SSH", "severity": "high"}],
    ))
    @patch("api.gcp_scanner._make_credentials", return_value=MagicMock())
    @patch("api.gcp_scanner.probe_available_services", return_value=[
        "cloud_logging", "compute", "firewall",
    ])
    def test_run_scan_full(self, mock_probe, mock_creds, mock_compute, mock_logging):
        """When compute is available, scan_type should be full and results combined."""
        from api.gcp_scanner import run_scan

        result = run_scan(
            project_id="test-project",
            credentials_json='{"type":"service_account"}',
            services=["compute", "cloud_logging"],
        )
        assert result["scan_type"] == "full"
        assert "compute" in result["scanned_services"]
        assert "cloud_logging" in result["scanned_services"]
        assert result["asset_count"] == 2
        assert result["issue_count"] == 2
