"""Report history endpoints."""

from fastapi import APIRouter, HTTPException

from api.database import get_analysis, list_analyses

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/reports")
async def list_reports(limit: int = 50):
    """List recent analyses."""
    return {"reports": list_analyses(limit=limit)}


@router.get("/reports/latest")
async def get_latest_report():
    """Get the most recent analysis (full response)."""
    reports = list_analyses(limit=1)
    if not reports:
        return None
    result = get_analysis(reports[0]["id"])
    if not result:
        return None
    return result.get("full_response_json", {})


@router.get("/reports/{analysis_id}")
async def get_report(analysis_id: str):
    """Get a full analysis by ID."""
    result = get_analysis(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result
