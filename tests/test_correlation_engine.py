"""Tests for the Correlation Engine."""

import pytest
from pipeline.agents.correlation_engine import (
    CORRELATION_RULES,
    _extract_resource_name,
    correlate_findings,
)


# --------------- _extract_resource_name ---------------


def test_extract_resource_name_with_prefix():
    assert _extract_resource_name("Firewall: allow-ssh") == "allow-ssh"


def test_extract_resource_name_gcs():
    assert _extract_resource_name("GCS: my-bucket") == "my-bucket"


def test_extract_resource_name_no_prefix():
    assert _extract_resource_name("standalone") == "standalone"


# --------------- no correlation ---------------


def test_no_log_lines_returns_original():
    issues = [{"rule_code": "gcp_002", "title": "Open SSH", "location": "Firewall: allow-ssh", "severity": "high", "description": "desc"}]
    result, count, _evidence = correlate_findings(issues, [])
    assert count == 0
    assert len(result) == 1
    assert result[0]["severity"] == "high"
    assert result[0]["title"] == "Open SSH"


def test_no_matching_patterns():
    issues = [{"rule_code": "gcp_002", "title": "Open SSH", "location": "Firewall: allow-ssh", "severity": "high", "description": "desc"}]
    logs = ["2025-01-01 INFO allow-ssh: healthy connection established"]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 0
    assert result[0]["severity"] == "high"


def test_unknown_rule_code_passes_through():
    issues = [{"rule_code": "custom_999", "title": "Custom Issue", "location": "Resource: foo", "severity": "low", "description": "desc"}]
    logs = ["2025-01-01 ERROR foo: Invalid user root"]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 0
    assert result[0]["severity"] == "low"


# --------------- active correlation ---------------


def test_gcp_002_brute_force_correlation():
    """Open SSH firewall + auth failure logs = active exploit."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Firewall 'allow-ssh' allows unrestricted ingress",
        "description": "Firewall rule allows 0.0.0.0/0.",
        "severity": "high",
        "location": "Firewall: allow-ssh",
        "fix_time": "10 min",
    }]
    logs = [
        "2025-01-01 WARNING allow-ssh: Failed password for root from 203.0.113.5",
        "2025-01-01 WARNING allow-ssh: Invalid user admin from 203.0.113.5",
        "2025-01-01 INFO other-resource: normal traffic",
    ]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 1
    assert result[0]["severity"] == "critical"
    assert result[0]["title"].startswith("[ACTIVE]")
    assert result[0]["correlated"] is True
    assert result[0]["verdict"] == "Brute Force Attempt in Progress"
    assert result[0]["mitre_tactic"] == "TA0006"
    assert result[0]["mitre_technique"] == "T1110"
    assert "2 related log events" in result[0]["description"]


def test_gcp_004_data_exfiltration_correlation():
    """Public bucket + anonymous access logs = exfiltration."""
    issues = [{
        "rule_code": "gcp_004",
        "title": "GCS bucket 'data-export' is publicly accessible",
        "description": "Bucket has public IAM binding.",
        "severity": "critical",
        "location": "GCS: data-export",
        "fix_time": "5 min",
    }]
    logs = [
        "2025-01-01 WARNING data-export: storage.objects.get by allUsers",
        "2025-01-01 WARNING data-export: GetObject request from 198.51.100.0",
    ]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 1
    assert result[0]["severity"] == "critical"
    assert result[0]["verdict"] == "Data Exfiltration Occurring"
    assert result[0]["mitre_technique"] == "T1530"


def test_gcp_006_privilege_escalation_correlation():
    """Default SA + key creation logs = privilege escalation risk."""
    issues = [{
        "rule_code": "gcp_006",
        "title": "Instance 'web-server-1' uses default service account",
        "description": "Use a dedicated service account.",
        "severity": "medium",
        "location": "VM: web-server-1",
        "fix_time": "15 min",
    }]
    logs = [
        "2025-01-01 WARNING web-server-1: CreateServiceAccountKey called by compute@developer.gserviceaccount.com",
    ]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 1
    assert result[0]["severity"] == "critical"
    assert result[0]["verdict"] == "Privilege Escalation Risk"
    assert result[0]["mitre_tactic"] == "TA0004"


# --------------- multiple issues, mixed correlation ---------------


def test_mixed_issues_partial_correlation():
    """Some issues correlate, others don't."""
    issues = [
        {
            "rule_code": "gcp_002",
            "title": "Open SSH on allow-ssh",
            "description": "desc",
            "severity": "high",
            "location": "Firewall: allow-ssh",
        },
        {
            "rule_code": "gcp_006",
            "title": "Default SA on db-server",
            "description": "desc",
            "severity": "medium",
            "location": "VM: db-server",
        },
    ]
    logs = [
        "2025-01-01 WARNING allow-ssh: Failed password for root",
        "2025-01-01 INFO db-server: normal operation",
    ]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 1  # only gcp_002 matches
    assert result[0]["severity"] == "critical"
    assert result[0]["correlated"] is True
    assert result[1]["severity"] == "medium"  # gcp_006 unchanged
    assert "correlated" not in result[1]


