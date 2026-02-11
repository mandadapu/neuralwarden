"""Tests for rule-based threat detection."""

from models.log_entry import LogEntry
from rules.detection import (
    detect_brute_force,
    detect_data_exfiltration,
    detect_lateral_movement,
    detect_port_scan,
    detect_privilege_escalation,
    run_all_rules,
)


def _make_log(index: int, event_type: str, source_ip: str = "", dest_ip: str = "",
              source: str = "", details: str = "", raw_text: str = "") -> LogEntry:
    return LogEntry(
        index=index,
        event_type=event_type,
        source_ip=source_ip,
        dest_ip=dest_ip,
        source=source,
        details=details,
        raw_text=raw_text or f"log line {index}",
    )


class TestBruteForce:
    def test_detects_brute_force(self):
        logs = [_make_log(i, "failed_auth", source_ip="10.0.0.1") for i in range(6)]
        threats = detect_brute_force(logs, threshold=5)
        assert len(threats) == 1
        assert threats[0].type == "brute_force"
        assert threats[0].method == "rule_based"

    def test_below_threshold(self):
        logs = [_make_log(i, "failed_auth", source_ip="10.0.0.1") for i in range(3)]
        threats = detect_brute_force(logs, threshold=5)
        assert len(threats) == 0

    def test_multiple_ips(self):
        logs = [_make_log(i, "failed_auth", source_ip="10.0.0.1") for i in range(5)]
        logs += [_make_log(i + 5, "failed_auth", source_ip="10.0.0.2") for i in range(5)]
        threats = detect_brute_force(logs, threshold=5)
        assert len(threats) == 2

    def test_ignores_invalid_logs(self):
        logs = [_make_log(i, "failed_auth", source_ip="10.0.0.1") for i in range(6)]
        logs[0].is_valid = False
        threats = detect_brute_force(logs, threshold=5)
        assert len(threats) == 1
        assert len(threats[0].source_log_indices) == 5


class TestPortScan:
    def test_detects_port_scan(self):
        logs = [
            _make_log(i, "connection", source_ip="10.0.0.1", details=f"port: {port}")
            for i, port in enumerate(range(22, 35))
        ]
        threats = detect_port_scan(logs, threshold=10)
        assert len(threats) == 1
        assert threats[0].type == "port_scan"

    def test_below_threshold(self):
        logs = [
            _make_log(i, "connection", source_ip="10.0.0.1", details=f"port: {port}")
            for i, port in enumerate(range(22, 27))
        ]
        threats = detect_port_scan(logs, threshold=10)
        assert len(threats) == 0


class TestPrivilegeEscalation:
    def test_detects_sudo(self):
        logs = [
            _make_log(0, "sudo", source="sudo", raw_text="sudo: admin : USER=root"),
        ]
        threats = detect_privilege_escalation(logs)
        assert len(threats) == 1
        assert threats[0].type == "privilege_escalation"

    def test_detects_user_root_pattern(self):
        logs = [
            _make_log(0, "command_exec", raw_text="admin : TTY=pts/0 ; USER=root ; COMMAND=/bin/bash"),
        ]
        threats = detect_privilege_escalation(logs)
        assert len(threats) == 1

    def test_no_priv_esc(self):
        logs = [_make_log(0, "failed_auth")]
        threats = detect_privilege_escalation(logs)
        assert len(threats) == 0


class TestDataExfiltration:
    def test_detects_large_transfer(self):
        logs = [
            _make_log(0, "file_transfer", raw_text="scp: transfer 500MB to 1.2.3.4"),
        ]
        threats = detect_data_exfiltration(logs, threshold_mb=100)
        assert len(threats) == 1
        assert threats[0].type == "data_exfiltration"

    def test_detects_gb_transfer(self):
        logs = [
            _make_log(0, "file_transfer", raw_text="transfer 2.3GB complete"),
        ]
        threats = detect_data_exfiltration(logs, threshold_mb=100)
        assert len(threats) == 1

    def test_below_threshold(self):
        logs = [
            _make_log(0, "file_transfer", raw_text="transfer 50MB complete"),
        ]
        threats = detect_data_exfiltration(logs, threshold_mb=100)
        assert len(threats) == 0


class TestLateralMovement:
    def test_detects_internal_to_internal(self):
        logs = [
            _make_log(0, "ssh", source_ip="192.168.1.10", dest_ip="192.168.1.25"),
        ]
        threats = detect_lateral_movement(logs)
        assert len(threats) == 1
        assert threats[0].type == "lateral_movement"

    def test_ignores_external_to_internal(self):
        logs = [
            _make_log(0, "ssh", source_ip="203.0.113.50", dest_ip="192.168.1.25"),
        ]
        threats = detect_lateral_movement(logs)
        assert len(threats) == 0


class TestRunAllRules:
    def test_combined_detection(self):
        logs = [_make_log(i, "failed_auth", source_ip="10.0.0.1") for i in range(6)]
        logs.append(_make_log(6, "sudo", source="sudo", raw_text="sudo: admin : USER=root"))
        threats = run_all_rules(logs)
        types = {t.type for t in threats}
        assert "brute_force" in types
        assert "privilege_escalation" in types

    def test_empty_logs(self):
        threats = run_all_rules([])
        assert threats == []
