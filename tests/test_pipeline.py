"""Integration tests for the pipeline graph structure."""

from unittest.mock import patch

from models.incident_report import IncidentReport
from models.log_entry import LogEntry
from models.threat import ClassifiedThreat, Threat
from pipeline.graph import should_classify_after_validate as should_classify, should_detect


class TestConditionalRouting:
    def test_should_detect_with_valid_logs(self):
        state = {
            "parsed_logs": [
                LogEntry(index=0, raw_text="log1", is_valid=True),
                LogEntry(index=1, raw_text="log2", is_valid=True),
            ]
        }
        assert should_detect(state) == "detect"

    def test_should_detect_empty_report_when_all_invalid(self):
        state = {
            "parsed_logs": [
                LogEntry(index=0, raw_text="bad1", is_valid=False),
                LogEntry(index=1, raw_text="bad2", is_valid=False),
            ]
        }
        assert should_detect(state) == "empty_report"

    def test_should_detect_empty_report_when_no_logs(self):
        state = {"parsed_logs": []}
        assert should_detect(state) == "empty_report"

    def test_should_classify_with_threats(self):
        state = {
            "threats": [
                Threat(
                    threat_id="T1",
                    type="brute_force",
                    confidence=0.9,
                    method="rule_based",
                    description="test",
                )
            ]
        }
        assert should_classify(state) == "classify"

    def test_should_classify_clean_report_when_no_threats(self):
        state = {"threats": []}
        assert should_classify(state) == "clean_report"


class TestShortCircuitPaths:
    def test_empty_report_has_correct_summary(self):
        from pipeline.graph import empty_report_node

        state = {"total_count": 10, "invalid_count": 10}
        result = empty_report_node(state)
        report = result["report"]
        assert isinstance(report, IncidentReport)
        assert report.threat_count == 0
        assert "malformed" in report.summary.lower()

    def test_clean_report_has_correct_summary(self):
        from pipeline.graph import clean_report_node

        state = {"total_count": 20, "invalid_count": 2}
        result = clean_report_node(state)
        report = result["report"]
        assert isinstance(report, IncidentReport)
        assert report.threat_count == 0
        assert "no" in report.summary.lower() and "threat" in report.summary.lower()
