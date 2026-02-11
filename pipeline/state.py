from typing import Any

from typing_extensions import TypedDict

from models.log_entry import LogEntry
from models.threat import ClassifiedThreat, Threat
from models.incident_report import IncidentReport


class PipelineState(TypedDict, total=False):
    """Shared state passed between all agents in the LangGraph pipeline."""

    # Input
    raw_logs: list[str]

    # Ingest Agent writes
    parsed_logs: list[LogEntry]
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
