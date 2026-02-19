"""Google Cloud Logging integration — fetch, format, and pre-parse log entries."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone, timedelta

from models.log_entry import LogEntry

try:
    from google.cloud import logging as cloud_logging

    _GCP_AVAILABLE = True
except ImportError:
    _GCP_AVAILABLE = False


def _get_client(project_id: str):
    """Create a GCP logging client."""
    if not _GCP_AVAILABLE:
        raise ImportError(
            "google-cloud-logging is not installed. "
            "Install with: pip install 'neuralwarden[gcp]'"
        )
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path and not _running_on_gcp():
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS not set. "
            "Point it to a service account JSON key file."
        )
    return cloud_logging.Client(project=project_id)


def _running_on_gcp() -> bool:
    """Check if running on GCP (Cloud Run, GCE, etc.) via metadata server."""
    try:
        import urllib.request

        req = urllib.request.Request(
            "http://metadata.google.internal/computeMetadata/v1/project/project-id",
            headers={"Metadata-Flavor": "Google"},
        )
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        return False


def _format_http_request(http_req: dict) -> str:
    """Format an httpRequest object into a log-style string."""
    method = http_req.get("requestMethod", "?")
    url = http_req.get("requestUrl", "/")
    status = http_req.get("status", "?")
    parts = [f"{method} {url} status={status}"]
    if http_req.get("remoteIp"):
        parts.append(f"src={http_req['remoteIp']}")
    if http_req.get("responseSize"):
        parts.append(f"size={http_req['responseSize']}")
    if http_req.get("latency"):
        parts.append(f"latency={http_req['latency']}")
    if http_req.get("userAgent"):
        parts.append(f'ua="{http_req["userAgent"]}"')
    return " ".join(parts)


def _format_entry(entry) -> str:
    """Convert a GCP log entry into a syslog-style text line."""
    # Timestamp
    ts = ""
    if entry.timestamp:
        if isinstance(entry.timestamp, datetime):
            ts = entry.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            ts = str(entry.timestamp)

    # Severity
    severity = entry.severity or "DEFAULT"

    # Resource label
    resource_label = ""
    if entry.resource:
        rtype = entry.resource.type or ""
        labels = getattr(entry.resource, "labels", {}) or {}
        name = labels.get("service_name") or labels.get("database_id") or ""
        resource_label = f"{rtype}/{name}" if name else rtype

    # Payload
    payload = ""
    http_req = getattr(entry, "http_request", None)
    if http_req and isinstance(http_req, dict):
        payload = _format_http_request(http_req)
    elif isinstance(entry.payload, dict):
        payload = entry.payload.get("message", "") or str(entry.payload)
    elif isinstance(entry.payload, str) and entry.payload:
        payload = entry.payload
    else:
        # Try textPayload attribute
        text = getattr(entry, "text_payload", None)
        if text:
            payload = text

    if not payload and not ts:
        return ""

    parts = [p for p in [ts, severity, resource_label + ":", payload] if p]
    return " ".join(parts)


def fetch_logs(
    project_id: str,
    log_filter: str = "",
    max_entries: int = 500,
    hours_back: int = 24,
) -> list[str]:
    """Fetch logs from GCP Cloud Logging and return formatted text lines."""
    max_entries = min(max(max_entries, 10), 2000)
    hours_back = min(max(hours_back, 1), 168)

    client = _get_client(project_id)

    # Build time-bounded filter
    since = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    time_filter = f'timestamp >= "{since.strftime("%Y-%m-%dT%H:%M:%SZ")}"'
    full_filter = time_filter
    if log_filter:
        full_filter = f"{time_filter} AND ({log_filter})"

    entries = client.list_entries(
        filter_=full_filter,
        order_by="timestamp desc",
        page_size=max_entries,
    )

    lines = []
    for entry in entries:
        if len(lines) >= max_entries:
            break
        line = _format_entry(entry)
        if line:
            lines.append(line)

    return lines


# ── Deterministic parser (no LLM) ──

_LINE_RE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+"
    r"(?P<severity>\w+)\s+"
    r"(?P<resource>[^:]+):\s*"
    r"(?P<payload>.+)$"
)

_HTTP_RE = re.compile(
    r"^(?P<method>GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+"
    r"(?P<url>\S+)\s+"
    r"status=(?P<status>\d+)"
    r"(?:\s+src=(?P<src>[^\s]+))?"
)


def _classify_event(severity: str, payload: str, http_match: re.Match | None) -> str:
    """Classify event type from severity and payload content."""
    if http_match:
        status = int(http_match.group("status"))
        url = http_match.group("url").lower()
        if status >= 500:
            return "server_error"
        if status == 401 or status == 403:
            return "failed_auth"
        if status == 404 and any(p in url for p in ["/wp-admin", "/wp-login", "/.git", "/.env"]):
            return "recon_probe"
        if status >= 400:
            return "http_client_error"
        return "http_request"
    sev = severity.upper()
    if sev in ("ERROR", "CRITICAL", "ALERT", "EMERGENCY"):
        return "error"
    if sev == "WARNING":
        return "warning"
    return "info"


def deterministic_parse(lines: list[str]) -> list[LogEntry]:
    """Parse GCP-formatted log lines into LogEntry objects without LLM.

    Expects lines formatted by _format_entry(), e.g.:
    2026-02-18T19:31:35Z WARNING cloud_run_revision/archcelerate: GET /wp-admin status=404 src=1.2.3.4
    """
    entries: list[LogEntry] = []
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        m = _LINE_RE.match(line)
        if not m:
            entries.append(LogEntry(
                index=i, raw_text=line, is_valid=True,
                event_type="unknown", details=line,
            ))
            continue

        timestamp = m.group("timestamp")
        severity = m.group("severity")
        resource = m.group("resource").strip()
        payload = m.group("payload").strip()

        # Extract source from resource (e.g. "cloud_run_revision/archcelerate" → "cloud_run_revision")
        source = resource.split("/")[0] if "/" in resource else resource

        # Try to parse HTTP request payload
        http_m = _HTTP_RE.match(payload)
        source_ip = ""
        details = payload
        if http_m:
            source_ip = http_m.group("src") or ""
            details = payload

        event_type = _classify_event(severity, payload, http_m)

        entries.append(LogEntry(
            index=i,
            timestamp=timestamp,
            source=source,
            event_type=event_type,
            source_ip=source_ip,
            dest_ip="",
            user="",
            details=details,
            raw_text=line,
            is_valid=True,
        ))

    return entries
