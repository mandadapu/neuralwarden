"""Router for repository connection management, scanning, issues, and assets."""

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

from api.repo_database import (
    create_repo_connection,
    list_repo_connections,
    get_repo_connection,
    update_repo_connection,
    delete_repo_connection,
    save_repo_assets,
    save_repo_issues,
    list_repo_issues,
    list_all_user_repo_issues,
    update_repo_issue_status,
    update_repo_issue_severity,
    get_repo_issue_counts,
    get_repo_asset_counts,
    list_repo_assets,
    create_repo_scan_log,
    complete_repo_scan_log,
    list_repo_scan_logs,
    get_repo_scan_log,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repos", tags=["repos"])

# In-memory scan progress for polling (keyed by connection_id).
# Each entry is a dict with event data matching ScanStreamEvent.
_scan_progress: dict[str, dict] = {}


# --------------- schemas ---------------


class CreateRepoConnectionRequest(BaseModel):
    name: str
    org_name: str
    provider: str = "github"
    purpose: str = "production"
    scan_config: str = "{}"
    repos: List[dict] = Field(
        default_factory=list,
        description="List of repos with full_name, name, language, default_branch, private",
    )


class UpdateRepoConnectionRequest(BaseModel):
    name: str | None = None
    purpose: str | None = None
    scan_config: str | None = None


class UpdateIssueStatusRequest(BaseModel):
    status: str  # todo, in_progress, ignored, resolved


class UpdateIssueSeverityRequest(BaseModel):
    severity: str  # critical, high, medium, low


# --------------- helpers ---------------


def _get_user_email(request: Request) -> str:
    """Read the user email from the X-User-Email header."""
    return request.headers.get("X-User-Email", "")


def _connection_with_counts(conn: dict) -> dict:
    """Attach issue_counts and asset_counts to a connection dict."""
    conn["issue_counts"] = get_repo_issue_counts(conn["id"])
    conn["asset_counts"] = get_repo_asset_counts(conn["id"])
    return conn


# --------------- Connection CRUD ---------------


@router.get("")
async def list_connections(request: Request):
    """List repo connections for the authenticated user."""
    user_email = _get_user_email(request)
    connections = list_repo_connections(user_email)
    return [_connection_with_counts(c) for c in connections]


@router.post("", status_code=201)
async def create_connection(request: Request, body: CreateRepoConnectionRequest):
    """Create a new repo connection."""
    user_email = _get_user_email(request)
    connection_id = create_repo_connection(
        user_email=user_email,
        provider=body.provider,
        name=body.name,
        org_name=body.org_name,
        purpose=body.purpose,
        scan_config=body.scan_config,
    )

    # If repos were provided, store them as assets immediately
    if body.repos:
        assets = [
            {
                "repo_full_name": r.get("full_name", ""),
                "repo_name": r.get("name", ""),
                "language": r.get("language", ""),
                "default_branch": r.get("default_branch", "main"),
                "is_private": 1 if r.get("private") else 0,
            }
            for r in body.repos
        ]
        save_repo_assets(connection_id, assets)

    connection = get_repo_connection(connection_id)
    return _connection_with_counts(connection)


# IMPORTANT: Static path segments must be defined BEFORE /{conn_id}
# to avoid FastAPI matching them as a conn_id parameter.


@router.get("/github/user")
async def github_user(request: Request):
    """Proxy: get the authenticated GitHub user."""
    from api.github_scanner import get_authenticated_user

    return get_authenticated_user()


@router.get("/github/orgs")
async def github_orgs(request: Request):
    """Proxy: list GitHub organisations the user belongs to."""
    from api.github_scanner import list_user_orgs

    return list_user_orgs()


@router.get("/github/orgs/{org}/repos")
async def github_org_repos(org: str, request: Request):
    """Proxy: list repos for a GitHub organisation."""
    from api.github_scanner import list_org_repos

    return list_org_repos(org)


@router.get("/all-issues")
async def all_issues(
    request: Request,
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List all repo issues across all connections for the authenticated user."""
    user_email = _get_user_email(request)
    return list_all_user_repo_issues(user_email, status=status or "", severity=severity or "")


@router.get("/{conn_id}")
async def get_connection(conn_id: str):
    """Get a single repo connection with counts."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return _connection_with_counts(connection)


@router.put("/{conn_id}")
async def update_connection(conn_id: str, body: UpdateRepoConnectionRequest):
    """Update a repo connection's mutable fields."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.purpose is not None:
        updates["purpose"] = body.purpose
    if body.scan_config is not None:
        updates["scan_config"] = body.scan_config

    if updates:
        update_repo_connection(conn_id, **updates)

    return _connection_with_counts(get_repo_connection(conn_id))


@router.delete("/{conn_id}")
async def delete_connection(conn_id: str):
    """Delete a repo connection and all its assets/issues."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    delete_repo_connection(conn_id)
    return {"detail": "deleted"}


@router.post("/{conn_id}/toggle")
async def toggle_connection(conn_id: str):
    """Toggle a repo connection between active and disabled."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    new_status = "disabled" if connection.get("status") != "disabled" else "active"
    update_repo_connection(conn_id, status=new_status)
    return _connection_with_counts(get_repo_connection(conn_id))


# --------------- Scanning ---------------


@router.post("/{conn_id}/scan")
async def trigger_scan(conn_id: str):
    """Trigger a repo scan with SSE streaming."""
    from sse_starlette.sse import EventSourceResponse

    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    if connection.get("status") == "disabled":
        raise HTTPException(status_code=400, detail="Repo connection is disabled. Re-enable it to scan.")

    scan_config = {}
    try:
        scan_config = json.loads(connection.get("scan_config", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    # Get repos to scan from stored assets
    repos = list_repo_assets(conn_id)

    async def scan_generator():
        from api.github_scanner import run_repo_scan

        # If no stored assets, try fetching from GitHub API
        nonlocal repos
        if not repos:
            try:
                from api.github_scanner import list_org_repos

                org_name = connection.get("org_name", "")
                if org_name:
                    fetched = list_org_repos(org_name)
                    # Convert to asset dicts
                    repos = [
                        {
                            "repo_full_name": r.get("full_name", ""),
                            "repo_name": r.get("name", ""),
                            "language": r.get("language", ""),
                            "default_branch": r.get("default_branch", "main"),
                            "is_private": 1 if r.get("private") else 0,
                        }
                        for r in fetched
                    ]
            except Exception:
                logger.warning("Failed to fetch repos from GitHub for org %s", connection.get("org_name"))

        total_repos = len(repos)
        _SENTINEL = object()
        event_queue: queue.Queue = queue.Queue()

        def progress_callback(event_type: str, data):
            event_queue.put((event_type, data))

        def _run_scan():
            try:
                run_repo_scan(
                    connection_id=conn_id,
                    org_name=connection.get("org_name", ""),
                    repos=repos,
                    scan_config=scan_config,
                    progress_callback=progress_callback,
                )
            except Exception as exc:
                event_queue.put(("error", exc))

        thread = threading.Thread(target=_run_scan, daemon=True)
        thread.start()

        # Write initial progress for polling clients
        _scan_progress[conn_id] = {
            "event": "starting",
            "total_repos": total_repos,
            "repos_scanned": 0,
        }

        # Emit 4KB padding comment for Cloud Run buffering
        yield {"comment": " " * 4096}
        yield {"data": json.dumps(_scan_progress[conn_id])}

        started_at = datetime.now(timezone.utc).isoformat()
        final_result = {}
        try:
            while True:
                try:
                    msg = await asyncio.to_thread(event_queue.get, timeout=15)
                except Exception:
                    if not thread.is_alive():
                        break
                    yield {"comment": "keepalive"}
                    continue

                kind, payload = msg

                if kind == "error":
                    raise payload

                if kind == "progress":
                    progress_data = {
                        "event": "scanning",
                        "repos_scanned": payload.get("repos_scanned", 0),
                        "total_repos": payload.get("total_repos", total_repos),
                        "current_repo": payload.get("current_repo", ""),
                    }
                    _scan_progress[conn_id] = progress_data
                    yield {"data": json.dumps(progress_data)}
                    continue

                if kind == "complete":
                    final_result = payload
                    break

            # Save results to database
            issues = final_result.get("issues", [])
            scanned_repos = final_result.get("repos", repos)

            inserted = 0
            if issues:
                inserted = save_repo_issues(conn_id, issues)

            if scanned_repos:
                # Normalize and save discovered repo assets
                asset_dicts = []
                for r in scanned_repos:
                    asset_dicts.append({
                        "repo_full_name": r.get("repo_full_name", r.get("full_name", "")),
                        "repo_name": r.get("repo_name", r.get("name", "")),
                        "language": r.get("language", ""),
                        "default_branch": r.get("default_branch", "main"),
                        "is_private": r.get("is_private", 1 if r.get("private") else 0),
                    })
                save_repo_assets(conn_id, asset_dicts)

            update_repo_connection(
                conn_id,
                last_scan_at=datetime.now(timezone.utc).isoformat(),
            )

            # Save scan log
            scan_log_id = None
            try:
                scan_log_id = create_repo_scan_log(conn_id, started_at)

                log_entries = final_result.get("log_entries", [])
                summary = {
                    "repos_scanned": len(scanned_repos),
                    "issues_found": len(issues),
                    "issues_inserted": inserted,
                }
                log_status = "success" if issues is not None else "error"

                complete_repo_scan_log(
                    log_id=scan_log_id,
                    status=log_status,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary_json=json.dumps(summary),
                    log_entries_json=json.dumps(log_entries),
                )
            except Exception:
                logger.warning("Failed to save repo scan log", exc_info=True)

            complete_data = {
                "event": "complete",
                "repo_count": len(scanned_repos),
                "issue_count": len(issues),
                "issue_counts": get_repo_issue_counts(conn_id),
                "scan_log_id": scan_log_id,
            }
            _scan_progress[conn_id] = complete_data
            yield {"data": json.dumps(complete_data)}

        except Exception as e:
            logger.exception("Repo scan failed")
            # Save error scan log
            try:
                err_log_id = create_repo_scan_log(
                    conn_id, datetime.now(timezone.utc).isoformat()
                )
                complete_repo_scan_log(
                    log_id=err_log_id,
                    status="error",
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary_json=json.dumps({"error": str(e)}),
                    log_entries_json="[]",
                )
            except Exception:
                logger.warning("Failed to save error scan log")
            _scan_progress[conn_id] = {"event": "error", "message": str(e)}
            yield {
                "data": json.dumps({"event": "error", "message": str(e)})
            }
        finally:
            # Clean up progress after a short delay so final poll can read it
            async def _cleanup():
                await asyncio.sleep(10)
                _scan_progress.pop(conn_id, None)
            asyncio.ensure_future(_cleanup())

    return EventSourceResponse(scan_generator(), ping=15)


@router.get("/{conn_id}/scan-progress")
async def get_scan_progress(conn_id: str):
    """Return the current scan progress for polling-based overlay updates."""
    return _scan_progress.get(conn_id, {"event": "idle"})


# --------------- Scan Logs ---------------


@router.get("/{conn_id}/scan-logs")
async def list_scan_logs_endpoint(
    conn_id: str, limit: int = Query(20, ge=1, le=100)
):
    """List recent scan logs for a repo connection."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return list_repo_scan_logs(conn_id, limit=limit)


@router.get("/{conn_id}/scan-logs/{log_id}")
async def get_scan_log_endpoint(conn_id: str, log_id: str):
    """Get full scan log detail."""
    log = get_repo_scan_log(log_id)
    if not log or log["connection_id"] != conn_id:
        raise HTTPException(status_code=404, detail="Scan log not found")
    return log


# --------------- Issues ---------------


@router.get("/{conn_id}/issues")
async def list_issues(
    conn_id: str,
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List issues for a repo connection, with optional filters."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return list_repo_issues(
        conn_id,
        status=status or "",
        severity=severity or "",
    )


@router.patch("/issues/{issue_id}")
async def update_issue(issue_id: str, body: UpdateIssueStatusRequest):
    """Update the status of a single issue."""
    update_repo_issue_status(issue_id, body.status)
    return {"id": issue_id, "status": body.status}


@router.patch("/issues/{issue_id}/severity")
async def update_issue_severity(issue_id: str, body: UpdateIssueSeverityRequest):
    """Update the severity of a single issue."""
    update_repo_issue_severity(issue_id, body.severity)
    return {"id": issue_id, "severity": body.severity}


# --------------- Assets ---------------


@router.get("/{conn_id}/repos")
async def list_repos(conn_id: str):
    """List discovered repo assets for a connection."""
    connection = get_repo_connection(conn_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return list_repo_assets(conn_id)
