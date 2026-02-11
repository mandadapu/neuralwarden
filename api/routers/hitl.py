"""POST /api/hitl/{thread_id}/resume — resume pipeline after HITL review."""

import asyncio

from fastapi import APIRouter, HTTPException

from api.schemas import HitlResumeRequest, AnalysisResponse
from api.services import resume_analysis

router = APIRouter(prefix="/api", tags=["hitl"])


@router.post("/hitl/{thread_id}/resume", response_model=AnalysisResponse)
async def hitl_resume(
    thread_id: str, req: HitlResumeRequest
) -> AnalysisResponse:
    if not thread_id:
        raise HTTPException(status_code=400, detail="Missing thread_id")
    return await asyncio.to_thread(
        resume_analysis, thread_id, req.decision, req.notes
    )
