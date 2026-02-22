"""Router for repository connection management, scanning, issues, and assets."""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.auth import get_current_user
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
    get_repo_issue,
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
limiter = Limiter(key_func=get_remote_address)

# In-memory scan progress for polling (keyed by connection_id).
# Each entry is a dict with event data matching ScanStreamEvent.
_scan_progress: dict[str, dict] = {}


# --------------- schemas ---------------


class CreateRepoConnectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    org_name: str = Field(min_length=1, max_length=255)
    provider: str = "github"
    purpose: str = Field(default="production", max_length=100)
    scan_config: str = Field(default="{}", max_length=10_000)
    github_token: str = Field(default="", max_length=500)
    repos: List[dict] = Field(
        default_factory=list,
        description="List of repos with full_name, name, language, default_branch, private",
    )


class UpdateRepoConnectionRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    purpose: str | None = Field(default=None, max_length=100)
    scan_config: str | None = Field(default=None, max_length=10_000)


class UpdateIssueStatusRequest(BaseModel):
    status: Literal["todo", "in_progress", "ignored", "resolved"]


class UpdateIssueSeverityRequest(BaseModel):
    severity: Literal["critical", "high", "medium", "low"]


# --------------- helpers ---------------


def _connection_with_counts(conn: dict) -> dict:
    """Attach issue_counts and asset_counts to a connection dict; strip token."""
    conn.pop("github_token", None)
    conn["issue_counts"] = get_repo_issue_counts(conn["id"])
    conn["asset_counts"] = get_repo_asset_counts(conn["id"])
    return conn


# --------------- Connection CRUD ---------------


@router.get("")
async def list_connections(user_email: str = Depends(get_current_user)):
    """List repo connections for the authenticated user."""
    connections = list_repo_connections(user_email)
    return [_connection_with_counts(c) for c in connections]


