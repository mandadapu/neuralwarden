"""State definition for the cloud scan super agent."""

from __future__ import annotations

import operator
from typing import Annotated, Any

from typing_extensions import TypedDict

from models.log_entry import LogEntry
from models.threat import ClassifiedThreat
from models.incident_report import IncidentReport


class ScanAgentState(TypedDict, total=False):
    """Shared state for the cloud scan LangGraph pipeline."""

    # ── Input (set once at start) ──
    cloud_account_id: str
    project_id: str
    credentials_json: str
    enabled_services: list[str]

    # ── Discovery ──
    discovered_assets: list[dict]

    # ── Router decisions ──
    public_assets: list[dict]
    private_assets: list[dict]

    # ── Per-asset fan-out (set by Send()) ──
    current_asset: dict

    # ── Scanner results (Annotated for parallel fan-in via LangGraph) ──
    scan_issues: Annotated[list[dict], operator.add]
    log_lines: Annotated[list[str], operator.add]
    scanned_assets: Annotated[list[dict], operator.add]

    # ── Progress tracking ──
    scan_status: str
    assets_scanned: int
    total_assets: int

    # ── Threat pipeline results ──
    parsed_logs: list[LogEntry]
    threats: list[Any]
    classified_threats: list[ClassifiedThreat]
    report: IncidentReport | None
    agent_metrics: dict[str, dict[str, Any]]

    # ── Correlation ──
    correlated_issues: list[dict]
    active_exploits_detected: int
    correlated_evidence: list[dict]

    # ── Threat pipeline log ──
    threat_log_entries: list[dict]

    # ── Scan log ──
    scan_log_data: dict

    # ── Metadata ──
    error: str | None
    scan_type: str  # "full" or "cloud_logging_only"
