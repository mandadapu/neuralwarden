"""PDF export endpoint for incident reports."""

from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.database import get_analysis
from api.pdf_generator import generate_pdf

router = APIRouter(prefix="/api", tags=["export"])


@router.get("/reports/{analysis_id}/pdf")
async def download_pdf(analysis_id: str):
    """Download an incident report as a PDF."""
    analysis = get_analysis(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    pdf_bytes = generate_pdf(analysis)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="incident-report-{analysis_id[:8]}.pdf"',
        },
    )
