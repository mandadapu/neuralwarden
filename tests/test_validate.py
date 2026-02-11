"""Tests for Validator Agent — sampling, routing, and finding merge logic."""

from models.log_entry import LogEntry
from models.threat import Threat
from pipeline.agents.validate import _select_clean_sample


def _make_log(index, event_type="system", source_ip="", is_valid=True):
    return LogEntry(
        index=index,
        raw_text=f"log line {index}",
        event_type=event_type,
        source_ip=source_ip,
        is_valid=is_valid,
    )


def _make_threat(threat_id, indices):
    return Threat(
        threat_id=threat_id,
        type="brute_force",
        confidence=0.9,
        source_log_indices=indices,
        method="rule_based",
        description="test threat",
    )


class TestSelectCleanSample:
    def test_selects_logs_not_in_threats(self):
        state = {
            "parsed_logs": [_make_log(i) for i in range(10)],
            "threats": [_make_threat("T1", [0, 1, 2])],
        }
        sample = _select_clean_sample(state, sample_fraction=1.0)
        sample_indices = {log.index for log in sample}
        assert 0 not in sample_indices
        assert 1 not in sample_indices
        assert 2 not in sample_indices
        assert len(sample) == 7

    def test_empty_when_all_logs_are_threats(self):
        state = {
            "parsed_logs": [_make_log(i) for i in range(3)],
            "threats": [_make_threat("T1", [0, 1, 2])],
        }
        sample = _select_clean_sample(state, sample_fraction=1.0)
        assert len(sample) == 0

    def test_skips_invalid_logs(self):
        state = {
            "parsed_logs": [
                _make_log(0, is_valid=True),
                _make_log(1, is_valid=False),
                _make_log(2, is_valid=True),
            ],
            "threats": [],
        }
        sample = _select_clean_sample(state, sample_fraction=1.0)
        assert len(sample) == 2
        assert all(log.is_valid for log in sample)

    def test_caps_at_max_sample(self):
        state = {
            "parsed_logs": [_make_log(i) for i in range(100)],
            "threats": [],
        }
        sample = _select_clean_sample(state, sample_fraction=1.0, max_sample=10)
        assert len(sample) == 10

    def test_respects_sample_fraction(self):
        state = {
            "parsed_logs": [_make_log(i) for i in range(100)],
            "threats": [],
        }
        sample = _select_clean_sample(state, sample_fraction=0.1, max_sample=50)
        assert len(sample) == 10

    def test_min_sample_when_fraction_too_small(self):
        state = {
            "parsed_logs": [_make_log(i) for i in range(10)],
            "threats": [],
        }
        sample = _select_clean_sample(state, sample_fraction=0.01, min_sample=2)
        assert len(sample) == 2
