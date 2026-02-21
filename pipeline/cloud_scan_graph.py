"""Cloud Scan Super Agent — LangGraph pipeline for intelligent GCP scanning.

Discovery -> Router -> parallel Active Scanner / Log Analyzer -> Aggregate ->
feed into existing threat pipeline (Detect -> Validate -> Classify -> Report).
"""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from pipeline.cloud_scan_state import ScanAgentState
from pipeline.agents.cloud_router import router_node
from pipeline.agents.active_scanner import active_scanner_node
from pipeline.agents.log_analyzer import log_analyzer_node
from pipeline.agents.correlation_engine import correlate_findings

logger = logging.getLogger(__name__)

# -- Thread-local progress queue --
# The SSE endpoint sets a queue before running the graph so that
# threat_pipeline_node can push sub-stage events back to the client.

_thread_local = threading.local()


def set_progress_queue(q):
    """Set the progress queue on the current thread (called from SSE runner)."""
    _thread_local.progress_queue = q
    _thread_local.threat_log_entries = []


def _get_progress_queue():
    return getattr(_thread_local, "progress_queue", None)


def _get_threat_log() -> list[dict]:
    return getattr(_thread_local, "threat_log_entries", [])


def _threat_log(level: str, agent: str, message: str) -> None:
    entries = _get_threat_log()
    entries.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "agent": agent,
        "message": message,
    })


# -- Discovery Node --


def _discover_assets(
    project_id: str, credentials_json: str, services: list[str]
) -> tuple[list[dict], list[dict], list[str], dict]:
    """Discover GCP assets using the existing scanner's discovery functions.

    Parses metadata_json into a metadata dict for each asset so the router
    and scanner agents can inspect structured metadata directly.

    Returns (assets, issues, log_lines, scan_log_data).
    """
    from api.gcp_scanner import run_scan
    result = run_scan(project_id, credentials_json, services)
    assets = result.get("assets", [])
    issues = result.get("issues", [])
    log_lines = result.get("log_lines", [])

    # Parse metadata_json -> metadata dict for router inspection
    for asset in assets:
        raw = asset.pop("metadata_json", "{}")
        try:
            asset["metadata"] = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            asset["metadata"] = {}

    return assets, issues, log_lines, result.get("scan_log", {})


def discovery_node(state: ScanAgentState) -> dict:
    """Enumerate all GCP assets for the project."""
    assets, issues, log_lines, scan_log_data = _discover_assets(
        state["project_id"],
        state.get("credentials_json", ""),
        state.get("enabled_services") or None,
    )
    return {
        "discovered_assets": assets,
        "scan_issues": issues,
        "log_lines": log_lines,
        "scan_status": "discovered",
        "scan_log_data": scan_log_data,
    }


# -- Dispatch Node (fan-out) --


def dispatch_agents(state: ScanAgentState) -> list[Send] | str:
    """Route each asset to the appropriate scanner agent via Send()."""
    public = state.get("public_assets", [])
    private = state.get("private_assets", [])
    sends = []

    for asset in public:
        sends.append(Send("active_scanner", {
            "current_asset": asset,
            "project_id": state["project_id"],
            "credentials_json": state.get("credentials_json", ""),
        }))

    for asset in private:
        sends.append(Send("log_analyzer", {
            "current_asset": asset,
            "project_id": state["project_id"],
            "credentials_json": state.get("credentials_json", ""),
        }))

    if not sends:
        return "aggregate"

    return sends


# -- Aggregate Node --


def aggregate_node(state: ScanAgentState) -> dict:
    """Merge results from all scanner agents and run correlation engine."""
    scanned = state.get("scanned_assets", [])
    public_count = sum(1 for s in scanned if s.get("route") == "active")
    scan_type = "full" if public_count > 0 else "cloud_logging_only"

    # Cross-reference scanner findings with log activity
    scan_issues = state.get("scan_issues", [])
    log_lines = state.get("log_lines", [])
    correlated_issues, active_count, correlated_evidence = correlate_findings(scan_issues, log_lines)

    return {
        "scan_status": "scanned",
        "assets_scanned": len(scanned),
        "scan_type": scan_type,
        "correlated_issues": correlated_issues,
        "active_exploits_detected": active_count,
        "correlated_evidence": correlated_evidence,
    }


# -- Threat Pipeline Bridge --


def should_run_threat_pipeline(state: ScanAgentState) -> str:
    """Only run the threat pipeline if we have log lines to analyze."""
    log_lines = state.get("log_lines", [])
    if log_lines:
        return "threat_pipeline"
    return "finalize"


def _map_threat_node_to_stage(node_name: str) -> str | None:
    """Map a threat pipeline node name to a display stage name."""
    mapping = {
        "skip_ingest": "ingest",
        "ingest": "ingest",
        "ingest_chunk": "ingest",
        "aggregate_ingest": "ingest",
        "detect": "detect",
        "validate": "validate",
        "classify": "classify",
        "report": "report",
        "empty_report": "report",
        "clean_report": "report",
    }
    return mapping.get(node_name)


