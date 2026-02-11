"""Validator Agent — Sonnet 4.5: Shadow-checks a sample of 'clean' logs for missed threats."""

import json
import random

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.log_entry import LogEntry
from models.threat import Threat
from pipeline.metrics import AgentTimer
from pipeline.state import PipelineState

MODEL = "claude-sonnet-4-5-20250929"

SYSTEM_PROMPT = """You are a cybersecurity validator performing a quality assurance check on a threat detection pipeline.

You are reviewing a RANDOM SAMPLE of log entries that the primary detection system marked as "clean" (no threats). Your job is to find any threats the primary system MISSED.

Analyze each log entry carefully for:
- Subtle attack patterns that rule-based systems miss
- Low-and-slow attacks
- Living-off-the-land techniques
- Encoded or obfuscated commands
- Anomalous but individually benign-looking events that together indicate compromise

For each missed threat you find, respond with a JSON array:
[{
  "threat_id": "VAL-<TYPE>-<NUMBER>",
  "type": "brute_force|port_scan|privilege_escalation|data_exfiltration|lateral_movement|reconnaissance|c2_communication|suspicious_activity",
  "confidence": 0.0-1.0,
  "source_log_indices": [original indices],
  "description": "Why this was missed and why it's a threat",
  "source_ip": "if applicable",
  "reason_missed": "Brief explanation of why the primary system missed this"
}]

If all logs in the sample truly appear clean, respond with an empty JSON array: []

IMPORTANT: Only output the JSON array, nothing else."""


def _select_clean_sample(
    state: PipelineState,
    sample_fraction: float = 0.05,
    min_sample: int = 1,
    max_sample: int = 50,
) -> list[LogEntry]:
    """Select a random sample of log entries NOT associated with any detected threat."""
    parsed_logs = state.get("parsed_logs", [])
    threats = state.get("threats", [])

    # Gather all log indices that are part of detected threats
    threat_indices: set[int] = set()
    for t in threats:
        threat_indices.update(t.source_log_indices)

    # Clean logs = valid logs not in any threat
    clean_logs = [
        log for log in parsed_logs if log.is_valid and log.index not in threat_indices
    ]

    if not clean_logs:
        return []

    sample_size = max(min_sample, int(len(clean_logs) * sample_fraction))
    sample_size = min(sample_size, max_sample, len(clean_logs))

    return random.sample(clean_logs, sample_size)


def run_validate(state: PipelineState) -> dict:
    """Validate a sample of 'clean' logs for missed threats."""
    sample = _select_clean_sample(state)

    if not sample:
        return {
            "validator_findings": [],
            "validator_sample_size": 0,
            "validator_missed_count": 0,
        }

    # Format sample logs for the prompt
    log_text_lines = []
    for log in sample:
        log_text_lines.append(
            f"[{log.index}] {log.timestamp} | {log.source} | {log.event_type} | "
            f"src={log.source_ip} dst={log.dest_ip} user={log.user} | {log.details}"
        )
    log_text = "\n".join(log_text_lines)

    threats = state.get("threats", [])
    detected_summary = f"{len(threats)} threats already detected by primary pipeline."

    try:
        llm = ChatAnthropic(model=MODEL, temperature=0.2, max_tokens=4096)

        with AgentTimer("validate", MODEL) as timer:
            response = llm.invoke([
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Review this sample of {len(sample)} log entries that were marked as clean "
                        f"(no threats detected). {detected_summary}\n\n"
                        f"## Clean Log Sample\n{log_text}\n\n"
                        f"Are there any threats the primary system missed?"
                    )
                ),
            ])
            timer.record_usage(response)

        content = response.content
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        findings_data = json.loads(content.strip())

        new_threats = []
        validator_findings = []
        for entry in findings_data:
            threat = Threat(
                threat_id=entry.get("threat_id", "VAL-UNKNOWN-001"),
                type=entry.get("type", "suspicious_activity"),
                confidence=float(entry.get("confidence", 0.5)),
                source_log_indices=entry.get("source_log_indices", []),
                method="validator_detected",
                description=entry.get("description", "Validator-detected anomaly"),
                source_ip=entry.get("source_ip", ""),
            )
            new_threats.append(threat)
            validator_findings.append({
                "threat_id": threat.threat_id,
                "confidence": threat.confidence,
                "reason": entry.get("reason_missed", ""),
            })

        # Merge new threats into existing threat list
        existing_threats = list(state.get("threats", []))
        merged_threats = existing_threats + new_threats

        return {
            "threats": merged_threats,
            "validator_findings": validator_findings,
            "validator_sample_size": len(sample),
            "validator_missed_count": len(new_threats),
            "agent_metrics": {
                **state.get("agent_metrics", {}),
                "validate": timer.metrics,
            },
        }

    except Exception as e:
        print(f"[Validate] Validation failed, continuing without: {e}")
        return {
            "validator_findings": [],
            "validator_sample_size": len(sample),
            "validator_missed_count": 0,
        }
