"""Report history endpoints."""

from fastapi import APIRouter, Header, HTTPException

from api.database import get_analysis, list_analyses

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/reports")
async def list_reports(limit: int = 50, x_user_email: str = Header("")):
    """List recent analyses for the current user."""
    return {"reports": list_analyses(limit=limit, user_email=x_user_email)}


@router.get("/reports/latest")
async def get_latest_report(x_user_email: str = Header("")):
    """Get the most recent analysis for the current user."""
    reports = list_analyses(limit=1, user_email=x_user_email)
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
