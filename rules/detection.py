"""Rule-based threat detection patterns. Free, instant, no API calls."""

import re
from collections import defaultdict

from models.log_entry import LogEntry
from models.threat import Threat


def detect_brute_force(logs: list[LogEntry], threshold: int = 5) -> list[Threat]:
    """Detect brute force attacks: N+ failed auth from same IP."""
    failed_by_ip: dict[str, list[int]] = defaultdict(list)
    for log in logs:
        if not log.is_valid:
            continue
        if log.event_type == "failed_auth" and log.source_ip:
            failed_by_ip[log.source_ip].append(log.index)

    threats = []
    for ip, indices in failed_by_ip.items():
        if len(indices) >= threshold:
            threats.append(
                Threat(
                    threat_id=f"RULE-BRUTE-{ip.replace('.', '_')}",
                    type="brute_force",
                    confidence=min(0.5 + len(indices) * 0.05, 0.99),
                    source_log_indices=indices,
                    method="rule_based",
                    description=f"Brute force attack detected: {len(indices)} failed authentication attempts from {ip}",
                    source_ip=ip,
                )
            )
    return threats


def detect_port_scan(logs: list[LogEntry], threshold: int = 10) -> list[Threat]:
    """Detect port scanning: connections to N+ distinct ports from same source."""
    ports_by_ip: dict[str, set[str]] = defaultdict(set)
    indices_by_ip: dict[str, list[int]] = defaultdict(list)
    for log in logs:
        if not log.is_valid:
            continue
        if log.event_type == "connection" and log.source_ip:
            port_match = re.search(r"port[:\s]+(\d+)", log.details, re.IGNORECASE)
            if port_match:
                ports_by_ip[log.source_ip].add(port_match.group(1))
                indices_by_ip[log.source_ip].append(log.index)

    threats = []
    for ip, ports in ports_by_ip.items():
        if len(ports) >= threshold:
            threats.append(
                Threat(
                    threat_id=f"RULE-SCAN-{ip.replace('.', '_')}",
                    type="port_scan",
                    confidence=min(0.6 + len(ports) * 0.03, 0.95),
                    source_log_indices=indices_by_ip[ip],
                    method="rule_based",
                    description=f"Port scanning detected: {len(ports)} distinct ports probed from {ip}",
                    source_ip=ip,
                )
            )
    return threats


def detect_privilege_escalation(logs: list[LogEntry]) -> list[Threat]:
    """Detect privilege escalation: sudo/su usage patterns."""
    threats = []
    priv_indices = []
    for log in logs:
        if not log.is_valid:
            continue
        if log.event_type in ("privilege_escalation", "sudo", "su"):
            priv_indices.append(log.index)
        elif log.source in ("sudo", "su") or "USER=root" in log.raw_text:
            priv_indices.append(log.index)

    if priv_indices:
        threats.append(
            Threat(
                threat_id="RULE-PRIVESC-001",
                type="privilege_escalation",
                confidence=0.85,
                source_log_indices=priv_indices,
                method="rule_based",
                description=f"Privilege escalation detected: {len(priv_indices)} sudo/su events observed",
                source_ip="",
            )
        )
    return threats


def detect_data_exfiltration(
    logs: list[LogEntry], threshold_mb: float = 100.0
) -> list[Threat]:
    """Detect data exfiltration: large outbound transfers."""
    threats = []
    exfil_indices = []
    total_size = 0.0

    for log in logs:
        if not log.is_valid:
            continue
        if log.event_type in ("file_transfer", "data_transfer"):
            size_match = re.search(
                r"(\d+(?:\.\d+)?)\s*(GB|MB|KB)", log.raw_text, re.IGNORECASE
            )
            if size_match:
                size_val = float(size_match.group(1))
                unit = size_match.group(2).upper()
                size_mb = (
                    size_val * 1024 if unit == "GB" else size_val if unit == "MB" else size_val / 1024
                )
                total_size += size_mb
                exfil_indices.append(log.index)

    if total_size >= threshold_mb:
        threats.append(
            Threat(
                threat_id="RULE-EXFIL-001",
                type="data_exfiltration",
                confidence=min(0.7 + (total_size / 1000) * 0.1, 0.95),
                source_log_indices=exfil_indices,
                method="rule_based",
                description=f"Possible data exfiltration: {total_size:.0f}MB transferred in {len(exfil_indices)} operations",
                source_ip="",
            )
        )
    return threats


def detect_lateral_movement(logs: list[LogEntry]) -> list[Threat]:
    """Detect lateral movement: internal-to-internal connections on unusual ports."""
    internal_prefixes = ("10.", "172.16.", "172.17.", "172.18.", "172.19.",
                         "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                         "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                         "172.30.", "172.31.", "192.168.")
    lateral_indices = []

    for log in logs:
        if not log.is_valid:
            continue
        src_internal = log.source_ip and any(
            log.source_ip.startswith(p) for p in internal_prefixes
        )
        dst_internal = log.dest_ip and any(
            log.dest_ip.startswith(p) for p in internal_prefixes
        )
        if src_internal and dst_internal and log.event_type in (
            "connection",
            "ssh",
            "rdp",
            "smb",
        ):
            lateral_indices.append(log.index)

    if lateral_indices:
        return [
            Threat(
                threat_id="RULE-LATERAL-001",
                type="lateral_movement",
                confidence=0.75,
                source_log_indices=lateral_indices,
                method="rule_based",
                description=f"Possible lateral movement: {len(lateral_indices)} internal-to-internal connections detected",
                source_ip="",
            )
        ]
    return []


def run_all_rules(logs: list[LogEntry]) -> list[Threat]:
    """Run all rule-based detection patterns and return combined results."""
    threats: list[Threat] = []
    threats.extend(detect_brute_force(logs))
    threats.extend(detect_port_scan(logs))
    threats.extend(detect_privilege_escalation(logs))
    threats.extend(detect_data_exfiltration(logs))
    threats.extend(detect_lateral_movement(logs))
    return threats
