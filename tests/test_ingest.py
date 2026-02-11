"""Tests for the Ingest Agent — log parsing logic."""

from models.log_entry import LogEntry


def test_log_entry_valid():
    """Test creating a valid LogEntry."""
    log = LogEntry(
        index=0,
        timestamp="Jan 10 03:14:22",
        source="sshd",
        event_type="failed_auth",
        source_ip="203.0.113.50",
        raw_text="Jan 10 03:14:22 sshd: Failed password for admin from 203.0.113.50",
        is_valid=True,
    )
    assert log.is_valid
    assert log.source_ip == "203.0.113.50"
    assert log.event_type == "failed_auth"


def test_log_entry_invalid():
    """Test creating an invalid LogEntry with parse error."""
    log = LogEntry(
        index=1,
        raw_text="garbled nonsense !@#$%",
        is_valid=False,
        parse_error="Could not parse log format",
    )
    assert not log.is_valid
    assert log.parse_error is not None
    assert log.event_type == "unknown"


def test_log_entry_defaults():
    """Test LogEntry default values."""
    log = LogEntry(index=0, raw_text="some log line")
    assert log.source_ip == ""
    assert log.dest_ip == ""
    assert log.user == ""
    assert log.is_valid is True
    assert log.parse_error is None
