"""Detect Agent — Sonnet 4.5: Finds threats using rules + AI detection."""

import json

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.log_entry import LogEntry
from models.threat import Threat
from pipeline.state import PipelineState
from rules.detection import run_all_rules

MODEL = "claude-sonnet-4-5-20250929"

SYSTEM_PROMPT = """You are a cybersecurity threat detection analyst. Given parsed security log entries and any threats already found by rule-based detection, identify ADDITIONAL threats that rules might miss.

Focus on:
- Low-and-slow attacks spread across many entries
- Living-off-the-land techniques using legitimate tools
- Correlated events that individually seem benign but together indicate an attack
- Reconnaissance patterns
- Command-and-control communication patterns

For each NEW threat you find (not already covered by rule-based detections), respond with a JSON array of objects:
[{
  "threat_id": "AI-<TYPE>-<NUMBER>",
  "type": "brute_force|port_scan|privilege_escalation|data_exfiltration|lateral_movement|reconnaissance|c2_communication|suspicious_activity",
  "confidence": 0.0-1.0,
  "source_log_indices": [0, 1, 2],
  "description": "Human-readable description",
  "source_ip": "if applicable"
}]

If you find NO additional threats beyond what rules detected, respond with an empty JSON array: []

IMPORTANT: Only output the JSON array, nothing else."""


def _format_logs_for_prompt(logs: list[LogEntry]) -> str:
    entries = []
    for log in logs:
        if not log.is_valid:
            continue
        entries.append(
            f"[{log.index}] {log.timestamp} | {log.source} | {log.event_type} | "
            f"src={log.source_ip} dst={log.dest_ip} user={log.user} | {log.details}"
        )
    return "\n".join(entries)


def _format_rule_threats(threats: list[Threat]) -> str:
    if not threats:
        return "No rule-based threats detected."
    lines = []
    for t in threats:
        lines.append(f"- {t.threat_id}: {t.type} (conf={t.confidence:.2f}) - {t.description}")
    return "\n".join(lines)


def run_detect(state: PipelineState) -> dict:
    """Run two-layer threat detection: rules first, then AI for novel threats."""
    parsed_logs = state.get("parsed_logs", [])
    valid_logs = [log for log in parsed_logs if log.is_valid]

    if not valid_logs:
        return {
            "threats": [],
            "detection_stats": {
                "rules_matched": 0,
                "ai_detections": 0,
                "total_threats": 0,
            },
        }

    # Layer 1: Rule-based detection (free, instant)
    rule_threats = run_all_rules(valid_logs)

    # Layer 2: AI-powered detection for novel threats
    ai_threats: list[Threat] = []
    try:
        llm = ChatAnthropic(
            model=MODEL,
            temperature=0.2,
            max_tokens=4096,
        )

        log_text = _format_logs_for_prompt(valid_logs)
        rule_text = _format_rule_threats(rule_threats)

        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Analyze these {len(valid_logs)} parsed log entries for threats.\n\n"
                    f"## Parsed Logs\n{log_text}\n\n"
                    f"## Already Detected by Rules\n{rule_text}\n\n"
                    "Find any ADDITIONAL threats that rules missed."
                )
            ),
        ])

        content = response.content
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        ai_results = json.loads(content.strip())

        for entry in ai_results:
            ai_threats.append(
                Threat(
                    threat_id=entry.get("threat_id", "AI-UNKNOWN-001"),
                    type=entry.get("type", "suspicious_activity"),
                    confidence=float(entry.get("confidence", 0.5)),
                    source_log_indices=entry.get("source_log_indices", []),
                    method="ai_detected",
                    description=entry.get("description", "AI-detected anomaly"),
                    source_ip=entry.get("source_ip", ""),
                )
            )
    except Exception as e:
        # Graceful degradation: rule-based results are still valid
        print(f"[Detect] AI detection failed, using rules only: {e}")

    all_threats = rule_threats + ai_threats
    return {
        "threats": all_threats,
        "detection_stats": {
            "rules_matched": len(rule_threats),
            "ai_detections": len(ai_threats),
            "total_threats": len(all_threats),
        },
    }
