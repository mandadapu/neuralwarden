"""Report Agent — Opus 4.6: Generates incident reports and action plans."""

import json
from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.incident_report import ActionStep, IncidentReport
from models.threat import ClassifiedThreat
from pipeline.state import PipelineState

MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """You are a senior incident response analyst writing a formal incident report. Your audience is DUAL:
1. Executive leadership who need a 2-3 sentence summary and key actions
2. Technical incident responders who need specific, actionable steps

Generate a JSON report with these exact fields:
{
  "summary": "2-3 sentence executive summary of the incident",
  "timeline": "Reconstructed attack timeline narrative",
  "action_plan": [
    {"step": 1, "action": "Specific action to take", "urgency": "immediate|1hr|24hr|1week", "owner": "Security Team|IT Ops|Management"}
  ],
  "recommendations": ["Strategic recommendation 1", "Strategic recommendation 2"],
  "ioc_summary": ["IP: 203.0.113.50", "Technique: SSH brute force"],
  "mitre_techniques": ["T1110", "T1548"]
}

Guidelines:
- Summary must be concrete, not vague (include IPs, counts, impact)
- Action plan must be ORDERED by urgency (immediate first)
- Each action must be specific enough to execute without further research
- Recommendations should be strategic (prevent recurrence, not just fix current incident)
- IOC summary should list all indicators of compromise found

IMPORTANT: Only output the JSON object, nothing else."""


def run_report(state: PipelineState) -> dict:
    """Generate a complete incident report from classified threats."""
    classified_threats = state.get("classified_threats", [])
    detection_stats = state.get("detection_stats", {})
    parsed_logs = state.get("parsed_logs", [])

    if not classified_threats:
        return {
            "report": IncidentReport(
                summary="No threats detected in the analyzed logs.",
                threat_count=0,
            )
        }

    # Build context for the report
    threat_summary = []
    for ct in classified_threats:
        threat_summary.append({
            "threat_id": ct.threat_id,
            "type": ct.type,
            "risk": ct.risk,
            "risk_score": ct.risk_score,
            "confidence": ct.confidence,
            "mitre_technique": ct.mitre_technique,
            "mitre_tactic": ct.mitre_tactic,
            "description": ct.description,
            "source_ip": ct.source_ip,
            "business_impact": ct.business_impact,
            "affected_systems": ct.affected_systems,
        })

    # Include relevant log samples for timeline reconstruction
    log_samples = []
    for log in parsed_logs[:50]:  # Cap at 50 for context window
        if log.is_valid:
            log_samples.append(f"[{log.index}] {log.timestamp} {log.source}: {log.raw_text[:200]}")

    try:
        llm = ChatAnthropic(
            model=MODEL,
            temperature=0.3,
            max_tokens=4096,
        )

        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Generate an incident report for this security event.\n\n"
                    f"## Detection Statistics\n"
                    f"- Total logs analyzed: {state.get('total_count', 0)}\n"
                    f"- Invalid entries: {state.get('invalid_count', 0)}\n"
                    f"- Rule-based detections: {detection_stats.get('rules_matched', 0)}\n"
                    f"- AI detections: {detection_stats.get('ai_detections', 0)}\n"
                    f"- Total threats: {detection_stats.get('total_threats', 0)}\n\n"
                    f"## Classified Threats\n{json.dumps(threat_summary, indent=2)}\n\n"
                    f"## Log Timeline (samples)\n" + "\n".join(log_samples)
                )
            ),
        ])

        content = response.content
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        report_data = json.loads(content.strip())

        # Count by severity
        risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for ct in classified_threats:
            if ct.risk in risk_counts:
                risk_counts[ct.risk] += 1

        report = IncidentReport(
            summary=report_data.get("summary", "Report generation completed."),
            threat_count=len(classified_threats),
            critical_count=risk_counts["critical"],
            high_count=risk_counts["high"],
            medium_count=risk_counts["medium"],
            low_count=risk_counts["low"],
            timeline=report_data.get("timeline", ""),
            action_plan=[
                ActionStep(
                    step=a.get("step", i + 1),
                    action=a.get("action", ""),
                    urgency=a.get("urgency", "24hr"),
                    owner=a.get("owner", "Security Team"),
                )
                for i, a in enumerate(report_data.get("action_plan", []))
            ],
            recommendations=report_data.get("recommendations", []),
            ioc_summary=report_data.get("ioc_summary", []),
            mitre_techniques=report_data.get("mitre_techniques", []),
            generated_at=datetime.now(),
        )
        return {"report": report}

    except Exception as e:
        print(f"[Report] Report generation failed, using template: {e}")
        risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for ct in classified_threats:
            if ct.risk in risk_counts:
                risk_counts[ct.risk] += 1

        # Fallback: structured template with raw data
        return {
            "report": IncidentReport(
                summary=f"Automated analysis found {len(classified_threats)} threats. Manual review required — report generation failed: {e}",
                threat_count=len(classified_threats),
                critical_count=risk_counts["critical"],
                high_count=risk_counts["high"],
                medium_count=risk_counts["medium"],
                low_count=risk_counts["low"],
                action_plan=[
                    ActionStep(
                        step=i + 1,
                        action=f"Review {ct.risk.upper()} threat: {ct.description}",
                        urgency="immediate" if ct.risk == "critical" else "1hr",
                    )
                    for i, ct in enumerate(classified_threats)
                ],
                ioc_summary=[ct.source_ip for ct in classified_threats if ct.source_ip],
            )
        }
