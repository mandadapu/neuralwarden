"""GET /api/scenarios and POST /api/generate — mock attack log generation."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from scripts.attack_generator import AttackGenerator

router = APIRouter(prefix="/api", tags=["generator"])


class GenerateRequest(BaseModel):
    scenario: str = Field(default="apt_intrusion")
    count: int = Field(default=50, ge=10, le=500)
    noise: float = Field(default=0.6, ge=0.0, le=0.9)


@router.get("/scenarios")
async def list_scenarios():
    gen = AttackGenerator()
    return {"scenarios": gen.list_scenarios()}


@router.post("/generate")
async def generate_logs(req: GenerateRequest):
    gen = AttackGenerator()
    logs = gen.generate(req.scenario, log_count=req.count, noise_ratio=req.noise)
    return {"scenario": req.scenario, "log_count": len(logs), "logs": "\n".join(logs)}