def test_original_issues_not_mutated():
    """Correlation must not modify the original issue dicts."""
    original = {
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }
    _result, _count, _evidence = correlate_findings([original], ["allow-ssh: Failed password"])
    assert original["severity"] == "high"
    assert original["title"] == "Open SSH"


def test_case_insensitive_matching():
    """Resource names and patterns should match case-insensitively."""
    issues = [{
        "rule_code": "gcp_004",
        "title": "Public bucket",
        "description": "desc",
        "severity": "critical",
        "location": "GCS: My-Bucket",
    }]
    logs = ["2025-01-01 WARNING my-bucket: GETOBJECT from allUsers"]
    result, count, _evidence = correlate_findings(issues, logs)
    assert count == 1
    assert result[0]["correlated"] is True


# --------------- evidence samples ---------------


def test_evidence_samples_returned_on_match():
    """Correlated findings include evidence log samples."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }]
    logs = [
        "2025-01-01 WARNING allow-ssh: Failed password for root from 203.0.113.5",
        "2025-01-01 WARNING allow-ssh: Invalid user admin from 203.0.113.5",
    ]
    result, count, evidence = correlate_findings(issues, logs)
    assert count == 1
    assert len(evidence) == 1
    assert evidence[0]["rule_code"] == "gcp_002"
    assert evidence[0]["asset"] == "allow-ssh"
    assert evidence[0]["verdict"] == "Brute Force Attempt in Progress"
    assert evidence[0]["mitre_tactic"] == "TA0006"
    assert evidence[0]["mitre_technique"] == "T1110"
    assert len(evidence[0]["evidence_logs"]) == 2
    assert "Failed password" in evidence[0]["evidence_logs"][0]
    assert set(evidence[0]["matched_patterns"]) == {"Failed password", "Invalid user"}


def test_evidence_logs_capped_at_five():
    """Evidence log samples are limited to 5."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }]
    logs = [f"2025-01-01 WARNING allow-ssh: Failed password attempt {i}" for i in range(10)]
    result, count, evidence = correlate_findings(issues, logs)
    assert count == 1
    assert len(evidence[0]["evidence_logs"]) == 5


def test_no_evidence_when_no_match():
    """No evidence returned when no patterns match."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }]
    logs = ["2025-01-01 INFO allow-ssh: healthy connection"]
    result, count, evidence = correlate_findings(issues, logs)
    assert count == 0
    assert evidence == []


def test_no_evidence_when_no_logs():
    """No evidence returned when log list is empty."""
    issues = [{"rule_code": "gcp_002", "title": "X", "description": "d", "severity": "high", "location": "Firewall: allow-ssh"}]
    result, count, evidence = correlate_findings(issues, [])
    assert count == 0
    assert evidence == []
