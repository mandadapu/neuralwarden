"""Tests for PDF incident report generation."""

from __future__ import annotations

import pytest

from api.pdf_generator import generate_pdf


def _make_analysis_data(
    *,
    threats: list | None = None,
    report: dict | None = None,
) -> dict:
    """Build a complete analysis_data dict for testing."""
    return {
        "report_json": report or {},
        "threats_json": threats or [],
        "created_at": "2025-01-15T12:30:00+00:00",
        "log_count": 100,
        "threat_count": len(threats) if threats else 0,
        "critical_count": sum(
            1 for t in (threats or []) if t.get("risk") == "critical"
        ),
        "pipeline_time": 8.5,
        "pipeline_cost": 0.0123,
    }


SAMPLE_THREATS = [
    {
        "threat_id": "RULE-BF-001",
        "type": "brute_force",
        "risk": "critical",
        "risk_score": 95,
        "description": "Multiple failed SSH login attempts",
        "source_ip": "10.0.0.5",
        "mitre_technique": "T1110",
    },
    {
        "threat_id": "RULE-EXFIL-002",
        "type": "data_exfiltration",
        "risk": "high",
        "risk_score": 80,
        "description": "Large outbound data transfer detected",
        "source_ip": "192.168.1.100",
        "mitre_technique": "T1041",
    },
]

SAMPLE_REPORT = {
    "summary": "Two threats detected including a critical brute force attack.",
    "timeline": "12:00 - Initial scan detected. 12:15 - Brute force begins.",
    "action_plan": [
        {
            "step": 1,
            "action": "Block source IP 10.0.0.5",
            "urgency": "immediate",
            "owner": "SOC Team",
        },
        {
            "step": 2,
            "action": "Rotate compromised credentials",
            "urgency": "high",
            "owner": "IT Admin",
        },
    ],
    "recommendations": [
        "Enable MFA on all SSH endpoints.",
        "Implement rate limiting for login attempts.",
    ],
    "ioc_summary": [
        "10.0.0.5 (brute force source)",
        "192.168.1.100 (exfiltration source)",
    ],
    "mitre_techniques": [
        "T1110 - Brute Force",
        "T1041 - Exfiltration Over C2 Channel",
    ],
}


class TestGeneratePdf:
    def test_returns_pdf_bytes(self):
        """generate_pdf should return bytes starting with %PDF."""
        data = _make_analysis_data()
        result = generate_pdf(data)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_empty_threats(self):
        """PDF generation should work with no threats."""
        data = _make_analysis_data(threats=[], report={"summary": "No threats found."})
        result = generate_pdf(data)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        assert len(result) > 100  # non-trivial PDF

    def test_complete_data(self):
        """PDF generation should work with full threat and report data."""
        data = _make_analysis_data(threats=SAMPLE_THREATS, report=SAMPLE_REPORT)
        result = generate_pdf(data)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
        assert len(result) > 500  # should be a substantial document

    def test_missing_report_keys(self):
        """PDF should handle report_json missing optional keys gracefully."""
        data = _make_analysis_data(
            threats=SAMPLE_THREATS,
            report={"summary": "Partial report."},
        )
        result = generate_pdf(data)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_none_values(self):
        """PDF should handle None values for report_json and threats_json."""
        data = {
            "report_json": None,
            "threats_json": None,
            "created_at": "",
            "log_count": 0,
            "threat_count": 0,
            "critical_count": 0,
            "pipeline_time": 0.0,
            "pipeline_cost": 0.0,
        }
        result = generate_pdf(data)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"
