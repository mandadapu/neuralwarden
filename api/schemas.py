"""Request and response schemas for the FastAPI backend."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Requests ──


class AnalyzeRequest(BaseModel):
    logs: str = Field(description="Raw security log text (newline-separated)")


class HitlResumeRequest(BaseModel):
    decision: Literal["approve", "reject"] = Field(description="Human decision")
    notes: str = Field(default="", description="Optional reviewer notes")


# ── Responses ──


class ClassifiedThreatResponse(BaseModel):
    threat_id: str
    type: str
    confidence: float
    source_log_indices: list[int] = []
    method: Literal["rule_based", "ai_detected", "validator_detected"]
    description: str
    source_ip: str = ""
    risk: Literal["critical", "high", "medium", "low", "informational"]
    risk_score: float
    mitre_technique: str = ""
    mitre_tactic: str = ""
    business_impact: str = ""
    affected_systems: list[str] = []
    remediation_priority: int = 0


class PendingThreatResponse(BaseModel):
    threat_id: str
    type: str
    risk_score: float
    description: str
    source_ip: str = ""
    mitre_technique: str = ""
    business_impact: str = ""
    suggested_action: str = ""


class ActionStepResponse(BaseModel):
    step: int
    action: str
    urgency: str
    owner: str = "Security Team"


class IncidentReportResponse(BaseModel):
    summary: str
    threat_count: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    timeline: str = ""
    action_plan: list[ActionStepResponse] = []
    recommendations: list[str] = []
    ioc_summary: list[str] = []
    mitre_techniques: list[str] = []
    generated_at: datetime | None = None


class AgentMetricsResponse(BaseModel):
    cost_usd: float = 0.0
    latency_ms: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0


class SummaryResponse(BaseModel):
    total_threats: int = 0
    severity_counts: dict[str, int] = Field(
        default_factory=lambda: {"critical": 0, "high": 0, "medium": 0, "low": 0}
    )
    auto_ignored: int = 0
    total_logs: int = 0
    logs_cleared: int = 0


class AnalysisResponse(BaseModel):
    thread_id: str | None = None
    status: Literal["completed", "hitl_required", "error"] = "completed"
    summary: SummaryResponse = Field(default_factory=SummaryResponse)
    classified_threats: list[ClassifiedThreatResponse] = []
    pending_critical_threats: list[PendingThreatResponse] = []
    report: IncidentReportResponse | None = None
    agent_metrics: dict[str, AgentMetricsResponse] = {}
    pipeline_time: float = 0.0
    error: str | None = None


class SampleInfo(BaseModel):
    id: str
    name: str


class SampleContent(BaseModel):
    id: str
    name: str
    content: str


class SamplesListResponse(BaseModel):
    samples: list[SampleInfo]
