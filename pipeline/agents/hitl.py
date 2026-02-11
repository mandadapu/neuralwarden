"""Human-in-the-loop review node for critical threats."""

from datetime import datetime

from langgraph.types import interrupt

from pipeline.state import PipelineState


def run_hitl_review(state: PipelineState) -> dict:
    """Pause for human review if critical threats exist.

    Uses LangGraph's interrupt() to pause the graph and surface
    critical threats to the human operator. The graph resumes
    when the human provides approve/reject decisions via Command(resume=...).
    """
    classified = state.get("classified_threats", [])
    critical_threats = [ct for ct in classified if ct.risk == "critical"]

    if not critical_threats:
        return {
            "hitl_required": False,
            "human_decisions": [],
            "pending_critical_threats": [],
        }

    # Prepare the interrupt payload for the human
    pending = []
    for ct in critical_threats:
        pending.append({
            "threat_id": ct.threat_id,
            "type": ct.type,
            "risk_score": ct.risk_score,
            "description": ct.description,
            "source_ip": ct.source_ip,
            "mitre_technique": ct.mitre_technique,
            "business_impact": ct.business_impact,
            "suggested_action": (
                f"Block {ct.source_ip}" if ct.source_ip else "Investigate immediately"
            ),
        })

    # This call raises GraphInterrupt on first execution.
    # On resume, it returns the human's decisions.
    human_response = interrupt({
        "message": f"CRITICAL: {len(critical_threats)} critical threats require human review",
        "pending_threats": pending,
        "instructions": "For each threat, provide: approve, reject, or escalate",
    })

    # Parse human decisions (returned via Command(resume=...))
    decisions = []
    if isinstance(human_response, list):
        for d in human_response:
            decisions.append({
                "threat_id": d.get("threat_id", ""),
                "decision": d.get("decision", "approve"),
                "reviewer": d.get("reviewer", "unknown"),
                "notes": d.get("notes", ""),
                "timestamp": datetime.now().isoformat(),
            })
    elif isinstance(human_response, dict):
        decisions.append({
            "threat_id": human_response.get("threat_id", "all"),
            "decision": human_response.get("decision", "approve"),
            "reviewer": human_response.get("reviewer", "unknown"),
            "notes": human_response.get("notes", ""),
            "timestamp": datetime.now().isoformat(),
        })

    # Filter out rejected threats from classified list
    rejected_ids = {d["threat_id"] for d in decisions if d["decision"] == "reject"}
    if rejected_ids:
        filtered_threats = [ct for ct in classified if ct.threat_id not in rejected_ids]
    else:
        filtered_threats = classified

    return {
        "classified_threats": filtered_threats,
        "hitl_required": True,
        "human_decisions": decisions,
        "pending_critical_threats": critical_threats,
    }
