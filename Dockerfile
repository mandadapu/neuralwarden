# Backend Dockerfile — FastAPI + LangGraph
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies (gcc + libpq for psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency file and install
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[gcp]" || pip install --no-cache-dir .

# Copy application code
COPY api/ ./api/
COPY pipeline/ ./pipeline/
COPY .env.example ./.env.example

# Create data directory for SQLite
RUN mkdir -p /app/data

# Cloud Run sets PORT env var
ENV PORT=8000

EXPOSE ${PORT}

CMD exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT}
