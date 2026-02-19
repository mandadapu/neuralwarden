"""SSE streaming endpoint for real-time pipeline progress."""

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from api.schemas import AnalyzeRequest
from api.services_stream import stream_analysis

router = APIRouter(prefix="/api", tags=["stream"])


@router.post("/analyze/stream")
async def analyze_stream(req: AnalyzeRequest):
    """Stream pipeline progress as Server-Sent Events.

    Each event is a JSON object with an `event` field indicating the type:
    - agent_start: An agent is about to run
    - agent_complete: An agent finished
    - hitl_required: Pipeline paused for human review
    - complete: Pipeline finished with full response
    - error: Pipeline encountered an error
    """
    return EventSourceResponse(stream_analysis(req.logs, skip_ingest=req.skip_ingest))
