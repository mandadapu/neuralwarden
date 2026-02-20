"""Report Agent — generates incident reports and action plans."""

import json
import logging
from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.incident_report import ActionStep, IncidentReport
from models.threat import ClassifiedThreat
from pipeline.metrics import AgentTimer
from pipeline.security import extract_json, sanitize_log_line, validate_report_output, wrap_user_data
from pipeline.state import PipelineState

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"

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

    # Compact threat summary — only fields needed for report generation
    threat_summary = []
    for ct in classified_threats:
        entry: dict = {
            "id": ct.threat_id,
            "type": ct.type,
            "risk": ct.risk,
            "score": ct.risk_score,
            "desc": ct.description,
        }
        if ct.source_ip:
            entry["src"] = ct.source_ip
        if ct.mitre_technique:
            entry["mitre"] = ct.mitre_technique
        threat_summary.append(entry)

    # Include only 20 log samples for timeline (reduced from 50)
    log_samples = []
    for log in parsed_logs[:20]:
        if log.is_valid:
            safe_text = sanitize_log_line(log.raw_text[:150])
            log_samples.append(f"[{log.index}] {log.timestamp} {log.source}: {safe_text}")

    try:
        llm = ChatAnthropic(
            model=MODEL,
            temperature=0.3,
            max_tokens=4096,
        )

        with AgentTimer("report", MODEL) as timer:
            log_timeline = "\n".join(log_samples)

            # Build Active Incidents section if correlated evidence exists
            correlated_evidence = state.get("correlated_evidence", [])
            active_incidents_section = ""
            if correlated_evidence:
                active_incidents_section = (
                    "\n\n## Active Incidents (Correlated — HIGHEST PRIORITY)\n"
                    "These findings have matching live log evidence of active exploitation.\n"
                    "Lead your executive summary with these active incidents.\n"
                    "For each, include the specific remediation gcloud command.\n\n"
                    + json.dumps(correlated_evidence, indent=2)
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
                        f"## Log Timeline (samples)\n{wrap_user_data(log_timeline, 'log_samples')}"
                        + active_incidents_section
                    )
                ),
            ])
            timer.record_usage(response)

        raw_content = response.content or ""
        if not raw_content.strip():
            stop_reason = getattr(response, "response_metadata", {}).get("stop_reason", "unknown")
            logger.warning("Report LLM returned empty content (stop_reason=%s), retrying...", stop_reason)
            response = llm.invoke([
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=f"Generate a JSON incident report for {len(classified_threats)} security threats. Return ONLY the JSON object."),
            ])
            timer.record_usage(response)
            raw_content = response.content or ""

        content = extract_json(raw_content)
        report_data = json.loads(content)
        report_data = validate_report_output(report_data)

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
        return {
            "report": report,
            "agent_metrics": {**state.get("agent_metrics", {}), "report": timer.metrics},
        }

    except Exception as e:
        logger.warning("Report generation failed, using template: %s", e)
        risk_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for ct in classified_threats:
            if ct.risk in risk_counts:
                risk_counts[ct.risk] += 1

        # Fallback: structured template with raw data
        critical_count = risk_counts["critical"]
        high_count = risk_counts["high"]
        severity_note = ""
        if critical_count:
            severity_note = f" including {critical_count} critical"
        elif high_count:
            severity_note = f" including {high_count} high-severity"
        return {
            "report": IncidentReport(
                summary=f"Automated analysis found {len(classified_threats)} threats{severity_note}. Review the action plan below for recommended remediation steps.",
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
