"""Threat intelligence endpoints — stats, browsing, and semantic search."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from api.auth import get_current_user
from pipeline.vector_store import (
    get_pinecone_stats,
    list_threat_intel_entries,
    query_threat_intel,
)

router = APIRouter(prefix="/api/threat-intel", tags=["threat-intel"])


# ── GET /api/threat-intel/stats ──────────────────────────────────────────────

@router.get("/stats")
async def stats(_user: str = Depends(get_current_user)):
    """Return Pinecone connection status and total vector count."""
    return get_pinecone_stats()


# ── GET /api/threat-intel/entries ────────────────────────────────────────────

@router.get("/entries")
async def entries(category: str | None = Query(None, description="Filter: cve, threat_pattern, owasp_agentic"), _user: str = Depends(get_current_user)):
    """List knowledge base entries from seed data, optionally filtered by category."""
    return list_threat_intel_entries(category)


# ── POST /api/threat-intel/search ────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


@router.post("/search")
async def search(req: SearchRequest, _user: str = Depends(get_current_user)):
    """Semantic search over Pinecone threat intelligence vectors."""
    results = query_threat_intel(req.query, top_k=req.top_k)
    return {"results": results}
