"""SSE streaming endpoint for real-time pipeline progress."""

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sse_starlette.sse import EventSourceResponse

from api.auth import get_current_user
from api.schemas import AnalyzeRequest
from api.services_stream import stream_analysis

router = APIRouter(prefix="/api", tags=["stream"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/analyze/stream")
@limiter.limit("10/minute")
async def analyze_stream(request: Request, req: AnalyzeRequest, user_email: str = Depends(get_current_user)):
    """Stream pipeline progress as Server-Sent Events."""
    return EventSourceResponse(
        stream_analysis(req.logs, skip_ingest=req.skip_ingest, user_email=user_email)
    )
