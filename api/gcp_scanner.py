"""GCP Scanner — discover assets and run compliance checks.

GCP service APIs (compute, storage) are optional.  Try them if the
libraries are installed and the service account has permissions; always
fall back to Cloud Logging as the baseline data source.
"""

from __future__ import annotations

import importlib
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Library availability probing ────────────────────────────────────


def _try_import(module: str) -> bool:
    """Return True if *module* can be imported, False otherwise."""
    try:
        importlib.import_module(module)
        return True
    except Exception:
        return False


def probe_available_services() -> List[str]:
    """Return which GCP services can actually be scanned.

    Always includes ``cloud_logging``.  Conditionally includes
    ``compute``, ``firewall``, ``storage``, ``resource_manager`` if
    their client libraries are importable.
    """
    services: List[str] = ["cloud_logging"]

    if _try_import("google.cloud.compute_v1"):
        services.append("compute")
        services.append("firewall")

    if _try_import("google.cloud.storage"):
        services.append("storage")

    if _try_import("google.cloud.resourcemanager_v3"):
        services.append("resource_manager")

    return services


# ── Credential helpers ──────────────────────────────────────────────


def _make_credentials(credentials_json: str):
    """Create GCP credentials from a service-account JSON string."""
    from google.oauth2 import service_account

    info = json.loads(credentials_json)
    return service_account.Credentials.from_service_account_info(info)


def _temp_credentials_file(credentials_json: str) -> str:
    """Write credentials JSON to a temp file and return its path.

    The Cloud Logging client reads ``GOOGLE_APPLICATION_CREDENTIALS``
    from the environment, so we need a file on disk.
    """
    fd, path = tempfile.mkstemp(suffix=".json", prefix="gcp_creds_")
    try:
        os.write(fd, credentials_json.encode("utf-8"))
    finally:
        os.close(fd)
    return path


# ── Compliance check functions ──────────────────────────────────────


