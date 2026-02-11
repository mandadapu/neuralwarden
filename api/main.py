"""FastAPI backend for the AI NeuralWarden Pipeline."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import analyze, hitl, samples

app = FastAPI(title="NeuralWarden API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(hitl.router)
app.include_router(samples.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
