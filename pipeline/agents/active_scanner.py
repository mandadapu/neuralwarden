"""Active Scanner Agent — runs compliance checks on public-facing assets."""

from __future__ import annotations

from pipeline.cloud_scan_state import ScanAgentState


def _check_firewall_asset(asset: dict) -> list[dict]:
    """Run firewall compliance checks on a single asset."""
    metadata = asset.get("metadata", {})
    issues = []
    sources = metadata.get("source_ranges", [])
    if any(s in ("0.0.0.0/0", "::/0") for s in sources):
        direction = metadata.get("direction", "INGRESS")
        if direction == "INGRESS":
            issues.append({
                "rule_code": "gcp_002",
                "title": f"Firewall '{asset['name']}' allows unrestricted ingress",
                "description": f"Firewall rule '{asset['name']}' allows traffic from 0.0.0.0/0. Restrict source ranges.",
                "severity": "high",
                "location": f"Firewall: {asset['name']}",
                "fix_time": "10 min",
            })
    return issues


def _check_bucket_public(asset: dict, project_id: str, credentials_json: str) -> list[dict]:
    """Check if a GCS bucket is publicly accessible via IAM."""
    try:
        from api.gcp_scanner import _make_credentials
        from google.cloud.storage import Client as StorageClient
        creds = _make_credentials(credentials_json)
        client = StorageClient(project=project_id, credentials=creds)
        bucket = client.get_bucket(asset["name"])
        policy = bucket.get_iam_policy()
        for binding in policy.bindings:
            members = set(binding.get("members", []))
            if members & {"allUsers", "allAuthenticatedUsers"}:
                return [{
                    "rule_code": "gcp_004",
                    "title": f"GCS bucket '{asset['name']}' is publicly accessible",
                    "description": f"Bucket has public IAM binding. Remove allUsers/allAuthenticatedUsers.",
                    "severity": "critical",
                    "location": f"GCS: {asset['name']}",
                    "fix_time": "5 min",
                }]
    except Exception:
        pass
    return []


def _check_compute_asset(asset: dict) -> list[dict]:
    """Check compute instance for default service account."""
    metadata = asset.get("metadata", {})
    issues = []
    for sa in metadata.get("serviceAccounts", []):
        if "compute@developer.gserviceaccount.com" in sa.get("email", ""):
            issues.append({
                "rule_code": "gcp_006",
                "title": f"Instance '{asset['name']}' uses default service account",
                "description": "Use a dedicated service account with least-privilege permissions.",
                "severity": "medium",
                "location": f"VM: {asset['name']}",
                "fix_time": "15 min",
            })
    return issues


def active_scanner_node(state: ScanAgentState) -> dict:
    """Scan a single public asset and return issues found."""
    asset = state["current_asset"]
    asset_type = asset.get("asset_type", "")
    project_id = state.get("project_id", "")
    creds = state.get("credentials_json", "")

    issues = []
    if asset_type == "firewall_rule":
        issues = _check_firewall_asset(asset)
    elif asset_type == "gcs_bucket":
        issues = _check_bucket_public(asset, project_id, creds)
    elif asset_type in ("compute_instance", "vm"):
        issues = _check_compute_asset(asset)

    return {
        "scan_issues": issues,
        "scanned_assets": [{"asset": asset["name"], "route": "active", "issues_found": len(issues)}],
    }
