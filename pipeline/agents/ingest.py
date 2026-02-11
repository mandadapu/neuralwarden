"""Ingest Agent — Haiku 4.5: Parses raw security logs into structured LogEntry objects."""

import json

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from models.log_entry import LogEntry
from pipeline.state import PipelineState

MODEL = "claude-haiku-4-5-20251001"

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


def run_ingest(state: PipelineState) -> dict:
    """Parse raw log lines into structured LogEntry objects."""
    raw_logs = state.get("raw_logs", [])
    if not raw_logs:
        return {
            "parsed_logs": [],
            "invalid_count": 0,
            "total_count": 0,
        }

    # Batch logs into a single prompt for efficiency
    numbered_logs = "\n".join(
        f"[{i}] {line}" for i, line in enumerate(raw_logs)
    )

    llm = ChatAnthropic(
        model=MODEL,
        temperature=0,
        max_tokens=4096,
    )

    try:
        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"Parse these {len(raw_logs)} log lines:\n\n{numbered_logs}"),
        ])

        content = response.content
        # Extract JSON from response (handle markdown code blocks)
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed_data = json.loads(content.strip())

        parsed_logs: list[LogEntry] = []
        for i, entry in enumerate(parsed_data):
            try:
                log = LogEntry(
                    index=i,
                    timestamp=entry.get("timestamp", ""),
                    source=entry.get("source", ""),
                    event_type=entry.get("event_type", "unknown"),
                    source_ip=entry.get("source_ip", ""),
                    dest_ip=entry.get("dest_ip", ""),
                    user=entry.get("user", ""),
                    details=entry.get("details", ""),
                    raw_text=raw_logs[i] if i < len(raw_logs) else "",
                    is_valid=True,
                )
                parsed_logs.append(log)
            except Exception as e:
                parsed_logs.append(
                    LogEntry(
                        index=i,
                        raw_text=raw_logs[i] if i < len(raw_logs) else "",
                        is_valid=False,
                        parse_error=str(e),
                    )
                )

        # If LLM returned fewer entries than raw logs, mark remaining as unparsed
        for i in range(len(parsed_logs), len(raw_logs)):
            parsed_logs.append(
                LogEntry(
                    index=i,
                    raw_text=raw_logs[i],
                    is_valid=False,
                    parse_error="Not included in LLM response",
                )
            )

        invalid_count = sum(1 for log in parsed_logs if not log.is_valid)
        return {
            "parsed_logs": parsed_logs,
            "invalid_count": invalid_count,
            "total_count": len(raw_logs),
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
