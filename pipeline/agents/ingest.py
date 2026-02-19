"""Ingest Agent — Haiku 4.5: Parses raw security logs into structured LogEntry objects."""

import json

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.log_entry import LogEntry
from pipeline.metrics import AgentTimer
from pipeline.security import extract_json, mask_pii_logs, sanitize_logs, wrap_user_data
from pipeline.state import PipelineState

MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 30  # Max logs per LLM call to stay within token limits

SYSTEM_PROMPT = """You are a security log parser. Your job is to parse raw security log lines into structured JSON.

For each log line, extract:
- timestamp: the date/time string as-is
- source: the service or daemon (e.g., sshd, sudo, scp, firewall)
- event_type: one of: failed_auth, successful_auth, file_transfer, data_transfer, command_exec, connection, privilege_escalation, system, unknown
- source_ip: source IP address if present, empty string if not
- dest_ip: destination IP address if present, empty string if not
- user: username if mentioned, empty string if not
- details: any additional relevant details

Respond ONLY with a JSON array of objects. Each object must have these exact fields:
{"timestamp": "", "source": "", "event_type": "", "source_ip": "", "dest_ip": "", "user": "", "details": ""}

If a line cannot be parsed, still include it with event_type "unknown" and fill in whatever fields you can."""


def _parse_batch(
    llm: ChatAnthropic,
    batch_logs: list[str],
    raw_logs: list[str],
    offset: int,
) -> list[LogEntry]:
    """Parse a single batch of logs via LLM, return LogEntry list."""
    numbered = "\n".join(f"[{i}] {line}" for i, line in enumerate(batch_logs))

    response = llm.invoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(
            content=f"Parse these {len(batch_logs)} log lines:\n\n{wrap_user_data(numbered)}"
        ),
    ])

    content = extract_json(response.content)
    parsed_data = json.loads(content)

    entries: list[LogEntry] = []
    for i, entry in enumerate(parsed_data):
        global_idx = offset + i
        try:
            entries.append(
                LogEntry(
                    index=global_idx,
                    timestamp=entry.get("timestamp", ""),
                    source=entry.get("source", ""),
                    event_type=entry.get("event_type", "unknown"),
                    source_ip=entry.get("source_ip", ""),
                    dest_ip=entry.get("dest_ip", ""),
                    user=entry.get("user", ""),
                    details=entry.get("details", ""),
                    raw_text=raw_logs[global_idx] if global_idx < len(raw_logs) else "",
                    is_valid=True,
                )
            )
        except Exception as e:
            entries.append(
                LogEntry(
                    index=global_idx,
                    raw_text=raw_logs[global_idx] if global_idx < len(raw_logs) else "",
                    is_valid=False,
                    parse_error=str(e),
                )
            )

    # Mark any missing entries from this batch as unparsed
    for i in range(len(entries), len(batch_logs)):
        global_idx = offset + i
        entries.append(
            LogEntry(
                index=global_idx,
                raw_text=raw_logs[global_idx] if global_idx < len(raw_logs) else "",
                is_valid=False,
                parse_error="Not included in LLM response",
            )
        )

    return entries, response


def run_ingest(state: PipelineState) -> dict:
    """Parse raw log lines into structured LogEntry objects."""
    raw_logs = state.get("raw_logs", [])
    if not raw_logs:
        return {
            "parsed_logs": [],
            "invalid_count": 0,
            "total_count": 0,
        }

    # Sanitize
    safe_logs = sanitize_logs(raw_logs)
    safe_logs = mask_pii_logs(safe_logs)

    llm = ChatAnthropic(
        model=MODEL,
        temperature=0,
        max_tokens=8192,
    )

    try:
        all_parsed: list[LogEntry] = []

        with AgentTimer("ingest", MODEL) as timer:
            # Process in batches to avoid token truncation
            for start in range(0, len(safe_logs), BATCH_SIZE):
                batch = safe_logs[start : start + BATCH_SIZE]
                entries, response = _parse_batch(llm, batch, raw_logs, start)
                all_parsed.extend(entries)
                timer.record_usage(response)

        invalid_count = sum(1 for log in all_parsed if not log.is_valid)
        return {
            "parsed_logs": all_parsed,
            "invalid_count": invalid_count,
            "total_count": len(raw_logs),
            "agent_metrics": {**state.get("agent_metrics", {}), "ingest": timer.metrics},
        }

    except Exception as e:
        # Fallback: mark all as invalid but don't crash pipeline
        fallback_logs = [
            LogEntry(
                index=i,
                raw_text=line,
                is_valid=False,
                parse_error=f"Ingest agent failed: {e}",
            )
            for i, line in enumerate(raw_logs)
        ]
        return {
            "parsed_logs": fallback_logs,
            "invalid_count": len(raw_logs),
            "total_count": len(raw_logs),
        }
