"""POST /api/analyze — run the NeuralWarden pipeline."""

import asyncio

from fastapi import APIRouter

from api.schemas import AnalyzeRequest, AnalysisResponse
from api.services import run_analysis

router = APIRouter(prefix="/api", tags=["analyze"])


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(req: AnalyzeRequest) -> AnalysisResponse:
    return await asyncio.to_thread(run_analysis, req.logs)
