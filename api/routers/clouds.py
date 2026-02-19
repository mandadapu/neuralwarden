"""Router for cloud account management, scanning, issues, and assets."""

from __future__ import annotations

import asyncio
import json
import logging
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
    update_cloud_issue_status,
    clear_cloud_issues,
    get_issue_counts,
    list_cloud_assets,
    list_cloud_checks,
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
    status: str  # todo, in_progress, ignored, solved


# --------------- helpers ---------------


def _get_user_email(request: Request) -> str:
    """Read the user email from the X-User-Email header."""
    return request.headers.get("X-User-Email", "")


def _account_with_counts(account: dict) -> dict:
    """Attach issue_counts and strip credentials from an account dict."""
    account["issue_counts"] = get_issue_counts(account["id"])
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
    return account


# IMPORTANT: /checks must be defined BEFORE /{cloud_id} to avoid
# FastAPI matching "checks" as a cloud_id parameter.
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

    return get_cloud_account(cloud_id)


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

    services = account.get("services", "[]")
    if isinstance(services, str):
        services = json.loads(services)

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

        prev_status = ""
        event = {}
        try:
            for event in await asyncio.to_thread(
                lambda: list(graph.stream(initial_state, stream_mode="values"))
            ):
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

            # Get final state — last event from stream
            final = event

            # Save results to database — prefer correlated issues over raw
            clear_cloud_issues(cloud_id)
            issues = final.get("correlated_issues") or final.get("scan_issues", [])
            assets = final.get("discovered_assets", [])
            active_exploits = final.get("active_exploits_detected", 0)
            if assets:
                save_cloud_assets(cloud_id, assets)
            if issues:
                save_cloud_issues(cloud_id, issues)
            update_cloud_account(
                cloud_id,
                last_scan_at=datetime.now(timezone.utc).isoformat(),
            )

            yield {
                "data": json.dumps({
                    "event": "complete",
                    "scan_type": final.get("scan_type", "unknown"),
                    "asset_count": len(assets),
                    "issue_count": len(issues),
                    "active_exploits_detected": active_exploits,
                    "issue_counts": get_issue_counts(cloud_id),
                    "has_report": final.get("report") is not None,
                })
            }

        except Exception as e:
            logger.exception("Scan failed")
            yield {
                "data": json.dumps({"event": "error", "message": str(e)})
            }

    return EventSourceResponse(scan_generator())


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
