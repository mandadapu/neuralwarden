"""FastAPI backend for the NeuralWarden AI Security Pipeline."""

from dotenv import load_dotenv

load_dotenv()

import os

# LangSmith tracing (optional — enable by setting LANGSMITH_API_KEY)
if os.getenv("LANGSMITH_API_KEY"):
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_PROJECT", os.getenv("LANGCHAIN_PROJECT", "neuralwarden-pipeline"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.database import init_db
from api.cloud_database import init_cloud_tables, seed_cloud_checks
from api.routers import analyze, clouds, export, gcp_logging, generator, hitl, reports, samples, stream, watcher

app = FastAPI(title="NeuralWarden API", version="2.0.0")

# Initialize database on startup (SQLite or PostgreSQL via DATABASE_URL)
init_db()
init_cloud_tables()
seed_cloud_checks()

_default_origins = "http://localhost:3000,http://localhost:3001"
_origins = os.getenv("CORS_ORIGINS", _default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(export.router)
app.include_router(gcp_logging.router)
app.include_router(generator.router)
app.include_router(hitl.router)
app.include_router(reports.router)
app.include_router(samples.router)
app.include_router(stream.router)
app.include_router(watcher.router)
app.include_router(clouds.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
