"""Tests for burst mode routing and aggregation."""

from langgraph.types import Send

from models.log_entry import LogEntry
from pipeline.graph import BURST_THRESHOLD, CHUNK_SIZE, aggregate_ingest, should_burst


class TestBurstRouting:
    def test_should_burst_returns_ingest_below_threshold(self):
        state = {"raw_logs": ["log"] * 500}
        result = should_burst(state)
        assert result == "ingest"

    def test_should_burst_returns_ingest_at_threshold(self):
        state = {"raw_logs": ["log"] * BURST_THRESHOLD}
        result = should_burst(state)
        assert result == "ingest"

    def test_should_burst_returns_sends_above_threshold(self):
        state = {"raw_logs": ["log"] * (BURST_THRESHOLD + 1)}
        result = should_burst(state)
        assert isinstance(result, list)
        assert all(isinstance(s, Send) for s in result)

    def test_send_creates_correct_chunk_count(self):
        n = BURST_THRESHOLD + 500
        state = {"raw_logs": ["log"] * n}
        result = should_burst(state)
        expected_chunks = (n + CHUNK_SIZE - 1) // CHUNK_SIZE
        assert len(result) == expected_chunks


class TestAggregateIngest:
    def test_computes_totals_from_parsed_logs(self):
        logs = [
            LogEntry(index=i, raw_text=f"log {i}", is_valid=True)
            for i in range(10)
        ]
        state = {"parsed_logs": logs}
        result = aggregate_ingest(state)
        assert result["invalid_count"] == 0
        assert result["total_count"] == 10
        assert result["burst_mode"] is True

    def test_counts_invalid_logs_correctly(self):
        logs = [
            LogEntry(index=0, raw_text="valid", is_valid=True),
            LogEntry(index=1, raw_text="invalid", is_valid=False),
            LogEntry(index=2, raw_text="invalid", is_valid=False),
            LogEntry(index=3, raw_text="valid", is_valid=True),
        ]
        state = {"parsed_logs": logs}
        result = aggregate_ingest(state)
        assert result["invalid_count"] == 2
        assert result["total_count"] == 4
