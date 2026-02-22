"""FastAPI backend for the NeuralWarden AI Security Pipeline."""

from dotenv import load_dotenv

load_dotenv()

import os

# LangSmith tracing (optional — enable by setting LANGSMITH_API_KEY)
if os.getenv("LANGSMITH_API_KEY"):
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_PROJECT", os.getenv("LANGCHAIN_PROJECT", "neuralwarden-pipeline"))

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from api.database import init_db
from api.cloud_database import init_cloud_tables, seed_cloud_checks
from api.pentests_database import init_pentest_tables, seed_pentest_checks
from api.repo_database import init_repo_tables
from api.routers import analyze, clouds, export, gcp_logging, generator, hitl, pentests, repos, reports, samples, stream, threat_intel, watcher

# --------------- Rate limiter ---------------

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

app = FastAPI(title="NeuralWarden API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Initialize database on startup (SQLite or PostgreSQL via DATABASE_URL)
# Retry for Cloud SQL proxy socket availability on Cloud Run
import time as _time
for _attempt in range(5):
    try:
        init_db()
        init_cloud_tables()
        seed_cloud_checks()
        init_pentest_tables()
        seed_pentest_checks()
        init_repo_tables()
        break
    except Exception as _e:
        if _attempt < 4:
            _time.sleep(2)
        else:
            raise

# --------------- Security headers middleware ---------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # HSTS only in production (behind HTTPS)
        if os.getenv("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# --------------- Request size limit middleware ---------------

# 10 MB default, keeps large payloads from exhausting memory
MAX_REQUEST_BYTES = int(os.getenv("MAX_REQUEST_BYTES", str(10 * 1024 * 1024)))

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_BYTES:
            return Response(
                content='{"detail":"Request body too large"}',
                status_code=413,
                media_type="application/json",
            )
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware)

# --------------- CORS ---------------

_default_origins = "http://localhost:3000,http://localhost:3001"
_origins = os.getenv("CORS_ORIGINS", _default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["authorization", "content-type", "x-github-token"],
)

# --------------- Routers ---------------

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
app.include_router(pentests.router)
app.include_router(repos.router)
app.include_router(threat_intel.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
