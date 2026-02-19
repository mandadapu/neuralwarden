"""Streaming pipeline service — yields SSE events as each agent completes."""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncIterator

from api.schemas import AnalysisResponse
from api.services import (
    _build_initial_state,
    _build_summary,
    _get_hitl_graph,
    _serialize_metrics,
    _serialize_report,
    _serialize_threats,
    PendingThreatResponse,
)


# Agent stage ordering for progress tracking
STAGES = ["ingest", "detect", "validate", "classify", "report"]


def _detect_completed_agent(prev_state: dict, new_state: dict) -> str | None:
    """Infer which agent just ran by comparing state snapshots."""
    # Check for report (must be before classify since report also has classified_threats)
    if new_state.get("report") and not prev_state.get("report"):
        return "report"
    # Check for classified_threats
    if new_state.get("classified_threats") and not prev_state.get("classified_threats"):
        return "classify"
    # Check for validator_findings key change
    if new_state.get("validator_sample_size", 0) > prev_state.get("validator_sample_size", 0):
        return "validate"
    # Check for detection_stats
    if new_state.get("detection_stats") and not prev_state.get("detection_stats"):
        return "detect"
    # Check for parsed_logs
    if new_state.get("parsed_logs") and not prev_state.get("parsed_logs"):
        return "ingest"
    return None


def _sse_event(event_type: str, data: dict) -> str:
    """Format an SSE event string."""
    return json.dumps({"event": event_type, **data})


async def stream_analysis(logs: str, skip_ingest: bool = False) -> AsyncIterator[str]:
    """Generator that yields SSE events as each pipeline agent completes.

    Event types:
    - agent_start: An agent is about to run
    - agent_complete: An agent finished (includes metrics)
    - hitl_required: Pipeline paused for human review
    - complete: Pipeline finished (includes full response)
    - error: Pipeline failed

    Args:
        logs: Raw security log text (newline-separated).
        skip_ingest: If True, parse logs deterministically and skip LLM ingest.
    """
    raw_logs = [line.strip() for line in logs.strip().split("\n") if line.strip()]
    if not raw_logs:
        yield _sse_event("complete", {
            "stage": "complete",
            "response": AnalysisResponse(
                status="completed",
                report={"summary": "No logs provided."},
            ).model_dump(),
        })
        return

    # Pre-parse if skip_ingest requested (saves LLM tokens)
    parsed_logs = None
    if skip_ingest:
        from api.gcp_logging import deterministic_parse
        parsed_logs = deterministic_parse(raw_logs)

    graph = _get_hitl_graph()
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = _build_initial_state(raw_logs, parsed_logs=parsed_logs)

    start = time.time()
    prev_state: dict = {}
    completed_agents: list[str] = []

    # Signal pipeline start — skip ingest stage if pre-parsed
    if skip_ingest:
        yield _sse_event("agent_complete", {"stage": "ingest", "agent_index": 0, "total_agents": 5, "elapsed_s": 0, "cost_usd": 0, "latency_ms": 0})
        completed_agents.append("ingest")
        yield _sse_event("agent_start", {"stage": "detect", "agent_index": 1, "total_agents": 5})
    else:
        yield _sse_event("agent_start", {"stage": "ingest", "agent_index": 0, "total_agents": 5})

    try:
        for event in graph.stream(initial_state, config, stream_mode="values"):
            agent = _detect_completed_agent(prev_state, event)
            if agent and agent not in completed_agents:
                completed_agents.append(agent)
                elapsed = time.time() - start

                # Get agent metrics if available
                agent_metrics = event.get("agent_metrics", {})
                agent_metric = agent_metrics.get(agent, {})

                yield _sse_event("agent_complete", {
                    "stage": agent,
                    "agent_index": STAGES.index(agent) if agent in STAGES else len(completed_agents) - 1,
                    "elapsed_s": round(elapsed, 2),
                    "cost_usd": agent_metric.get("cost_usd", 0),
                    "latency_ms": agent_metric.get("latency_ms", 0),
                })

                # Signal next agent start
                next_idx = STAGES.index(agent) + 1 if agent in STAGES else len(completed_agents)
                if next_idx < len(STAGES):
                    yield _sse_event("agent_start", {
                        "stage": STAGES[next_idx],
                        "agent_index": next_idx,
                        "total_agents": 5,
                    })

            prev_state = event

        result = prev_state
        snapshot = graph.get_state(config)
        elapsed = time.time() - start

        if snapshot.next:
            # HITL interrupt
            classified = result.get("classified_threats", [])
            pending = []
            for ct in classified:
                if ct.risk == "critical":
                    pending.append(PendingThreatResponse(
                        threat_id=ct.threat_id,
                        type=ct.type,
                        risk_score=ct.risk_score,
                        description=ct.description,
                        source_ip=ct.source_ip,
                        mitre_technique=ct.mitre_technique,
                        business_impact=ct.business_impact,
                        suggested_action=f"Block {ct.source_ip}" if ct.source_ip else "Investigate immediately",
                    ))

            response = AnalysisResponse(
                thread_id=thread_id,
                status="hitl_required",
                summary=_build_summary(result, len(classified)),
                classified_threats=_serialize_threats(classified),
                pending_critical_threats=pending,
                report=None,
                agent_metrics=_serialize_metrics(result.get("agent_metrics", {})),
                pipeline_time=elapsed,
            )
            yield _sse_event("hitl_required", {"response": response.model_dump()})
        else:
            # Normal completion
            classified = result.get("classified_threats", [])

            # Slack notification for critical threats
            try:
                from pipeline.notifications import notify_critical_threats
                critical = [ct for ct in classified if ct.risk == "critical"]
                if critical:
                    notify_critical_threats(
                        [{"type": ct.type, "risk_score": ct.risk_score, "source_ip": ct.source_ip, "description": ct.description} for ct in critical],
                        report_summary=result.get("report").summary if result.get("report") else "",
                    )
            except Exception:
                pass

            response = AnalysisResponse(
                thread_id=None,
                status="completed",
                summary=_build_summary(result, len(classified)),
                classified_threats=_serialize_threats(classified),
                pending_critical_threats=[],
                report=_serialize_report(result.get("report")),
                agent_metrics=_serialize_metrics(result.get("agent_metrics", {})),
                pipeline_time=elapsed,
            )

            # Persist to report history
            try:
                from api.database import save_analysis
                analysis_id = save_analysis(response.model_dump())
                response.analysis_id = analysis_id
            except Exception:
                pass

            yield _sse_event("complete", {"response": response.model_dump()})

    except Exception as e:
        yield _sse_event("error", {
            "error": str(e),
            "elapsed_s": round(time.time() - start, 2),
        })
