"""Watcher router — start/stop/status for the log-file watcher."""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from pipeline.watcher import LogWatcher

router = APIRouter(prefix="/api/watcher", tags=["watcher"])

_watcher: LogWatcher | None = None


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
    except Exception:
        pass


@router.post("/start", response_model=StatusResponse)
async def start_watcher(req: StartRequest) -> StatusResponse:
    global _watcher

    # Stop any existing watcher first
    if _watcher is not None and _watcher.is_running:
        await asyncio.to_thread(_watcher.stop)

    watch_path = Path(req.watch_dir)
    watch_path.mkdir(parents=True, exist_ok=True)

    _watcher = LogWatcher(
        watch_dir=str(watch_path),
        callback=_on_file_detected,
    )
    await asyncio.to_thread(_watcher.start)

    return StatusResponse(running=True, watch_dir=str(watch_path))


@router.post("/stop", response_model=StatusResponse)
async def stop_watcher() -> StatusResponse:
    global _watcher

    if _watcher is not None:
        await asyncio.to_thread(_watcher.stop)
        watch_dir = _watcher.watch_dir
        _watcher = None
        return StatusResponse(running=False, watch_dir=watch_dir)

    return StatusResponse(running=False, watch_dir=None)


@router.get("/status", response_model=StatusResponse)
async def watcher_status() -> StatusResponse:
    if _watcher is not None:
        return StatusResponse(
            running=_watcher.is_running,
            watch_dir=_watcher.watch_dir,
        )
    return StatusResponse(running=False, watch_dir=None)
