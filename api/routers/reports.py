"""Report history endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user
from api.database import get_analysis, list_analyses

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/reports")
async def list_reports(limit: int = 50, user_email: str = Depends(get_current_user)):
    """List recent analyses for the current user."""
    return {"reports": list_analyses(limit=limit, user_email=user_email)}


@router.get("/reports/latest")
async def get_latest_report(user_email: str = Depends(get_current_user)):
    """Get the most recent analysis for the current user."""
    reports = list_analyses(limit=1, user_email=user_email)
    if not reports:
        return None
    result = get_analysis(reports[0]["id"])
    if not result:
        return None
    return result.get("full_response_json", {})


@router.get("/reports/{analysis_id}")
async def get_report(analysis_id: str, user_email: str = Depends(get_current_user)):
    """Get a full analysis by ID."""
    result = get_analysis(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return result
