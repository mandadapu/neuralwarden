from typing import Literal

from pydantic import BaseModel, Field


class Threat(BaseModel):
    """A detected security threat."""

    threat_id: str = Field(description="Unique threat identifier (e.g., RULE-BRUTE-001)")
    type: str = Field(
        description="Threat type (e.g., brute_force, port_scan, privilege_escalation, data_exfiltration, lateral_movement)"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0-1")
    source_log_indices: list[int] = Field(
        default_factory=list, description="Indices of logs that triggered this detection"
    )
    method: Literal["rule_based", "ai_detected"] = Field(
        description="Detection method used"
    )
    description: str = Field(description="Human-readable description of the threat")
    source_ip: str = Field(default="", description="Primary source IP")


class ClassifiedThreat(BaseModel):
    """A threat enriched with risk classification and MITRE ATT&CK mapping."""

    threat_id: str
    type: str
    confidence: float
    source_log_indices: list[int] = Field(default_factory=list)
    method: Literal["rule_based", "ai_detected"]
    description: str
    source_ip: str = ""

    risk: Literal["critical", "high", "medium", "low", "informational"] = Field(
        description="Risk severity level"
    )
    risk_score: float = Field(
        ge=0.0, le=10.0, description="Numeric risk score (likelihood x impact x exploitability)"
    )
    mitre_technique: str = Field(
        default="", description="MITRE ATT&CK technique ID (e.g., T1110)"
    )
    mitre_tactic: str = Field(
        default="", description="MITRE ATT&CK tactic (e.g., Initial Access)"
    )
    business_impact: str = Field(default="", description="Business impact assessment")
    affected_systems: list[str] = Field(
        default_factory=list, description="Systems affected by this threat"
    )
    remediation_priority: int = Field(
        default=0, ge=0, description="Priority ranking (1 = highest)"
    )