@router.post("", status_code=201)
async def create_connection(body: CreateRepoConnectionRequest, user_email: str = Depends(get_current_user)):
    """Create a new repo connection."""
    connection_id = create_repo_connection(
        user_email=user_email,
        provider=body.provider,
        name=body.name,
        org_name=body.org_name,
        github_token=body.github_token,
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


def _github_error(e: Exception) -> HTTPException:
    """Map a GitHub API exception to a safe HTTP error without leaking internals."""
    msg = str(e)
    if "401" in msg:
        return HTTPException(status_code=401, detail="GitHub authentication failed")
    if "403" in msg:
        return HTTPException(status_code=403, detail="GitHub access denied")
    if "404" in msg:
        return HTTPException(status_code=404, detail="GitHub resource not found")
    logger.exception("GitHub API proxy error")
    return HTTPException(status_code=502, detail="GitHub API error")


@router.get("/github/user")
async def github_user(request: Request, _user: str = Depends(get_current_user)):
    """Proxy: get the authenticated GitHub user."""
    from api.github_scanner import get_authenticated_user

    token = request.headers.get("X-GitHub-Token", "")
    try:
        return get_authenticated_user(token=token)
    except Exception as e:
        raise _github_error(e)


@router.get("/github/orgs")
async def github_orgs(request: Request, _user: str = Depends(get_current_user)):
    """Proxy: list GitHub organisations the user belongs to."""
    from api.github_scanner import list_user_orgs

    token = request.headers.get("X-GitHub-Token", "")
    try:
        return list_user_orgs(token=token)
    except Exception as e:
        raise _github_error(e)


@router.get("/github/orgs/{org}/repos")
async def github_org_repos(org: str, request: Request, _user: str = Depends(get_current_user)):
    """Proxy: list repos for a GitHub organisation."""
    from api.github_scanner import list_org_repos

    token = request.headers.get("X-GitHub-Token", "")
    try:
        return list_org_repos(org, token=token)
    except Exception as e:
        raise _github_error(e)


@router.get("/all-issues")
async def all_issues(
    user_email: str = Depends(get_current_user),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List all repo issues across all connections for the authenticated user."""
    return list_all_user_repo_issues(user_email, status=status or "", severity=severity or "")


@router.get("/{conn_id}")
async def get_connection(conn_id: str, user_email: str = Depends(get_current_user)):
    """Get a single repo connection with counts."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return _connection_with_counts(connection)


@router.put("/{conn_id}")
async def update_connection(conn_id: str, body: UpdateRepoConnectionRequest, user_email: str = Depends(get_current_user)):
    """Update a repo connection's mutable fields."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
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
async def delete_connection(conn_id: str, user_email: str = Depends(get_current_user)):
    """Delete a repo connection and all its assets/issues."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    delete_repo_connection(conn_id)
    return {"detail": "deleted"}


@router.post("/{conn_id}/toggle")
async def toggle_connection(conn_id: str, user_email: str = Depends(get_current_user)):
    """Toggle a repo connection between active and disabled."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    new_status = "disabled" if connection.get("status") != "disabled" else "active"
    update_repo_connection(conn_id, status=new_status)
    return _connection_with_counts(get_repo_connection(conn_id))


# --------------- Scanning ---------------


@router.post("/{conn_id}/scan")
@limiter.limit("5/minute")
async def trigger_scan(request: Request, conn_id: str, user_email: str = Depends(get_current_user)):
    """Trigger a repo scan with SSE streaming."""
    from sse_starlette.sse import EventSourceResponse

    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    if connection.get("status") == "disabled":
        raise HTTPException(status_code=400, detail="Repo connection is disabled. Re-enable it to scan.")

    scan_config = {}
    try:
        scan_config = json.loads(connection.get("scan_config", "{}") or "{}")
    except (json.JSONDecodeError, TypeError):
        pass

    # Always fetch fresh repo list from GitHub API to handle renames/new repos
    repos = []
    try:
        from api.github_scanner import list_org_repos

        org_name = connection.get("org_name", "")
        if org_name:
            fetched = list_org_repos(org_name, token=connection.get("github_token", ""))
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
        logger.warning("Failed to fetch repos from GitHub for org %s, falling back to stored assets", connection.get("org_name"))
        repos = list_repo_assets(conn_id)

    started_at = datetime.now(timezone.utc).isoformat()
    total_repos = len(repos)
    event_queue: queue.Queue = queue.Queue()

    def _save_results(result: dict):
        """Save scan results to DB — runs inside the scan thread so results
        persist even if the SSE client disconnects."""
        try:
            issues = result.get("issues", [])
            scanned_repos = result.get("assets", repos)

            inserted = 0
            if issues:
                inserted = save_repo_issues(conn_id, issues)

            if scanned_repos:
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
                summary = {
                    "repos_scanned": len(scanned_repos),
                    "issues_found": len(issues),
                    "issues_inserted": inserted,
                }
                complete_repo_scan_log(
                    log_id=scan_log_id,
                    status="success",
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary_json=json.dumps(summary),
                    log_entries_json=json.dumps(result.get("log_entries", [])),
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
            event_queue.put(("complete", complete_data))

        except Exception as exc:
            logger.exception("Failed to save scan results")
            event_queue.put(("error", exc))

    def progress_callback(event_type: str, data):
        event_queue.put((event_type, data))

    def _run_scan():
        from api.github_scanner import run_repo_scan
        try:
            result = run_repo_scan(
                connection_id=conn_id,
                org_name=connection.get("org_name", ""),
                repos=repos,
                scan_config=scan_config,
                progress_callback=progress_callback,
                token=connection.get("github_token", ""),
            )
            _save_results(result)
        except Exception as exc:
            logger.exception("Repo scan thread failed")
            # Save error scan log
            try:
                err_log_id = create_repo_scan_log(conn_id, started_at)
                complete_repo_scan_log(
                    log_id=err_log_id,
                    status="error",
                    completed_at=datetime.now(timezone.utc).isoformat(),
                    summary_json=json.dumps({"error": str(exc)}),
                    log_entries_json="[]",
                )
            except Exception:
                logger.warning("Failed to save error scan log")
            _scan_progress[conn_id] = {"event": "error", "message": str(exc)}
            event_queue.put(("error", exc))

    thread = threading.Thread(target=_run_scan, daemon=True)
    thread.start()

    # Write initial progress for polling clients
    _scan_progress[conn_id] = {
        "event": "starting",
        "total_repos": total_repos,
        "repos_scanned": 0,
    }

    async def scan_generator():
        # Emit 4KB padding comment for Cloud Run buffering
        yield {"comment": " " * 4096}
        yield {"data": json.dumps(_scan_progress[conn_id])}

        try:
            while True:
                try:
                    msg = await asyncio.to_thread(event_queue.get, timeout=15)
                except queue.Empty:
                    if not thread.is_alive():
                        break
                    yield {"comment": "keepalive"}
                    continue

                kind, payload = msg

                if kind == "error":
                    err_msg = str(payload) if isinstance(payload, Exception) else str(payload)
                    yield {"data": json.dumps({"event": "error", "message": err_msg})}
                    break

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
                    yield {"data": json.dumps(payload)}
                    break

        except Exception as e:
            logger.warning("SSE generator error: %s", e)
        finally:
            # Clean up progress after a short delay so final poll can read it
            async def _cleanup():
                await asyncio.sleep(10)
                _scan_progress.pop(conn_id, None)
            asyncio.create_task(_cleanup())

    return EventSourceResponse(scan_generator(), ping=15)


@router.get("/{conn_id}/scan-progress")
async def get_scan_progress(conn_id: str, user_email: str = Depends(get_current_user)):
    """Return the current scan progress for polling-based overlay updates."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return _scan_progress.get(conn_id, {"event": "idle"})


# --------------- Scan Logs ---------------


@router.get("/{conn_id}/scan-logs")
async def list_scan_logs_endpoint(
    conn_id: str, user_email: str = Depends(get_current_user), limit: int = Query(20, ge=1, le=100)
):
    """List recent scan logs for a repo connection."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return list_repo_scan_logs(conn_id, limit=limit)


@router.get("/{conn_id}/scan-logs/{log_id}")
async def get_scan_log_endpoint(conn_id: str, log_id: str, user_email: str = Depends(get_current_user)):
    """Get full scan log detail."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    log = get_repo_scan_log(log_id)
    if not log or log["connection_id"] != conn_id:
        raise HTTPException(status_code=404, detail="Scan log not found")
    return log


# --------------- Issues ---------------


@router.get("/{conn_id}/issues")
async def list_issues(
    conn_id: str,
    user_email: str = Depends(get_current_user),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List issues for a repo connection, with optional filters."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return list_repo_issues(
        conn_id,
        status=status or "",
        severity=severity or "",
    )


@router.patch("/issues/{issue_id}")
async def update_issue(issue_id: str, body: UpdateIssueStatusRequest, user_email: str = Depends(get_current_user)):
    """Update the status of a single issue."""
    issue = get_repo_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    conn = get_repo_connection(issue["connection_id"])
    if not conn or conn["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Issue not found")
    update_repo_issue_status(issue_id, body.status)
    return {"id": issue_id, "status": body.status}


@router.patch("/issues/{issue_id}/severity")
async def update_issue_severity(issue_id: str, body: UpdateIssueSeverityRequest, user_email: str = Depends(get_current_user)):
    """Update the severity of a single issue."""
    issue = get_repo_issue(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    conn = get_repo_connection(issue["connection_id"])
    if not conn or conn["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Issue not found")
    update_repo_issue_severity(issue_id, body.severity)
    return {"id": issue_id, "severity": body.severity}


# --------------- Assets ---------------


@router.get("/{conn_id}/repos")
async def list_repos(conn_id: str, user_email: str = Depends(get_current_user)):
    """List discovered repo assets for a connection."""
    connection = get_repo_connection(conn_id)
    if not connection or connection["user_email"] != user_email:
        raise HTTPException(status_code=404, detail="Repo connection not found")
    return list_repo_assets(conn_id)
