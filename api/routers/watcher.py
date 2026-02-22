"""Watcher router — start/stop/status for the log-file watcher."""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from api.auth import get_current_user
from pipeline.watcher import LogWatcher

router = APIRouter(prefix="/api/watcher", tags=["watcher"])

_watcher: LogWatcher | None = None

def _watcher_base_dir() -> Path:
    """Allowed base directory for the watcher — prevents path traversal.

    Defaults to ./watch relative to the working directory.
    Evaluated at call time so env var changes (e.g. in tests) take effect.
    """
    return Path(os.getenv("WATCHER_BASE_DIR", "./watch")).resolve()


class StartRequest(BaseModel):
    watch_dir: str = "./watch"


class StatusResponse(BaseModel):
    running: bool
    watch_dir: str | None


def _on_file_detected(file_path: str) -> None:
    """Callback invoked by LogWatcher when a log file is created/modified."""
    try:
        content = Path(file_path).read_text(errors="replace")
        if not content.strip():
            return
        from api.services import run_analysis

        run_analysis(content)
    except (OSError, IOError) as e:
        logger.warning("Failed to read watched file %s: %s", file_path, e)
    except Exception:
        logger.exception("Unexpected error processing watched file %s", file_path)


def _validate_watch_path(raw: str) -> Path:
    """Resolve the watch path and ensure it stays within the allowed base directory."""
    base = _watcher_base_dir()
    resolved = Path(raw).resolve()
    # Must be the base dir itself or a child of it
    try:
        resolved.relative_to(base)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"watch_dir must be within {base}",
        )
    return resolved


@router.post("/start", response_model=StatusResponse)
async def start_watcher(req: StartRequest, _user: str = Depends(get_current_user)) -> StatusResponse:
    global _watcher

    watch_path = _validate_watch_path(req.watch_dir)

    # Stop any existing watcher first
    if _watcher is not None and _watcher.is_running:
        await asyncio.to_thread(_watcher.stop)

    watch_path.mkdir(parents=True, exist_ok=True)

    _watcher = LogWatcher(
        watch_dir=str(watch_path),
        callback=_on_file_detected,
    )
    await asyncio.to_thread(_watcher.start)

    return StatusResponse(running=True, watch_dir=str(watch_path))


@router.post("/stop", response_model=StatusResponse)
async def stop_watcher(_user: str = Depends(get_current_user)) -> StatusResponse:
    global _watcher

    if _watcher is not None:
        await asyncio.to_thread(_watcher.stop)
        watch_dir = _watcher.watch_dir
        _watcher = None
        return StatusResponse(running=False, watch_dir=watch_dir)

    return StatusResponse(running=False, watch_dir=None)


@router.get("/status", response_model=StatusResponse)
async def watcher_status(_user: str = Depends(get_current_user)) -> StatusResponse:
    if _watcher is not None:
        return StatusResponse(
            running=_watcher.is_running,
            watch_dir=_watcher.watch_dir,
        )
    return StatusResponse(running=False, watch_dir=None)
