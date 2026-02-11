"""Pipeline service — wraps LangGraph pipeline for the FastAPI backend."""

import time
import uuid
from functools import lru_cache

from langgraph.types import Command

from pipeline.graph import build_pipeline

from api.schemas import (
    AgentMetricsResponse,
    AnalysisResponse,
    ClassifiedThreatResponse,
    IncidentReportResponse,
    ActionStepResponse,
    PendingThreatResponse,
    SummaryResponse,
)


@lru_cache(maxsize=1)
def _get_hitl_graph():
    return build_pipeline(enable_hitl=True)


def _build_initial_state(raw_logs: list[str]) -> dict:
    return {
        "raw_logs": raw_logs,
        "parsed_logs": [],
        "invalid_count": 0,
        "total_count": 0,
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
    }


def _serialize_report(report) -> IncidentReportResponse | None:
    if report is None:
        return None
    return IncidentReportResponse(
        summary=report.summary,
        threat_count=report.threat_count,
        critical_count=report.critical_count,
        high_count=report.high_count,
        medium_count=report.medium_count,
        low_count=report.low_count,
        timeline=report.timeline,
        action_plan=[
            ActionStepResponse(
                step=s.step, action=s.action, urgency=s.urgency, owner=s.owner
            )
            for s in report.action_plan
        ],
        recommendations=list(report.recommendations),
        ioc_summary=list(report.ioc_summary),
        mitre_techniques=list(report.mitre_techniques),
        generated_at=report.generated_at,
    )


def _serialize_threats(classified) -> list[ClassifiedThreatResponse]:
    return [
        ClassifiedThreatResponse(
            threat_id=ct.threat_id,
            type=ct.type,
            confidence=ct.confidence,
            source_log_indices=list(ct.source_log_indices),
            method=ct.method,
            description=ct.description,
            source_ip=ct.source_ip,
            risk=ct.risk,
            risk_score=ct.risk_score,
            mitre_technique=ct.mitre_technique,
            mitre_tactic=ct.mitre_tactic,
            business_impact=ct.business_impact,
            affected_systems=list(ct.affected_systems),
            remediation_priority=ct.remediation_priority,
        )
        for ct in classified
    ]


def _serialize_metrics(agent_metrics: dict) -> dict[str, AgentMetricsResponse]:
    return {
        name: AgentMetricsResponse(
            cost_usd=m.get("cost_usd", 0),
            latency_ms=m.get("latency_ms", 0),
            input_tokens=m.get("input_tokens", 0),
            output_tokens=m.get("output_tokens", 0),
        )
        for name, m in agent_metrics.items()
    }


def _build_summary(result: dict, classified_count: int) -> SummaryResponse:
    classified = result.get("classified_threats", [])
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for ct in classified:
        if ct.risk in counts:
            counts[ct.risk] += 1
    total = sum(counts.values())
    return SummaryResponse(
        total_threats=total,
        severity_counts=counts,
        auto_ignored=result.get("validator_missed_count", 0),
        total_logs=result.get("total_count", 0),
        logs_cleared=result.get("total_count", 0) - total,
    )


def run_analysis(logs: str) -> AnalysisResponse:
    """Run the pipeline synchronously and return the response."""
    raw_logs = [line.strip() for line in logs.strip().split("\n") if line.strip()]
    if not raw_logs:
        return AnalysisResponse(
            status="completed",
            summary=SummaryResponse(),
            report=IncidentReportResponse(summary="No logs provided."),
        )

    graph = _get_hitl_graph()
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    initial_state = _build_initial_state(raw_logs)

    start = time.time()
    try:
        result = {}
        for event in graph.stream(initial_state, config, stream_mode="values"):
            result = event

        snapshot = graph.get_state(config)
        if snapshot.next:
            # HITL interrupt — partial results
            elapsed = time.time() - start
            classified = result.get("classified_threats", [])
            pending = []
            for ct in classified:
                if ct.risk == "critical":
                    pending.append(
                        PendingThreatResponse(
                            threat_id=ct.threat_id,
                            type=ct.type,
                            risk_score=ct.risk_score,
                            description=ct.description,
                            source_ip=ct.source_ip,
                            mitre_technique=ct.mitre_technique,
                            business_impact=ct.business_impact,
                            suggested_action=(
                                f"Block {ct.source_ip}"
                                if ct.source_ip
                                else "Investigate immediately"
                            ),
                        )
                    )
            return AnalysisResponse(
                thread_id=thread_id,
                status="hitl_required",
                summary=_build_summary(result, len(classified)),
                classified_threats=_serialize_threats(classified),
                pending_critical_threats=pending,
                report=None,
                agent_metrics=_serialize_metrics(result.get("agent_metrics", {})),
                pipeline_time=elapsed,
            )

        # Normal completion
        elapsed = time.time() - start
        classified = result.get("classified_threats", [])
        return AnalysisResponse(
            thread_id=None,
            status="completed",
            summary=_build_summary(result, len(classified)),
            classified_threats=_serialize_threats(classified),
            pending_critical_threats=[],
            report=_serialize_report(result.get("report")),
            agent_metrics=_serialize_metrics(result.get("agent_metrics", {})),
            pipeline_time=elapsed,
        )

    except Exception as e:
        return AnalysisResponse(
            status="error",
            error=str(e),
            pipeline_time=time.time() - start,
        )


def resume_analysis(thread_id: str, decision: str, notes: str) -> AnalysisResponse:
    """Resume pipeline after HITL review."""
    graph = _get_hitl_graph()
    config = {"configurable": {"thread_id": thread_id}}

    human_decisions = {
        "decision": decision.lower(),
        "reviewer": "dashboard_user",
        "notes": notes,
    }

    try:
        start = time.time()
        result = {}
        for event in graph.stream(
            Command(resume=human_decisions), config, stream_mode="values"
        ):
            result = event

        elapsed = time.time() - start
        classified = result.get("classified_threats", [])
        return AnalysisResponse(
            thread_id=thread_id,
            status="completed",
            summary=_build_summary(result, len(classified)),
            classified_threats=_serialize_threats(classified),
            pending_critical_threats=[],
            report=_serialize_report(result.get("report")),
            agent_metrics=_serialize_metrics(result.get("agent_metrics", {})),
            pipeline_time=elapsed,
        )
    except Exception as e:
        return AnalysisResponse(
            thread_id=thread_id,
            status="error",
            error=str(e),
        )
