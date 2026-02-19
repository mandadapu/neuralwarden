"""SSE streaming endpoint for real-time pipeline progress."""

from fastapi import APIRouter, Header
from sse_starlette.sse import EventSourceResponse

from api.schemas import AnalyzeRequest
from api.services_stream import stream_analysis

router = APIRouter(prefix="/api", tags=["stream"])


@router.post("/analyze/stream")
async def analyze_stream(req: AnalyzeRequest, x_user_email: str = Header("")):
    """Stream pipeline progress as Server-Sent Events."""
    return EventSourceResponse(
        stream_analysis(req.logs, skip_ingest=req.skip_ingest, user_email=x_user_email)
    )
