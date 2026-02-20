"""Router for cloud account management, scanning, issues, and assets."""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.cloud_database import (
    create_cloud_account,
    list_cloud_accounts,
    get_cloud_account,
    update_cloud_account,
    delete_cloud_account,
    save_cloud_assets,
    save_cloud_issues,
    list_cloud_issues,
    list_all_user_issues,
    update_cloud_issue_status,
    get_issue_counts,
    get_asset_counts,
    list_cloud_assets,
    list_cloud_checks,
    create_scan_log,
    complete_scan_log,
    list_scan_logs,
    get_scan_log,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clouds", tags=["clouds"])


# --------------- schemas ---------------


class CreateCloudRequest(BaseModel):
    name: str
    project_id: str
    provider: str = "gcp"
    purpose: str = "production"
    credentials_json: str = ""
    services: list[str] = Field(default_factory=lambda: ["cloud_logging"])


class UpdateCloudRequest(BaseModel):
    name: str | None = None
    purpose: str | None = None
    credentials_json: str | None = None
    services: list[str] | None = None


class UpdateIssueStatusRequest(BaseModel):
    status: str  # todo, in_progress, ignored, resolved


# --------------- helpers ---------------


def _get_user_email(request: Request) -> str:
    """Read the user email from the X-User-Email header."""
    return request.headers.get("X-User-Email", "")


def _account_with_counts(account: dict) -> dict:
    """Attach issue_counts, asset_counts and strip credentials from an account dict."""
    account["issue_counts"] = get_issue_counts(account["id"])
    account["asset_counts"] = get_asset_counts(account["id"])
    account.pop("credentials_json", None)
    return account


# --------------- Account CRUD ---------------


@router.get("")
async def list_clouds(request: Request):
    """List cloud accounts for the authenticated user."""
    user_email = _get_user_email(request)
    accounts = list_cloud_accounts(user_email)
    return [_account_with_counts(a) for a in accounts]


@router.post("", status_code=201)
async def create_cloud(request: Request, body: CreateCloudRequest):
    """Create a new cloud account."""
    user_email = _get_user_email(request)
    account_id = create_cloud_account(
        user_email=user_email,
        provider=body.provider,
        name=body.name,
        project_id=body.project_id,
        purpose=body.purpose,
        credentials_json=body.credentials_json,
        services=json.dumps(body.services),
    )
    account = get_cloud_account(account_id)
    return _account_with_counts(account)


# IMPORTANT: Static path segments must be defined BEFORE /{cloud_id}
# to avoid FastAPI matching them as a cloud_id parameter.


@router.get("/all-issues")
async def all_issues(
    request: Request,
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List all cloud issues across all clouds for the authenticated user."""
    user_email = _get_user_email(request)
    return list_all_user_issues(user_email, status=status or "", severity=severity or "")


@router.get("/{cloud_id}/probe")
async def probe_cloud_access(cloud_id: str):
    """Live-test which GCP services the stored credentials can access.

    Returns per-service accessibility so the UI can show what the
    service account is allowed to reach — no need to re-upload creds
    after adding roles in the GCP console.
    """
    import asyncio
    from api.gcp_scanner import probe_credential_access

    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")

    creds = account.get("credentials_json", "")
    if not creds:
        raise HTTPException(status_code=400, detail="No credentials stored for this cloud")

    result = await asyncio.to_thread(
        probe_credential_access, account["project_id"], creds
    )

    # Update stored services list to match what's actually accessible
    accessible = result.get("accessible", [])
    if accessible:
        update_cloud_account(cloud_id, services=json.dumps(accessible))

    return result


@router.get("/checks")
async def list_checks(category: Optional[str] = Query(None)):
    """List compliance check definitions."""
    return list_cloud_checks(provider="gcp", category=category or "")


@router.get("/{cloud_id}")
async def get_cloud(cloud_id: str):
    """Get a single cloud account with issue counts."""
    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    return _account_with_counts(account)


@router.put("/{cloud_id}")
async def update_cloud(cloud_id: str, body: UpdateCloudRequest):
    """Update a cloud account's mutable fields."""
    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.purpose is not None:
        updates["purpose"] = body.purpose
    if body.credentials_json is not None:
        updates["credentials_json"] = body.credentials_json
    if body.services is not None:
        updates["services"] = json.dumps(body.services)

    if updates:
        update_cloud_account(cloud_id, **updates)

    return _account_with_counts(get_cloud_account(cloud_id))


@router.delete("/{cloud_id}")
async def delete_cloud(cloud_id: str):
    """Delete a cloud account and all its assets/issues."""
    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    delete_cloud_account(cloud_id)
    return {"detail": "deleted"}


# --------------- Scanning ---------------


@router.post("/{cloud_id}/scan")
async def trigger_scan(cloud_id: str):
    """Trigger a scan via the super agent with SSE streaming."""
    from sse_starlette.sse import EventSourceResponse

    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")

    # Always pass None so run_scan live-probes credentials and scans
    # everything the service account can access — no static config needed.
    services = None

    async def scan_generator():
        from pipeline.cloud_scan_graph import build_scan_pipeline

        graph = build_scan_pipeline()

        initial_state = {
            "cloud_account_id": cloud_id,
            "project_id": account["project_id"],
            "credentials_json": account.get("credentials_json", ""),
            "enabled_services": services,
            "discovered_assets": [],
            "public_assets": [],
            "private_assets": [],
            "scan_issues": [],
            "log_lines": [],
            "scanned_assets": [],
            "scan_status": "starting",
            "assets_scanned": 0,
            "total_assets": 0,
        }

        # Use a thread-safe queue so graph.stream() pushes events
        # incrementally from a background thread to this async generator.
        _SENTINEL = object()
        event_queue: queue.Queue = queue.Queue()

        def _run_graph():
            from pipeline.cloud_scan_graph import set_progress_queue
            set_progress_queue(event_queue)
            try:
                last_event = {}
                for event in graph.stream(initial_state, stream_mode="values"):
                    last_event = event
                    event_queue.put(("event", event))
                event_queue.put(("done", last_event))
            except Exception as exc:
                event_queue.put(("error", exc))

        thread = threading.Thread(target=_run_graph, daemon=True)
        thread.start()

        prev_status = ""
        final = {}
        try:
            while True:
                # Poll the queue from the async loop without blocking the event loop
                try:
                    msg = await asyncio.to_thread(event_queue.get, timeout=300)
                except Exception:
                    break

                kind, payload = msg
                if kind == "error":
                    raise payload
                if kind == "done":
                    final = payload
                    break

                # Threat pipeline sub-stage event
                if kind == "threat_stage":
                    yield {
                        "data": json.dumps({
                            "event": "threat_stage",
                            "threat_stage": payload,
                        })
                    }
                    continue

                # kind == "event" — emit SSE progress on status changes
                event = payload
                final = event
                status = event.get("scan_status", "")
                if status != prev_status:
                    prev_status = status
                    yield {
                        "data": json.dumps({
                            "event": status,
                            "total_assets": event.get("total_assets", 0),
                            "assets_scanned": event.get("assets_scanned", 0),
                            "scan_type": event.get("scan_type", ""),
                            "public_count": len(event.get("public_assets", [])),
                            "private_count": len(event.get("private_assets", [])),
                        })
                    }

            # Save results to database — prefer correlated issues over raw
            issues = final.get("correlated_issues") or final.get("scan_issues", [])
            assets = final.get("discovered_assets", [])
            active_exploits = final.get("active_exploits_detected", 0)

            # Generate remediation scripts for all issues
            if issues:
                from pipeline.agents.remediation_generator import generate_remediation
                generate_remediation(issues, project_id=account["project_id"])

            inserted = 0
            if issues:
                inserted = save_cloud_issues(cloud_id, issues)
            if assets:
                save_cloud_assets(cloud_id, assets)
            update_cloud_account(
                cloud_id,
                last_scan_at=datetime.now(timezone.utc).isoformat(),
            )

            # ── Save scan results to reports DB so Feed can display them ──
            log_lines_count = len(final.get("log_lines", []))
            logger.info(
                "Scan final state: issues=%d, log_lines=%d, classified=%d, has_report=%s, metrics_keys=%s",
                len(issues), log_lines_count,
                len(final.get("classified_threats", [])),
                bool(final.get("report")),
                list(final.get("agent_metrics", {}).keys()),
            )
            if issues:
                classified = final.get("classified_threats", [])
                report = final.get("report")
                agent_metrics = final.get("agent_metrics", {})
                pipeline_time = final.get("pipeline_time", 0.0)

                # Build AnalysisResponse-shaped dict for save_analysis
                severity_counts = {}
                for iss in issues:
                    sev = iss.get("severity", "medium")
                    severity_counts[sev] = severity_counts.get(sev, 0) + 1

                # Convert Pydantic models to dicts for JSON serialization
                def _to_dict(obj):
                    if hasattr(obj, "model_dump"):
                        return obj.model_dump()
                    if hasattr(obj, "dict"):
                        return obj.dict()
                    return obj

                response_data = {
                    "status": "completed",
                    "summary": {
                        "total_threats": len(issues),
                        "severity_counts": severity_counts,
                        "auto_ignored": 0,
                        "total_logs": len(final.get("log_lines", [])),
                        "logs_cleared": 0,
                    },
                    "classified_threats": [_to_dict(ct) for ct in classified],
                    "report": _to_dict(report) if report else None,
                    "agent_metrics": {k: _to_dict(v) for k, v in agent_metrics.items()} if agent_metrics else {},
                    "pipeline_time": pipeline_time,
                }

                try:
                    from api.database import save_analysis
                    user_email = account.get("user_email", "")
                    save_analysis(response_data, user_email=user_email)
                except Exception:
                    logger.warning("Failed to save scan analysis report", exc_info=True)

            # ── Save scan log ──
            scan_log_id = None
            try:
                scan_log_data = final.get("scan_log_data", {})
                started_at = scan_log_data.get(
                    "started_at", datetime.now(timezone.utc).isoformat()
                )
                scan_log_id = create_scan_log(cloud_id, started_at)

                services_failed = scan_log_data.get("services_failed", [])
                services_succeeded = scan_log_data.get("services_succeeded", [])
                if not services_succeeded and services_failed:
                    log_status = "error"
                elif services_failed:
                    log_status = "partial"
                else:
                    log_status = "success"

                summary = {
                    k: v
                    for k, v in scan_log_data.items()
                    if k not in ("log_entries", "started_at")
                }
                summary["active_exploits_detected"] = active_exploits

                complete_scan_log(
                    log_id=scan_log_id,
                    status=log_status,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary_json=json.dumps(summary),
                    log_entries_json=json.dumps(
                        scan_log_data.get("log_entries", [])
                    ),
                )
            except Exception:
                logger.warning("Failed to save scan log", exc_info=True)

            yield {
                "data": json.dumps({
                    "event": "complete",
                    "scan_type": final.get("scan_type", "unknown"),
                    "asset_count": len(assets),
                    "issue_count": len(issues),
                    "active_exploits_detected": active_exploits,
                    "issue_counts": get_issue_counts(cloud_id),
                    "has_report": final.get("report") is not None,
                    "scan_log_id": scan_log_id,
                })
            }

        except Exception as e:
            logger.exception("Scan failed")
            # Save error scan log
            try:
                err_log_id = create_scan_log(
                    cloud_id, datetime.now(timezone.utc).isoformat()
                )
                complete_scan_log(
                    log_id=err_log_id,
                    status="error",
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary_json=json.dumps({"error": str(e)}),
                    log_entries_json="[]",
                )
            except Exception:
                logger.warning("Failed to save error scan log")
            yield {
                "data": json.dumps({"event": "error", "message": str(e)})
            }

    return EventSourceResponse(scan_generator())


# --------------- Scan Logs ---------------


@router.get("/{cloud_id}/scan-logs")
async def list_scan_logs_endpoint(
    cloud_id: str, limit: int = Query(20, ge=1, le=100)
):
    """List recent scan logs for a cloud account."""
    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    return list_scan_logs(cloud_id, limit=limit)


@router.get("/{cloud_id}/scan-logs/{log_id}")
async def get_scan_log_endpoint(cloud_id: str, log_id: str):
    """Get full scan log detail."""
    log = get_scan_log(log_id)
    if not log or log["cloud_account_id"] != cloud_id:
        raise HTTPException(status_code=404, detail="Scan log not found")
    return log


# --------------- Issues ---------------


@router.get("/{cloud_id}/issues")
async def list_issues(
    cloud_id: str,
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List issues for a cloud account, with optional filters."""
    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    return list_cloud_issues(
        cloud_id,
        status=status or "",
        severity=severity or "",
    )


@router.patch("/issues/{issue_id}")
async def update_issue(issue_id: str, body: UpdateIssueStatusRequest):
    """Update the status of a single issue."""
    update_cloud_issue_status(issue_id, body.status)
    return {"id": issue_id, "status": body.status}


# --------------- Assets ---------------


@router.get("/{cloud_id}/assets")
async def list_assets(
    cloud_id: str,
    asset_type: Optional[str] = Query(None),
):
    """List assets for a cloud account, with optional type filter."""
    account = get_cloud_account(cloud_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cloud account not found")
    return list_cloud_assets(cloud_id, asset_type=asset_type or "")
