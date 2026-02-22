"""POST /api/analyze — run the NeuralWarden pipeline."""

import asyncio

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.auth import get_current_user
from api.schemas import AnalyzeRequest, AnalysisResponse
from api.services import run_analysis

router = APIRouter(prefix="/api", tags=["analyze"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("10/minute")
async def analyze(request: Request, req: AnalyzeRequest, user_email: str = Depends(get_current_user)) -> AnalysisResponse:
    return await asyncio.to_thread(run_analysis, req.logs, user_email=user_email)
