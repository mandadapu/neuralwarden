"""POST /api/analyze — run the NeuralWarden pipeline."""

import asyncio

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.schemas import AnalyzeRequest, AnalysisResponse
from api.services import run_analysis

router = APIRouter(prefix="/api", tags=["analyze"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("10/minute")
async def analyze(request: Request, req: AnalyzeRequest) -> AnalysisResponse:
    return await asyncio.to_thread(run_analysis, req.logs)
