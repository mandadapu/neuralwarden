import operator
from typing import Annotated, Any

from typing_extensions import TypedDict

from models.log_entry import LogEntry
from models.threat import ClassifiedThreat, Threat
from models.incident_report import IncidentReport


class PipelineState(TypedDict, total=False):
    """Shared state passed between all agents in the LangGraph pipeline."""

    # Input
    raw_logs: list[str]

    # Ingest Agent writes (Annotated reducer for burst mode fan-in)
    parsed_logs: Annotated[list[LogEntry], operator.add]
    invalid_count: int
    total_count: int

    # Detect Agent writes
    threats: list[Threat]
    detection_stats: dict[str, Any]

    # Classify Agent writes
    classified_threats: list[ClassifiedThreat]

    # Report Agent writes
    report: IncidentReport | None

    # Pipeline metadata
    error: str | None
    pipeline_cost: float
    pipeline_time: float

    # --- v2.0: Validator Agent ---
    validator_findings: list[dict]
    validator_sample_size: int
    validator_missed_count: int

    # --- v2.0: RAG Threat Intelligence ---
    rag_context: dict[str, str]

    # --- v2.0: Human-in-the-Loop ---
    human_decisions: list[dict]
    hitl_required: bool
    pending_critical_threats: list[ClassifiedThreat]

    # --- v2.0: Technical Refinements ---
    agent_metrics: dict[str, dict[str, Any]]
    burst_mode: bool
    chunk_count: int
