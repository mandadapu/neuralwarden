"""Tests for HITL routing decisions."""

from models.threat import ClassifiedThreat
from pipeline.graph import should_hitl


def _make_classified(threat_id, risk="medium"):
    return ClassifiedThreat(
        threat_id=threat_id,
        type="brute_force",
        confidence=0.9,
        method="rule_based",
        description="test",
        risk=risk,
        risk_score=8.0 if risk == "critical" else 5.0,
    )


class TestHitlRouting:
    def test_should_hitl_with_critical_threats(self):
        state = {
            "classified_threats": [
                _make_classified("T1", "critical"),
                _make_classified("T2", "high"),
            ]
        }
        assert should_hitl(state) == "hitl_review"

    def test_should_hitl_skips_when_no_critical(self):
        state = {
            "classified_threats": [
                _make_classified("T1", "high"),
                _make_classified("T2", "medium"),
            ]
        }
        assert should_hitl(state) == "report"

    def test_should_hitl_skips_empty(self):
        state = {"classified_threats": []}
        assert should_hitl(state) == "report"


class TestHitlNodePassthrough:
    def test_hitl_node_returns_without_interrupt_when_no_critical(self):
        from pipeline.agents.hitl import run_hitl_review

        state = {
            "classified_threats": [
                _make_classified("T1", "high"),
            ]
        }
        result = run_hitl_review(state)
        assert result["hitl_required"] is False
        assert result["human_decisions"] == []
        assert result["pending_critical_threats"] == []
