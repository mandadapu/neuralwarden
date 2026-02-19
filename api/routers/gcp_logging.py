"""Router for Google Cloud Logging integration."""

from __future__ import annotations

import asyncio
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/gcp-logging", tags=["gcp-logging"])


# --------------- schemas ---------------


class GcpStatusResponse(BaseModel):
    available: bool
    credentials_set: bool
    project_id: str | None = None


class GcpFetchRequest(BaseModel):
    project_id: str
    log_filter: str = ""
    max_entries: int = Field(default=500, ge=10, le=2000)
    hours_back: int = Field(default=24, ge=1, le=168)


class GcpFetchResponse(BaseModel):
    logs: str
    entry_count: int
    project_id: str


# --------------- endpoints ---------------


@router.get("/status", response_model=GcpStatusResponse)
async def gcp_status() -> GcpStatusResponse:
    """Check if GCP Cloud Logging is available and credentials are configured."""
    try:
        from api.gcp_logging import _GCP_AVAILABLE
    except Exception:
        _GCP_AVAILABLE = False

    creds_set = bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    return GcpStatusResponse(
        available=_GCP_AVAILABLE,
        credentials_set=creds_set,
        project_id=os.getenv("GCP_PROJECT_ID"),
    )


@router.post("/fetch", response_model=GcpFetchResponse)
async def gcp_fetch(req: GcpFetchRequest) -> GcpFetchResponse:
    """Fetch logs from GCP Cloud Logging and return as formatted text."""
    try:
        from api.gcp_logging import fetch_logs
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="google-cloud-logging is not installed. "
            "Install with: pip install 'neuralwarden[gcp]'",
        )

    try:
        lines = await asyncio.to_thread(
            fetch_logs,
            req.project_id,
            req.log_filter,
            req.max_entries,
            req.hours_back,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GCP API error: {e}")

    if not lines:
        raise HTTPException(
            status_code=404,
            detail="No log entries found matching the filter.",
        )

    return GcpFetchResponse(
        logs="\n".join(lines),
        entry_count=len(lines),
        project_id=req.project_id,
    )
