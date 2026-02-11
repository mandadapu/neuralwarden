"""Tests for classification models and fallback logic."""

from models.threat import ClassifiedThreat, Threat
from pipeline.agents.classify import _fallback_classify


def _make_threat(threat_id: str = "TEST-001", threat_type: str = "brute_force") -> Threat:
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
        threat = _make_threat(threat_id="RULE-BRUTE-001", threat_type="brute_force")
        classified = _fallback_classify(threat, priority=3)
        assert classified.threat_id == "RULE-BRUTE-001"
        assert classified.type == "brute_force"
        assert classified.confidence == 0.9
        assert classified.source_ip == "10.0.0.1"
        assert classified.method == "rule_based"


class TestClassifiedThreatModel:
    def test_risk_score_bounds(self):
        ct = ClassifiedThreat(
            threat_id="T-001",
            type="brute_force",
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
