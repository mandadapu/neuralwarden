"""LangGraph pipeline v2.0: Ingest → Detect → Validate → Classify → Report
with conditional routing, burst mode, RAG, and HITL support."""

import time
import uuid
from typing import Literal

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from models.incident_report import IncidentReport
from pipeline.agents.classify import run_classify
from pipeline.agents.detect import run_detect
from pipeline.agents.ingest import run_ingest
from pipeline.agents.ingest_chunk import run_ingest_chunk
from pipeline.agents.report import run_report
from pipeline.agents.validate import run_validate
from pipeline.state import PipelineState


# ── Constants ──

BURST_THRESHOLD = 1000
CHUNK_SIZE = 200


# ── Conditional routing functions ──


def should_burst(state: PipelineState) -> list[Send] | str:
    """Route to burst mode if log count exceeds threshold, or skip ingest if pre-parsed."""
    # If parsed_logs already populated (pre-parsed / skip_ingest), skip LLM ingest entirely
    if state.get("parsed_logs"):
        return "skip_ingest"

    raw_logs = state.get("raw_logs", [])
    if len(raw_logs) > BURST_THRESHOLD:
        chunks = []
        for i in range(0, len(raw_logs), CHUNK_SIZE):
            chunk = raw_logs[i : i + CHUNK_SIZE]
            chunks.append(
                Send(
                    "ingest_chunk",
                    {"chunk_logs": chunk, "chunk_index": i // CHUNK_SIZE},
                )
            )
        return chunks
    return "ingest"


def should_detect(state: PipelineState) -> Literal["detect", "empty_report"]:
    """Route to Detect Agent only if there are valid parsed logs."""
    parsed_logs = state.get("parsed_logs", [])
    valid_count = sum(1 for log in parsed_logs if log.is_valid)
    if valid_count > 0:
        return "detect"
    return "empty_report"


def should_classify_after_validate(
    state: PipelineState,
) -> Literal["classify", "clean_report"]:
    """Route to Classify Agent only if threats were found (including validator findings)."""
    threats = state.get("threats", [])
    if threats:
        return "classify"
    return "clean_report"


def should_hitl(state: PipelineState) -> Literal["hitl_review", "report"]:
    """Route to HITL review if any critical threats exist."""
    classified = state.get("classified_threats", [])
    has_critical = any(ct.risk == "critical" for ct in classified)
    if has_critical:
        return "hitl_review"
    return "report"


# ── Short-circuit nodes ──


def empty_report_node(state: PipelineState) -> dict:
    """Generate report when all logs are malformed."""
    return {
        "report": IncidentReport(
            summary=(
                f"All {state.get('total_count', 0)} log entries were malformed and could not be parsed. "
                "No threat analysis was performed. Review log sources for formatting issues."
            ),
            threat_count=0,
        ),
    }


def clean_report_node(state: PipelineState) -> dict:
    """Generate report when no threats are found."""
    total = state.get("total_count", 0)
    invalid = state.get("invalid_count", 0)
    valid = total - invalid
    return {
        "report": IncidentReport(
            summary=(
                f"Analyzed {valid} valid log entries (out of {total} total). "
                "No security threats were detected. All activity appears normal."
            ),
            threat_count=0,
        ),
    }


def aggregate_ingest(state: PipelineState) -> dict:
    """Aggregate parsed_logs from burst mode chunks, compute totals."""
    parsed_logs = state.get("parsed_logs", [])
    invalid_count = sum(1 for log in parsed_logs if not log.is_valid)
    total_count = len(parsed_logs)
    return {
        "invalid_count": invalid_count,
        "total_count": total_count,
        "burst_mode": True,
        "chunk_count": (total_count + CHUNK_SIZE - 1) // CHUNK_SIZE,
    }


def skip_ingest_node(state: PipelineState) -> dict:
    """Pass-through node for pre-parsed logs — just compute counts, no LLM."""
    parsed_logs = state.get("parsed_logs", [])
    invalid_count = sum(1 for log in parsed_logs if not log.is_valid)
    total_count = len(parsed_logs)
    return {
        "invalid_count": invalid_count,
        "total_count": total_count,
    }


# ── Build the graph ──


def build_pipeline(enable_hitl: bool = False):
    """Build and compile the LangGraph neuralwarden pipeline.

    Args:
        enable_hitl: If True, compiles with checkpointer to enable
                     interrupt-based human-in-the-loop for critical threats.
    """
    workflow = StateGraph(PipelineState)

    # Core nodes
    workflow.add_node("ingest", run_ingest)
    workflow.add_node("ingest_chunk", run_ingest_chunk)
    workflow.add_node("aggregate_ingest", aggregate_ingest)
    workflow.add_node("skip_ingest", skip_ingest_node)
    workflow.add_node("detect", run_detect)
    workflow.add_node("validate", run_validate)
    workflow.add_node("classify", run_classify)
    workflow.add_node("report", run_report)
    workflow.add_node("empty_report", empty_report_node)
    workflow.add_node("clean_report", clean_report_node)

    # Entry: burst mode decision
    workflow.add_conditional_edges(START, should_burst)

    # Normal ingest → should_detect
    workflow.add_conditional_edges(
        "ingest",
        should_detect,
        {"detect": "detect", "empty_report": "empty_report"},
    )

    # Pre-parsed (skip_ingest) → should_detect
    workflow.add_conditional_edges(
        "skip_ingest",
        should_detect,
        {"detect": "detect", "empty_report": "empty_report"},
    )

    # Burst ingest_chunk (parallel) → aggregate → should_detect
    workflow.add_edge("ingest_chunk", "aggregate_ingest")
    workflow.add_conditional_edges(
        "aggregate_ingest",
        should_detect,
        {"detect": "detect", "empty_report": "empty_report"},
    )

    # Detect → Validate (always, to check for missed threats)
    workflow.add_edge("detect", "validate")

    # Validate → should_classify (check if any threats exist now)
    workflow.add_conditional_edges(
        "validate",
        should_classify_after_validate,
        {"classify": "classify", "clean_report": "clean_report"},
    )

    # HITL or direct to report
    if enable_hitl:
        from pipeline.agents.hitl import run_hitl_review

        workflow.add_node("hitl_review", run_hitl_review)
        workflow.add_conditional_edges(
            "classify",
            should_hitl,
            {"hitl_review": "hitl_review", "report": "report"},
        )
        workflow.add_edge("hitl_review", "report")
    else:
        workflow.add_edge("classify", "report")

    # Terminal edges
    workflow.add_edge("report", END)
    workflow.add_edge("empty_report", END)
    workflow.add_edge("clean_report", END)

    # Compile
    if enable_hitl:
        from langgraph.checkpoint.memory import MemorySaver

        return workflow.compile(checkpointer=MemorySaver())
    return workflow.compile()


def run_pipeline(
    raw_logs: list[str],
    enable_hitl: bool = False,
    thread_id: str | None = None,
) -> PipelineState:
    """Run the full neuralwarden pipeline on a list of raw log lines.

    Args:
        raw_logs: List of raw log lines to analyze.
        enable_hitl: Enable human-in-the-loop for critical threats.
        thread_id: Thread ID for HITL checkpointing. Auto-generated if not provided.
    """
    graph = build_pipeline(enable_hitl=enable_hitl)

    config = {}
    if enable_hitl:
        config = {"configurable": {"thread_id": thread_id or str(uuid.uuid4())}}

    initial_state: dict = {
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
        "correlated_evidence": [],
    }

    start_time = time.time()
    result = graph.invoke(initial_state, config=config if config else None)
    result["pipeline_time"] = time.time() - start_time

    # Compute total pipeline cost from agent metrics
    agent_metrics = result.get("agent_metrics", {})
    total_cost = sum(m.get("cost_usd", 0) for m in agent_metrics.values())
    result["pipeline_cost"] = total_cost

    return result
