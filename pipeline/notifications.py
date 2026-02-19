"""Slack notification support for critical threat alerts."""

from __future__ import annotations

import json
import os
import urllib.request

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")


def send_slack_notification(message: str, blocks: list[dict] | None = None) -> bool:
    """Send a notification to Slack via incoming webhook. Returns True on success."""
    if not SLACK_WEBHOOK_URL:
        return False

    payload: dict = {"text": message}
    if blocks:
        payload["blocks"] = blocks

    try:
        req = urllib.request.Request(
            SLACK_WEBHOOK_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False


def notify_critical_threats(threats: list[dict], report_summary: str = "") -> bool:
    """Format and send a Slack alert for critical threats."""
    if not threats:
        return False

    threat_lines = []
    for t in threats:
        threat_lines.append(
            f":rotating_light: *{t.get('type', 'Unknown').replace('_', ' ').title()}* — "
            f"Score: {t.get('risk_score', 0):.1f}/10 — "
            f"IP: `{t.get('source_ip', 'N/A')}` — "
            f"{t.get('description', '')[:100]}"
        )

    message = (
        f":shield: *NeuralWarden Alert: {len(threats)} Critical Threat(s) Detected*\n\n"
        + "\n".join(threat_lines)
    )
    if report_summary:
        message += f"\n\n> {report_summary[:200]}"

    return send_slack_notification(message)
