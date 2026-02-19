"""Log Analysis Agent — queries Cloud Logging for private assets."""

from __future__ import annotations

import logging
import os
import tempfile

from pipeline.cloud_scan_state import ScanAgentState

logger = logging.getLogger(__name__)


def _fetch_asset_logs(
    project_id: str,
    asset_name: str,
    asset_type: str,
    credentials_json: str,
) -> list[str]:
    """Fetch Cloud Logging entries for a specific resource."""
    try:
        from api.gcp_logging import fetch_logs
    except ImportError:
        return []

    # Build resource-specific filter
    if asset_type == "compute_instance":
        resource_filter = f'resource.type="gce_instance" AND resource.labels.instance_id="{asset_name}"'
    elif asset_type == "cloud_sql":
        resource_filter = f'resource.type="cloudsql_database" AND resource.labels.database_id="{asset_name}"'
    elif asset_type == "gcs_bucket":
        resource_filter = f'resource.type="gcs_bucket" AND resource.labels.bucket_name="{asset_name}"'
    else:
        resource_filter = f'resource.labels.service_name="{asset_name}"'

    log_filter = f'({resource_filter}) AND severity>=WARNING'

    # Temporarily set credentials
    creds_path = None
    old_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_json:
        fd, creds_path = tempfile.mkstemp(suffix=".json", prefix="gcp_creds_")
        with os.fdopen(fd, "w") as f:
            f.write(credentials_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

    try:
        return fetch_logs(project_id, log_filter=log_filter, max_entries=200, hours_back=24)
    except Exception as exc:
        logger.warning("Failed to fetch logs for %s: %s", asset_name, exc)
        return []
    finally:
        if old_creds:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = old_creds
        elif creds_path and "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
        if creds_path:
            try:
                os.unlink(creds_path)
            except OSError:
                pass


def log_analyzer_node(state: ScanAgentState) -> dict:
    """Analyze a private asset by querying its Cloud Logging entries."""
    asset = state["current_asset"]
    project_id = state.get("project_id", "")
    creds = state.get("credentials_json", "")

    lines = _fetch_asset_logs(
        project_id=project_id,
        asset_name=asset["name"],
        asset_type=asset.get("asset_type", ""),
        credentials_json=creds,
    )

    # Generate log-based issues from the lines
    scan_issues = []
    if lines:
        error_count = sum(1 for l in lines if " ERROR " in l or " CRITICAL " in l)
        auth_count = sum(1 for l in lines if "status=401" in l or "status=403" in l)

        if error_count > 5:
            scan_issues.append({
                "rule_code": "log_001",
                "title": f"{error_count} errors on '{asset['name']}' in last 24h",
                "description": f"Resource '{asset['name']}' has {error_count} error-level log entries.",
                "severity": "medium",
                "location": f"Logs: {asset['name']}",
                "fix_time": "30 min",
            })
        if auth_count > 3:
            scan_issues.append({
                "rule_code": "log_002",
                "title": f"{auth_count} auth failures on '{asset['name']}'",
                "description": f"Multiple authentication failures detected on '{asset['name']}'.",
                "severity": "high",
                "location": f"Logs: {asset['name']}",
                "fix_time": "15 min",
            })

    return {
        "log_lines": lines,
        "scan_issues": scan_issues,
        "scanned_assets": [{"asset": asset["name"], "route": "log", "issues_found": len(scan_issues)}],
    }
