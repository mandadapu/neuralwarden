"""Tests for report agent correlation awareness."""

import json
from unittest.mock import patch, MagicMock

from models.threat import ClassifiedThreat
from pipeline.agents.report import run_report


def _make_classified_threat(
    threat_id="T-001",
    risk="critical",
    risk_score=9.5,
    description="Active brute force on allow-ssh",
    source_ip="203.0.113.5",
    mitre_technique="T1110",
) -> ClassifiedThreat:
    return ClassifiedThreat(
        threat_id=threat_id,
        type="brute_force",
        confidence=0.95,
        method="rule_based",
        description=description,
        source_ip=source_ip,
        risk=risk,
        risk_score=risk_score,
        mitre_technique=mitre_technique,
        mitre_tactic="Credential Access",
        business_impact="Active exploitation detected",
        affected_systems=["allow-ssh"],
        remediation_priority=1,
    )


def test_report_includes_active_incidents_section():
    """Report prompt includes Active Incidents when correlated evidence exists."""
    state = {
        "classified_threats": [_make_classified_threat()],
        "detection_stats": {"rules_matched": 1, "ai_detections": 0, "total_threats": 1},
        "parsed_logs": [],
        "total_count": 10,
        "invalid_count": 0,
        "agent_metrics": {},
        "correlated_evidence": [{
            "rule_code": "gcp_002",
            "asset": "allow-ssh",
            "verdict": "Brute Force Attempt in Progress",
            "mitre_tactic": "TA0006",
            "mitre_technique": "T1110",
            "evidence_logs": ["allow-ssh: Failed password for root"],
            "matched_patterns": ["Failed password"],
        }],
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps({
            "summary": "Active brute force attack detected on allow-ssh.",
            "timeline": "Attack timeline here.",
            "action_plan": [{"step": 1, "action": "Block SSH", "urgency": "immediate", "owner": "Security Team"}],
            "recommendations": ["Restrict SSH access"],
            "ioc_summary": ["IP: 203.0.113.5"],
            "mitre_techniques": ["T1110"],
        })
        resp.usage_metadata = {"input_tokens": 200, "output_tokens": 100}
        return resp

    with patch("pipeline.agents.report.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_report(state)
        human_msg = captured_messages[-1].content
        assert "Active Incidents" in human_msg
        assert "allow-ssh" in human_msg
        assert "remediation" in human_msg.lower()


def test_report_no_active_incidents_without_evidence():
    """Report prompt omits Active Incidents when no correlated evidence."""
    state = {
        "classified_threats": [_make_classified_threat(risk="medium", risk_score=5.0)],
        "detection_stats": {"rules_matched": 1, "ai_detections": 0, "total_threats": 1},
        "parsed_logs": [],
        "total_count": 10,
        "invalid_count": 0,
        "agent_metrics": {},
        "correlated_evidence": [],
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps({
            "summary": "One medium threat detected.",
            "timeline": "",
            "action_plan": [{"step": 1, "action": "Review", "urgency": "24hr", "owner": "Security Team"}],
            "recommendations": [],
            "ioc_summary": [],
            "mitre_techniques": [],
        })
        resp.usage_metadata = {"input_tokens": 200, "output_tokens": 100}
        return resp

    with patch("pipeline.agents.report.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_report(state)
        human_msg = captured_messages[-1].content
        assert "Active Incidents" not in human_msg
