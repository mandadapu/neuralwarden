# Backend Dockerfile — FastAPI + LangGraph
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies (gcc + libpq for psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy project files and install dependencies
COPY pyproject.toml ./
COPY api/ ./api/
COPY pipeline/ ./pipeline/
COPY models/ ./models/
COPY rules/ ./rules/
COPY scripts/ ./scripts/
COPY sample_logs/ ./sample_logs/
COPY data/ ./data/

RUN pip install --no-cache-dir ".[gcp]"

# Cloud Run injects PORT (default 8080)
ENV PORT=8080

EXPOSE ${PORT}

CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
