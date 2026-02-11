"""GET /api/samples — list and load sample log scenarios."""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from api.schemas import SampleInfo, SampleContent, SamplesListResponse

router = APIRouter(prefix="/api", tags=["samples"])

SAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "sample_logs"

SAMPLE_MAP = {
    "brute_force": "Brute Force Attack",
    "data_exfiltration": "Data Exfiltration",
    "mixed_threats": "Mixed Threats (Multi-Stage)",
    "clean_logs": "Clean Logs (No Threats)",
}


@router.get("/samples", response_model=SamplesListResponse)
async def list_samples() -> SamplesListResponse:
    return SamplesListResponse(
        samples=[SampleInfo(id=k, name=v) for k, v in SAMPLE_MAP.items()]
    )


@router.get("/samples/{sample_id}", response_model=SampleContent)
async def get_sample(sample_id: str) -> SampleContent:
    if sample_id not in SAMPLE_MAP:
        raise HTTPException(status_code=404, detail=f"Unknown sample: {sample_id}")
    path = SAMPLES_DIR / f"{sample_id}.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Sample file not found: {path}")
    return SampleContent(
        id=sample_id,
        name=SAMPLE_MAP[sample_id],
        content=path.read_text(),
    )
