"""LangGraph pipeline: Ingest → Detect → Classify → Report with conditional routing."""

import time
from typing import Literal

from langgraph.graph import END, START, StateGraph

from models.incident_report import IncidentReport
from pipeline.agents.classify import run_classify
from pipeline.agents.detect import run_detect
from pipeline.agents.ingest import run_ingest
from pipeline.agents.report import run_report
from pipeline.state import PipelineState


# ── Conditional routing functions ──

def should_detect(state: PipelineState) -> Literal["detect", "empty_report"]:
    """Route to Detect Agent only if there are valid parsed logs."""
    parsed_logs = state.get("parsed_logs", [])
    valid_count = sum(1 for log in parsed_logs if log.is_valid)
    if valid_count > 0:
        return "detect"
    return "empty_report"


def should_classify(state: PipelineState) -> Literal["classify", "clean_report"]:
    """Route to Classify Agent only if threats were found."""
    threats = state.get("threats", [])
    if threats:
        return "classify"
    return "clean_report"


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


# ── Build the graph ──

def build_pipeline() -> StateGraph:
    """Build and compile the LangGraph neuralwarden pipeline."""
    workflow = StateGraph(PipelineState)

    # Add nodes
    workflow.add_node("ingest", run_ingest)
    workflow.add_node("detect", run_detect)
    workflow.add_node("classify", run_classify)
    workflow.add_node("report", run_report)
    workflow.add_node("empty_report", empty_report_node)
    workflow.add_node("clean_report", clean_report_node)

    # Entry point
    workflow.add_edge(START, "ingest")

    # Conditional: Ingest → Detect (only if valid logs exist)
    workflow.add_conditional_edges("ingest", should_detect, {
        "detect": "detect",
        "empty_report": "empty_report",
    })

    # Conditional: Detect → Classify (only if threats found)
    workflow.add_conditional_edges("detect", should_classify, {
        "classify": "classify",
        "clean_report": "clean_report",
    })

    # Classify always proceeds to Report
    workflow.add_edge("classify", "report")

    # Terminal edges
    workflow.add_edge("report", END)
    workflow.add_edge("empty_report", END)
    workflow.add_edge("clean_report", END)

    return workflow.compile()


def run_pipeline(raw_logs: list[str]) -> PipelineState:
    """Run the full neuralwarden pipeline on a list of raw log lines."""
    graph = build_pipeline()

    start_time = time.time()
    result = graph.invoke({
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
    })
    result["pipeline_time"] = time.time() - start_time

    return result
