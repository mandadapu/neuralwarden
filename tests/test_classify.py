"""Tests for classification models and fallback logic."""

import json
from unittest.mock import patch, MagicMock

from models.threat import ClassifiedThreat, Threat
from pipeline.agents.classify import _fallback_classify, run_classify, CORRELATION_ADDENDUM


def _make_threat(threat_id: str = "TEST-001", threat_type: str = "dast") -> Threat:
    return Threat(
        threat_id=threat_id,
        type=threat_type,
        confidence=0.9,
        source_log_indices=[0, 1, 2],
        method="rule_based",
        description="Test threat",
        source_ip="10.0.0.1",
    )


class TestFallbackClassify:
    def test_assigns_medium_risk(self):
        threat = _make_threat()
        classified = _fallback_classify(threat, priority=1)
        assert classified.risk == "medium"
        assert classified.risk_score == 5.0
        assert classified.remediation_priority == 1

    def test_preserves_threat_fields(self):
        threat = _make_threat(threat_id="RULE-BRUTE-001", threat_type="dast")
        classified = _fallback_classify(threat, priority=3)
        assert classified.threat_id == "RULE-BRUTE-001"
        assert classified.type == "dast"
        assert classified.confidence == 0.9
        assert classified.source_ip == "10.0.0.1"
        assert classified.method == "rule_based"


class TestClassifiedThreatModel:
    def test_risk_score_bounds(self):
        ct = ClassifiedThreat(
            threat_id="T-001",
            type="dast",
            confidence=0.9,
            method="rule_based",
            description="test",
            risk="critical",
            risk_score=9.5,
            remediation_priority=1,
        )
        assert 0 <= ct.risk_score <= 10

    def test_valid_risk_levels(self):
        for level in ["critical", "high", "medium", "low", "informational"]:
            ct = ClassifiedThreat(
                threat_id="T-001",
                type="test",
                confidence=0.5,
                method="rule_based",
                description="test",
                risk=level,
                risk_score=5.0,
            )
            assert ct.risk == level


# --------------- correlation addendum tests ---------------


def test_correlation_addendum_injected_when_evidence_present():
    """Classify prompt includes correlation context when evidence exists."""
    evidence = [{
        "rule_code": "gcp_002",
        "asset": "allow-ssh",
        "verdict": "Brute Force Attempt in Progress",
        "mitre_tactic": "TA0006",
        "mitre_technique": "T1110",
        "evidence_logs": ["allow-ssh: Failed password for root"],
        "matched_patterns": ["Failed password"],
    }]
    state = {
        "threats": [_make_threat()],
        "correlated_evidence": evidence,
        "agent_metrics": {},
        "rag_context": {},
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps([{
            "threat_id": "TEST-001",
            "risk": "critical",
            "risk_score": 9.5,
            "mitre_technique": "T1110",
            "mitre_tactic": "Credential Access",
            "business_impact": "Active brute force",
            "affected_systems": ["allow-ssh"],
            "remediation_priority": 1,
        }])
        resp.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
        return resp

    with patch("pipeline.agents.classify.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_classify(state)
        human_msg = captured_messages[-1].content
        assert "CORRELATION CONTEXT" in human_msg
        assert "allow-ssh" in human_msg
        assert "Brute Force" in human_msg


def test_no_correlation_addendum_when_no_evidence():
    """Classify prompt is unchanged when no correlated evidence."""
    state = {
        "threats": [_make_threat()],
        "correlated_evidence": [],
        "agent_metrics": {},
        "rag_context": {},
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps([{
            "threat_id": "TEST-001",
            "risk": "medium",
            "risk_score": 5.0,
            "mitre_technique": "T1110",
            "mitre_tactic": "Initial Access",
            "business_impact": "Potential brute force",
            "affected_systems": [],
            "remediation_priority": 1,
        }])
        resp.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
        return resp

    with patch("pipeline.agents.classify.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_classify(state)
        human_msg = captured_messages[-1].content
        assert "CORRELATION CONTEXT" not in human_msg
