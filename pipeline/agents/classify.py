"""Classify Agent — Sonnet 4.5: Risk-scores threats with MITRE ATT&CK mappings."""

import json
import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.threat import ClassifiedThreat, Threat
from pipeline.metrics import AgentTimer
from pipeline.security import extract_json, validate_classification_output, wrap_user_data
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

CORRELATION_ADDENDUM = """

## CORRELATION CONTEXT — ACTIVE EXPLOITS
The following vulnerabilities have been matched with active log evidence.
These represent ACTIVE EXPLOITS, not theoretical risks.

{evidence_json}

### SEVERITY ESCALATION RULES
- If a finding appears in the correlation context above, FORCE ESCALATE its severity to CRITICAL.
- For correlated findings, include an immediate remediation gcloud command in business_impact.
- Map correlated activity to the specific MITRE ATT&CK Tactic from the evidence.
- Set remediation_priority to 1 for ALL correlated findings.

### OUTPUT REQUIREMENTS FOR CORRELATED FINDINGS
For each correlated finding you MUST include:
- In business_impact: explain WHY the vulnerability and log behavior together indicate active exploitation
- In mitre_technique/mitre_tactic: use the values from correlation evidence
- In affected_systems: include the asset name from correlation evidence
"""


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

    # Format threats compactly — only fields the LLM needs for classification
    threat_data = []
    rag_context: dict[str, str] = {}
    for t in threats:
        entry: dict = {
            "id": t.threat_id,
            "type": t.type,
            "desc": t.description,
        }
        if t.source_ip:
            entry["src"] = t.source_ip
        intel = format_threat_intel_context(t.description, t.type, t.source_ip)
        if intel:
            entry["intel"] = intel
            rag_context[t.threat_id] = intel
        threat_data.append(entry)

    try:
        llm = ChatAnthropic(
            model=MODEL,
            temperature=0.1,
            max_tokens=2048,
            timeout=120,  # 2 min hard timeout to prevent indefinite hangs
        )

        # Build the human message
        base_content = f"Classify these {len(threats)} detected threats:\n\n{json.dumps(threat_data, indent=2)}"

        # Enrich with correlation evidence if available
        correlated_evidence = state.get("correlated_evidence", [])
        if correlated_evidence:
            base_content += CORRELATION_ADDENDUM.format(
                evidence_json=wrap_user_data(
                    json.dumps(correlated_evidence, indent=2),
                    "correlation_evidence",
                )
            )

        with AgentTimer("classify", MODEL) as timer:
            response = llm.invoke([
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=base_content),
            ])
            timer.record_usage(response)

        content = extract_json(response.content)
        classifications = json.loads(content)
        classifications = validate_classification_output(classifications)

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
        logging.getLogger(__name__).error("Classification failed [%s]: %s", type(e).__name__, e)
        classified = [
            _fallback_classify(t, i + 1) for i, t in enumerate(threats)
        ]
        return {"classified_threats": classified}