def _check_open_ssh(firewall_rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """gcp_002 — flag INGRESS firewall rules that allow 0.0.0.0/0 or ::/0 to port 22."""
    issues: List[Dict[str, Any]] = []
    open_ranges = {"0.0.0.0/0", "::/0"}

    for rule in firewall_rules:
        if rule.get("direction", "").upper() != "INGRESS":
            continue

        sources = set(rule.get("sourceRanges", []))
        if not sources & open_ranges:
            continue

        # Check if any allowed spec includes port 22
        for allowed in rule.get("allowed", []):
            ports = allowed.get("ports", [])
            proto = allowed.get("IPProtocol", "")
            if proto.lower() != "tcp":
                continue
            for port_spec in ports:
                if _port_matches_22(str(port_spec)):
                    issues.append({
                        "rule_code": "gcp_002",
                        "title": f"Firewall '{rule['name']}' allows unrestricted SSH",
                        "description": (
                            f"Firewall rule '{rule['name']}' permits SSH (port 22) "
                            f"from {', '.join(sources & open_ranges)}. "
                            "Restrict source ranges to trusted CIDRs."
                        ),
                        "severity": "high",
                        "location": f"Firewall: {rule['name']}",
                        "fix_time": "10 min",
                    })
                    break  # one issue per rule is enough

    return issues


def _port_matches_22(port_spec: str) -> bool:
    """Return True if a port spec like '22', '0-65535', or '20-25' covers port 22."""
    if port_spec == "22":
        return True
    if "-" in port_spec:
        try:
            lo, hi = port_spec.split("-", 1)
            return int(lo) <= 22 <= int(hi)
        except ValueError:
            return False
    return False


def _check_public_buckets(buckets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """gcp_004 — flag GCS buckets whose IAM policy grants allUsers or allAuthenticatedUsers."""
    issues: List[Dict[str, Any]] = []
    public_members = {"allUsers", "allAuthenticatedUsers"}

    for bucket in buckets:
        policy = bucket.get("iam_policy", {})
        for binding in policy.get("bindings", []):
            members = set(binding.get("members", []))
            if members & public_members:
                issues.append({
                    "rule_code": "gcp_004",
                    "title": f"Bucket '{bucket['name']}' is publicly accessible",
                    "description": (
                        f"GCS bucket '{bucket['name']}' grants "
                        f"{', '.join(members & public_members)} the role "
                        f"'{binding.get('role', 'unknown')}'. "
                        "Remove public access unless intentionally serving public content."
                    ),
                    "severity": "critical",
                    "location": f"Bucket: {bucket['name']}",
                    "fix_time": "5 min",
                })
                break  # one issue per bucket is enough

    return issues


def _check_default_sa(instances: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """gcp_006 — flag Compute Engine instances using the default service account."""
    issues: List[Dict[str, Any]] = []

    for instance in instances:
        for sa in instance.get("serviceAccounts", []):
            email = sa.get("email", "")
            if "compute@developer.gserviceaccount.com" in email:
                issues.append({
                    "rule_code": "gcp_006",
                    "title": f"Instance '{instance['name']}' uses default service account",
                    "description": (
                        f"Compute instance '{instance['name']}' is running with "
                        f"the default compute service account ({email}). "
                        "Create a dedicated service account with least-privilege permissions."
                    ),
                    "severity": "medium",
                    "location": f"Instance: {instance['name']}",
                    "fix_time": "15 min",
                })
                break  # one issue per instance

    return issues


# ── Service scanners ────────────────────────────────────────────────


def _scan_compute(
    project_id: str,
    credentials: Any,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Scan Compute Engine firewall rules and instances.

    Returns (assets, issues).
    """
    from google.cloud.compute_v1 import FirewallsClient, InstancesClient

    assets: List[Dict[str, Any]] = []
    issues: List[Dict[str, Any]] = []

    # ---- Firewall rules ----
    try:
        fw_client = FirewallsClient(credentials=credentials)
        firewall_rules_raw: List[Dict[str, Any]] = []
        for fw in fw_client.list(project=project_id):
            rule_dict = {
                "name": fw.name,
                "direction": fw.direction,
                "allowed": [
                    {
                        "IPProtocol": a.I_p_protocol,
                        "ports": list(a.ports),
                    }
                    for a in (fw.allowed or [])
                ],
                "sourceRanges": list(fw.source_ranges or []),
                "network": fw.network or "",
            }
            firewall_rules_raw.append(rule_dict)
            assets.append({
                "asset_type": "firewall_rule",
                "name": fw.name,
                "metadata_json": json.dumps(rule_dict),
            })

        issues.extend(_check_open_ssh(firewall_rules_raw))
    except Exception as exc:
        logger.warning("Compute firewall scan failed: %s", exc)

    # ---- Instances ----
    try:
        inst_client = InstancesClient(credentials=credentials)
        instances_raw: List[Dict[str, Any]] = []
        for zone_scope, instances_list in inst_client.aggregated_list(
            project=project_id
        ):
            for inst in (instances_list.instances or []):
                inst_dict = {
                    "name": inst.name,
                    "zone": inst.zone or "",
                    "status": inst.status or "",
                    "serviceAccounts": [
                        {"email": sa.email, "scopes": list(sa.scopes or [])}
                        for sa in (inst.service_accounts or [])
                    ],
                }
                instances_raw.append(inst_dict)
                assets.append({
                    "asset_type": "vm",
                    "name": inst.name,
                    "region": inst.zone or "",
                    "metadata_json": json.dumps(inst_dict),
                })

        issues.extend(_check_default_sa(instances_raw))
    except Exception as exc:
        logger.warning("Compute instance scan failed: %s", exc)

    return assets, issues


def _scan_storage(
    project_id: str,
    credentials: Any,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Scan GCS buckets and check IAM policies.

    Returns (assets, issues).
    """
    from google.cloud.storage import Client as StorageClient

    assets: List[Dict[str, Any]] = []
    issues: List[Dict[str, Any]] = []
    buckets_raw: List[Dict[str, Any]] = []

    try:
        client = StorageClient(project=project_id, credentials=credentials)
        for bucket in client.list_buckets():
            bucket_dict: Dict[str, Any] = {
                "name": bucket.name,
                "location": bucket.location or "",
                "storage_class": bucket.storage_class or "",
                "iam_policy": {"bindings": []},
            }
            # Fetch IAM policy
            try:
                policy = bucket.get_iam_policy(requested_policy_version=3)
                bucket_dict["iam_policy"]["bindings"] = [
                    {"role": b["role"], "members": list(b.get("members", []))}
                    for b in policy.bindings
                ]
            except Exception as exc:
                logger.debug("Could not fetch IAM for bucket %s: %s", bucket.name, exc)

            buckets_raw.append(bucket_dict)
            assets.append({
                "asset_type": "bucket",
                "name": bucket.name,
                "region": bucket.location or "",
                "metadata_json": json.dumps(bucket_dict),
            })

        issues.extend(_check_public_buckets(buckets_raw))
    except Exception as exc:
        logger.warning("Storage scan failed: %s", exc)

    return assets, issues


def _scan_cloud_logging(
    project_id: str,
    credentials_json: str,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Fetch recent WARNING+ logs and produce issues via deterministic parsing.

    Returns (assets, issues).
    """
    from api.gcp_logging import fetch_logs, deterministic_parse

    assets: List[Dict[str, Any]] = []
    issues: List[Dict[str, Any]] = []

    # Set up credentials for the Cloud Logging client
    creds_path = _temp_credentials_file(credentials_json)
    old_env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    try:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

        lines = fetch_logs(
            project_id,
            log_filter='severity >= "WARNING"',
            max_entries=500,
            hours_back=24,
        )

        entries = deterministic_parse(lines)

        # Aggregate counts by event type
        error_count = sum(
            1 for e in entries if e.event_type in ("error", "server_error")
        )
        auth_fail_count = sum(
            1 for e in entries if e.event_type == "failed_auth"
        )
        recon_count = sum(
            1 for e in entries if e.event_type == "recon_probe"
        )

        # Summary asset
        assets.append({
            "asset_type": "log_summary",
            "name": "cloud_logging_summary",
            "metadata_json": json.dumps({
                "total_entries": len(entries),
                "error_count": error_count,
                "auth_fail_count": auth_fail_count,
                "recon_count": recon_count,
            }),
        })

        # Threshold-based issues
        if error_count > 10:
            issues.append({
                "rule_code": "log_001",
                "title": f"High error rate detected ({error_count} errors in 24h)",
                "description": (
                    f"Cloud Logging shows {error_count} errors/server_errors "
                    "in the last 24 hours. Investigate root cause."
                ),
                "severity": "high",
                "location": "Cloud Logging",
                "fix_time": "30 min",
            })

        if auth_fail_count > 5:
            issues.append({
                "rule_code": "log_002",
                "title": f"Elevated authentication failures ({auth_fail_count} in 24h)",
                "description": (
                    f"Cloud Logging shows {auth_fail_count} authentication failures "
                    "in the last 24 hours. Check for brute-force or credential-stuffing attacks."
                ),
                "severity": "high",
                "location": "Cloud Logging",
                "fix_time": "20 min",
            })

        if recon_count > 3:
            issues.append({
                "rule_code": "log_003",
                "title": f"Reconnaissance probes detected ({recon_count} in 24h)",
                "description": (
                    f"Cloud Logging shows {recon_count} requests to known recon "
                    "paths (/.env, /.git, /wp-admin, etc.). Consider WAF rules."
                ),
                "severity": "medium",
                "location": "Cloud Logging",
                "fix_time": "15 min",
            })

    except Exception as exc:
        logger.warning("Cloud Logging scan failed: %s", exc)
    finally:
        # Clean up temp file and restore env
        try:
            os.unlink(creds_path)
        except OSError:
            pass
        if old_env is None:
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
        else:
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = old_env

    return assets, issues


# ── Main orchestrator ───────────────────────────────────────────────


def run_scan(
    project_id: str,
    credentials_json: str,
    services: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Run a GCP compliance scan across the requested services.

    For each requested service, checks if it is in
    ``probe_available_services()``.  If available *and* credentials
    exist, run that scanner.  Always runs ``cloud_logging``.

    Returns a result dict with scan_type, scanned_services, assets,
    issues, counts, and a ``scan_log`` key with per-service details.
    """
    if services is None:
        services = ["cloud_logging"]

    available = probe_available_services()

    all_assets: List[Dict[str, Any]] = []
    all_issues: List[Dict[str, Any]] = []
    scanned: List[str] = []

    # ── Scan log capture ──
    service_details: Dict[str, Dict[str, Any]] = {}
    log_entries: List[Dict[str, str]] = []
    scan_start = time.monotonic()
    scan_start_ts = datetime.now(timezone.utc).isoformat()

    def _log(level: str, message: str) -> None:
        log_entries.append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        })

    _log("info", f"Scan started for project {project_id}")
    _log("info", f"Requested services: {', '.join(services)}")
    _log("info", f"Available libraries: {', '.join(available)}")

    credentials = None
    if credentials_json:
        try:
            credentials = _make_credentials(credentials_json)
            _log("info", "Credentials loaded successfully")
        except Exception as exc:
            logger.warning("Could not create GCP credentials: %s", exc)
            _log("error", f"Credential loading failed: {exc}")

    # ---- Compute (firewall + instances) ----
    if "compute" in services and "compute" in available and credentials:
        _log("info", "[compute] Started scanning")
        svc_start = time.monotonic()
        try:
            assets, issues = _scan_compute(project_id, credentials)
            all_assets.extend(assets)
            all_issues.extend(issues)
            scanned.append("compute")
            elapsed = round(time.monotonic() - svc_start, 2)
            service_details["compute"] = {
                "status": "success", "duration_seconds": elapsed,
                "asset_count": len(assets), "issue_count": len(issues), "error": None,
            }
            _log("info", f"[compute] Completed: {len(assets)} assets, {len(issues)} issues ({elapsed}s)")
        except Exception as exc:
            elapsed = round(time.monotonic() - svc_start, 2)
            service_details["compute"] = {
                "status": "error", "duration_seconds": elapsed,
                "asset_count": 0, "issue_count": 0, "error": str(exc),
            }
            _log("error", f"[compute] Failed: {exc}")
            logger.warning("Compute scan failed: %s", exc)
    elif "compute" in services:
        reason = "library not installed" if "compute" not in available else "no credentials"
        _log("warning", f"[compute] Skipped: {reason}")
        service_details["compute"] = {
            "status": "skipped", "duration_seconds": 0,
            "asset_count": 0, "issue_count": 0, "error": reason,
        }

    # ---- Storage ----
    if "storage" in services and "storage" in available and credentials:
        _log("info", "[storage] Started scanning")
        svc_start = time.monotonic()
        try:
            assets, issues = _scan_storage(project_id, credentials)
            all_assets.extend(assets)
            all_issues.extend(issues)
            scanned.append("storage")
            elapsed = round(time.monotonic() - svc_start, 2)
            service_details["storage"] = {
                "status": "success", "duration_seconds": elapsed,
                "asset_count": len(assets), "issue_count": len(issues), "error": None,
            }
            _log("info", f"[storage] Completed: {len(assets)} assets, {len(issues)} issues ({elapsed}s)")
        except Exception as exc:
            elapsed = round(time.monotonic() - svc_start, 2)
            service_details["storage"] = {
                "status": "error", "duration_seconds": elapsed,
                "asset_count": 0, "issue_count": 0, "error": str(exc),
            }
            _log("error", f"[storage] Failed: {exc}")
            logger.warning("Storage scan failed: %s", exc)
    elif "storage" in services:
        reason = "library not installed" if "storage" not in available else "no credentials"
        _log("warning", f"[storage] Skipped: {reason}")
        service_details["storage"] = {
            "status": "skipped", "duration_seconds": 0,
            "asset_count": 0, "issue_count": 0, "error": reason,
        }

    # ---- Cloud Logging (always attempted) ----
    if credentials_json:
        _log("info", "[cloud_logging] Started scanning")
        svc_start = time.monotonic()
        try:
            assets, issues = _scan_cloud_logging(project_id, credentials_json)
            all_assets.extend(assets)
            all_issues.extend(issues)
            scanned.append("cloud_logging")
            elapsed = round(time.monotonic() - svc_start, 2)
            service_details["cloud_logging"] = {
                "status": "success", "duration_seconds": elapsed,
                "asset_count": len(assets), "issue_count": len(issues), "error": None,
            }
            _log("info", f"[cloud_logging] Completed: {len(assets)} assets, {len(issues)} issues ({elapsed}s)")
        except Exception as exc:
            elapsed = round(time.monotonic() - svc_start, 2)
            service_details["cloud_logging"] = {
                "status": "error", "duration_seconds": elapsed,
                "asset_count": 0, "issue_count": 0, "error": str(exc),
            }
            _log("error", f"[cloud_logging] Failed: {exc}")
            logger.warning("Cloud Logging scan failed: %s", exc)

    # Determine scan_type
    non_logging_services = [s for s in scanned if s != "cloud_logging"]
    scan_type = "full" if non_logging_services else "cloud_logging_only"

    # ── Build scan log summary ──
    total_duration = round(time.monotonic() - scan_start, 2)
    services_attempted = list(service_details.keys())
    services_succeeded = [s for s, d in service_details.items() if d["status"] == "success"]
    services_failed = [s for s, d in service_details.items() if d["status"] == "error"]

    _log("info", f"Scan complete: {len(all_assets)} assets, {len(all_issues)} issues ({total_duration}s)")

    scan_log: Dict[str, Any] = {
        "scan_type": scan_type,
        "services_attempted": services_attempted,
        "services_succeeded": services_succeeded,
        "services_failed": services_failed,
        "total_asset_count": len(all_assets),
        "total_issue_count": len(all_issues),
        "duration_seconds": total_duration,
        "service_details": service_details,
        "log_entries": log_entries,
        "started_at": scan_start_ts,
    }

    return {
        "scan_type": scan_type,
        "scanned_services": scanned,
        "assets": all_assets,
        "issues": all_issues,
        "asset_count": len(all_assets),
        "issue_count": len(all_issues),
        "scan_log": scan_log,
    }