def threat_pipeline_node(state: ScanAgentState) -> dict:
    """Feed collected log lines into the existing threat detection pipeline.

    Uses stream(stream_mode='updates') to push sub-stage progress events
    back through the thread-local queue so the SSE endpoint can relay them.
    """
    from api.gcp_logging import deterministic_parse
    from pipeline.graph import build_pipeline

    log_lines = state.get("log_lines", [])
    if not log_lines:
        return {}

    parsed = deterministic_parse(log_lines)

    threat_graph = build_pipeline(enable_hitl=False)
    initial_state = {
        "raw_logs": log_lines,
        "parsed_logs": parsed,
        "invalid_count": 0,
        "total_count": len(parsed),
        "threats": [],
        "detection_stats": {},
        "classified_threats": [],
        "report": None,
        "error": None,
        "pipeline_cost": 0.0,
        "pipeline_time": 0.0,
        "validator_findings": [],
        "validator_sample_size": 0,
        "validator_missed_count": 0,
        "rag_context": {},
        "human_decisions": [],
        "hitl_required": False,
        "pending_critical_threats": [],
        "agent_metrics": {},
        "burst_mode": False,
        "chunk_count": 0,
        "correlated_evidence": state.get("correlated_evidence", []),
    }

    progress_queue = _get_progress_queue()
    result = {}
    last_stage = None
    stage_start: dict[str, float] = {}
    pipeline_start = time.time()

    log_count = len(state.get("log_lines", []))
    _threat_log("info", "pipeline", f"Threat pipeline started — {log_count} log lines to analyze")

    for chunk in threat_graph.stream(initial_state, stream_mode="updates"):
        # chunk is {node_name: state_update}
        for node_name, update in chunk.items():
            stage = _map_threat_node_to_stage(node_name)
            if stage and stage != last_stage:
                # Log completion of previous stage
                if last_stage and last_stage in stage_start:
                    prev_metrics = update.get("agent_metrics", result.get("agent_metrics", {}))
                    m = prev_metrics.get(last_stage, {})
                    elapsed = round(time.time() - stage_start[last_stage], 1)
                    cost = m.get("cost_usd", 0)
                    tokens = m.get("input_tokens", 0) + m.get("output_tokens", 0)
                    _threat_log("info", last_stage, f"{last_stage.capitalize()} complete ({elapsed}s, {tokens} tokens, ${cost:.4f})")

                # Log start of new stage
                stage_start[stage] = time.time()
                _threat_log("info", stage, f"{stage.capitalize()} started")
                if progress_queue is not None:
                    progress_queue.put(("threat_stage", stage))
                last_stage = stage

            # Accumulate fields we care about from the final state
            if "classified_threats" in update:
                result["classified_threats"] = update["classified_threats"]
            if "report" in update:
                result["report"] = update["report"]
            if "agent_metrics" in update:
                result["agent_metrics"] = update["agent_metrics"]

    # Log completion of final stage
    if last_stage and last_stage in stage_start:
        m = result.get("agent_metrics", {}).get(last_stage, {})
        elapsed = round(time.time() - stage_start[last_stage], 1)
        cost = m.get("cost_usd", 0)
        tokens = m.get("input_tokens", 0) + m.get("output_tokens", 0)
        _threat_log("info", last_stage, f"{last_stage.capitalize()} complete ({elapsed}s, {tokens} tokens, ${cost:.4f})")

    pipeline_elapsed = round(time.time() - pipeline_start, 1)
    total_cost = sum(m.get("cost_usd", 0) for m in result.get("agent_metrics", {}).values())
    threats_found = len(result.get("classified_threats", []))
    _threat_log("info", "pipeline", f"Threat pipeline complete: {threats_found} threats classified ({pipeline_elapsed}s, ${total_cost:.4f})")

    return {
        "classified_threats": result.get("classified_threats", []),
        "report": result.get("report"),
        "agent_metrics": result.get("agent_metrics", {}),
        "threat_log_entries": _get_threat_log(),
    }


def finalize_node(state: ScanAgentState) -> dict:
    """Mark scan as complete."""
    return {"scan_status": "complete"}


# -- Build the Graph --


def build_scan_pipeline():
    """Build and compile the cloud scan super agent graph."""
    workflow = StateGraph(ScanAgentState)

    workflow.add_node("discovery", discovery_node)
    workflow.add_node("router", router_node)
    workflow.add_node("active_scanner", active_scanner_node)
    workflow.add_node("log_analyzer", log_analyzer_node)
    workflow.add_node("aggregate", aggregate_node)
    workflow.add_node("threat_pipeline", threat_pipeline_node)
    workflow.add_node("finalize", finalize_node)

    # Flow: START -> discovery -> router -> dispatch (fan-out) -> aggregate
    workflow.add_edge(START, "discovery")
    workflow.add_edge("discovery", "router")
    workflow.add_conditional_edges("router", dispatch_agents)
    workflow.add_edge("active_scanner", "aggregate")
    workflow.add_edge("log_analyzer", "aggregate")

    # After aggregate: optionally run threat pipeline
    workflow.add_conditional_edges(
        "aggregate",
        should_run_threat_pipeline,
        {"threat_pipeline": "threat_pipeline", "finalize": "finalize"},
    )
    workflow.add_edge("threat_pipeline", "finalize")
    workflow.add_edge("finalize", END)

    return workflow.compile()


# -- Convenience runner --


def run_cloud_scan(
    cloud_account_id: str,
    project_id: str,
    credentials_json: str = "",
    enabled_services: list[str] | None = None,
) -> dict:
    """Run the full cloud scan super agent and return results."""
    graph = build_scan_pipeline()
    result = graph.invoke({
        "cloud_account_id": cloud_account_id,
        "project_id": project_id,
        "credentials_json": credentials_json,
        "enabled_services": enabled_services or [],
        "discovered_assets": [],
        "public_assets": [],
        "private_assets": [],
        "scan_issues": [],
        "log_lines": [],
        "scanned_assets": [],
        "scan_status": "starting",
        "assets_scanned": 0,
        "total_assets": 0,
    })
    return result
