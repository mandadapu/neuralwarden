"""Tests for SSE streaming pipeline service."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from api.services_stream import _detect_completed_agent, _sse_event, STAGES


class TestDetectCompletedAgent:
    def test_detects_ingest(self):
        prev = {}
        new = {"parsed_logs": [MagicMock()]}
        assert _detect_completed_agent(prev, new) == "ingest"

    def test_detects_detect(self):
        prev = {"parsed_logs": [MagicMock()]}
        new = {"parsed_logs": [MagicMock()], "detection_stats": {"rules_matched": 2}}
        assert _detect_completed_agent(prev, new) == "detect"

    def test_detects_validate(self):
        prev = {"detection_stats": {"rules_matched": 2}, "validator_sample_size": 0}
        new = {"detection_stats": {"rules_matched": 2}, "validator_sample_size": 10}
        assert _detect_completed_agent(prev, new) == "validate"

    def test_detects_classify(self):
        prev = {"validator_sample_size": 10}
        new = {"validator_sample_size": 10, "classified_threats": [MagicMock()]}
        assert _detect_completed_agent(prev, new) == "classify"

    def test_detects_report(self):
        prev = {"classified_threats": [MagicMock()]}
        new = {"classified_threats": [MagicMock()], "report": MagicMock()}
        assert _detect_completed_agent(prev, new) == "report"

    def test_returns_none_no_change(self):
        state = {"parsed_logs": [MagicMock()]}
        assert _detect_completed_agent(state, state) is None


class TestSSEEvent:
    def test_formats_event(self):
        result = _sse_event("agent_complete", {"stage": "ingest", "elapsed_s": 1.5})
        parsed = json.loads(result)
        assert parsed["event"] == "agent_complete"
        assert parsed["stage"] == "ingest"
        assert parsed["elapsed_s"] == 1.5


class TestStages:
    def test_stage_order(self):
        assert STAGES == ["ingest", "detect", "validate", "classify", "report"]
