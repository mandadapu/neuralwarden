"""Classify Agent — Sonnet 4.5: Risk-scores threats with MITRE ATT&CK mappings."""

import json

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.threat import ClassifiedThreat, Threat
from pipeline.metrics import AgentTimer
from pipeline.state import PipelineState
from pipeline.vector_store import format_threat_intel_context

MODEL = "claude-sonnet-4-5-20250929"

SYSTEM_PROMPT = """You are a cybersecurity risk classifier. For each detected threat, provide:

1. Risk level: critical, high, medium, low, or informational
2. Risk score: 0-10 (computed as likelihood x impact x exploitability, normalized)
3. MITRE ATT&CK technique ID (e.g., T1110 for Brute Force)
4. MITRE ATT&CK tactic (e.g., Initial Access, Privilege Escalation, Exfiltration)
5. Business impact assessment
6. Affected systems
7. Remediation priority (1 = highest)

If threat intelligence context is provided for a threat, use it to refine your risk assessment.
Known CVEs and recent exploits should increase the risk score and inform the MITRE mapping.

Respond with a JSON array. Each object must have these exact fields:
[{
  "threat_id": "original threat_id",
  "risk": "critical|high|medium|low|informational",
  "risk_score": 0.0-10.0,
  "mitre_technique": "T1110",
  "mitre_tactic": "Initial Access",
  "business_impact": "description of business impact",
  "affected_systems": ["system1", "system2"],
  "remediation_priority": 1
}]

IMPORTANT: Only output the JSON array, nothing else."""


def _fallback_classify(threat: Threat, priority: int) -> ClassifiedThreat:
    """Fallback classification when AI fails: assign MEDIUM risk."""
    return ClassifiedThreat(
        threat_id=threat.threat_id,
        type=threat.type,
        confidence=threat.confidence,
        source_log_indices=threat.source_log_indices,
        method=threat.method,
        description=threat.description,
        source_ip=threat.source_ip,
        risk="medium",
        risk_score=5.0,
        mitre_technique="",
        mitre_tactic="",
        business_impact="Unable to assess — classification failed",
        affected_systems=[],
        remediation_priority=priority,
    )


def run_classify(state: PipelineState) -> dict:
    """Classify detected threats with risk scores and MITRE mappings."""
    threats = state.get("threats", [])

    if not threats:
        return {"classified_threats": []}

    # Format threats for prompt with RAG enrichment
    threat_data = []
    rag_context: dict[str, str] = {}
    for t in threats:
        entry: dict = {
            "threat_id": t.threat_id,
            "type": t.type,
            "confidence": t.confidence,
            "method": t.method,
            "description": t.description,
            "source_ip": t.source_ip,
            "source_log_count": len(t.source_log_indices),
        }
        intel = format_threat_intel_context(t.description, t.type, t.source_ip)
        if intel:
            entry["threat_intelligence"] = intel
            rag_context[t.threat_id] = intel
        threat_data.append(entry)

    try:
        llm = ChatAnthropic(
            model=MODEL,
            temperature=0.1,
            max_tokens=4096,
        )

        with AgentTimer("classify", MODEL) as timer:
            response = llm.invoke([
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Classify these {len(threats)} detected threats:\n\n{json.dumps(threat_data, indent=2)}"
                ),
            ])
            timer.record_usage(response)

        content = response.content
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        classifications = json.loads(content.strip())

        # Build lookup for AI classifications
        class_map = {c["threat_id"]: c for c in classifications}

        classified: list[ClassifiedThreat] = []
        for i, threat in enumerate(threats):
            ai_class = class_map.get(threat.threat_id)
            if ai_class:
                classified.append(
                    ClassifiedThreat(
                        threat_id=threat.threat_id,
                        type=threat.type,
                        confidence=threat.confidence,
                        source_log_indices=threat.source_log_indices,
                        method=threat.method,
                        description=threat.description,
                        source_ip=threat.source_ip,
                        risk=ai_class.get("risk", "medium"),
                        risk_score=float(ai_class.get("risk_score", 5.0)),
                        mitre_technique=ai_class.get("mitre_technique", ""),
                        mitre_tactic=ai_class.get("mitre_tactic", ""),
                        business_impact=ai_class.get("business_impact", ""),
                        affected_systems=ai_class.get("affected_systems", []),
                        remediation_priority=int(ai_class.get("remediation_priority", i + 1)),
                    )
                )
            else:
                classified.append(_fallback_classify(threat, i + 1))

        # Sort by remediation priority
        classified.sort(key=lambda c: c.remediation_priority)
        return {
            "classified_threats": classified,
            "rag_context": rag_context,
            "agent_metrics": {**state.get("agent_metrics", {}), "classify": timer.metrics},
        }

    except Exception as e:
        print(f"[Classify] Classification failed, using fallback: {e}")
        classified = [
            _fallback_classify(t, i + 1) for i, t in enumerate(threats)
        ]
        return {"classified_threats": classified}
