#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# NeuralWarden — One-time GCP setup for Cloud Run deployment
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - GitHub repo: mandadapu/neuralwarden
#
# Usage:
#   ./deploy/setup-gcp.sh <GCP_PROJECT_ID>
# ─────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <GCP_PROJECT_ID>}"
REGION="us-central1"
REPO_NAME="neuralwarden"
GITHUB_REPO="mandadapu/neuralwarden"
SA_NAME="neuralwarden-deploy"
WIF_POOL="github-actions-pool"
WIF_PROVIDER="github-actions-provider"

echo "==> Setting project to ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

# Enable required APIs
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sqladmin.googleapis.com \
  --quiet

# Create Artifact Registry repository
echo "==> Creating Artifact Registry repo..."
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="NeuralWarden container images" \
  2>/dev/null || echo "  (repo already exists)"

# Create service account for GitHub Actions
echo "==> Creating service account..."
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="NeuralWarden GitHub Actions Deploy" \
  2>/dev/null || echo "  (service account already exists)"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant roles to service account
echo "==> Granting IAM roles..."
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet > /dev/null
done

# Set up Workload Identity Federation (keyless auth for GitHub Actions)
echo "==> Setting up Workload Identity Federation..."

gcloud iam workload-identity-pools create "${WIF_POOL}" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  2>/dev/null || echo "  (pool already exists)"

gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
  --location="global" \
  --workload-identity-pool="${WIF_POOL}" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  2>/dev/null || echo "  (provider already exists)"

# Allow GitHub repo to impersonate the service account
WIF_POOL_ID=$(gcloud iam workload-identity-pools describe "${WIF_POOL}" \
  --location="global" --format="value(name)")

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WIF_POOL_ID}/attribute.repository/${GITHUB_REPO}" \
  --quiet > /dev/null

# ── Cloud SQL setup ─────────────────────────────────────────────
DB_INSTANCE="neuralwarden-db"
DB_NAME="neuralwarden"
DB_USER="neuralwarden"
DB_PASSWORD=$(openssl rand -base64 24)

echo "==> Creating Cloud SQL PostgreSQL instance..."
gcloud sql instances create "${DB_INSTANCE}" \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --storage-auto-increase \
  --no-assign-ip \
  --network=default \
  2>/dev/null || echo "  (instance already exists)"

echo "==> Creating database and user..."
gcloud sql databases create "${DB_NAME}" \
  --instance="${DB_INSTANCE}" \
  2>/dev/null || echo "  (database already exists)"

gcloud sql users create "${DB_USER}" \
  --instance="${DB_INSTANCE}" \
  --password="${DB_PASSWORD}" \
  2>/dev/null || echo "  (user already exists — password NOT changed)"

# Build connection string for Cloud SQL via Unix socket (Cloud Run)
DB_CONNECTION_NAME=$(gcloud sql instances describe "${DB_INSTANCE}" \
  --format="value(connectionName)" 2>/dev/null || echo "${PROJECT_ID}:${REGION}:${DB_INSTANCE}")

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${DB_CONNECTION_NAME}"

# Print values needed for GitHub Secrets
WIF_PROVIDER_FULL=$(gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
  --location="global" \
  --workload-identity-pool="${WIF_POOL}" \
  --format="value(name)")

echo ""
echo "==========================================="
echo "  GCP setup complete!"
echo "==========================================="
echo ""
echo "Add these GitHub repository secrets:"
echo ""
echo "  GCP_PROJECT_ID          = ${PROJECT_ID}"
echo "  WIF_PROVIDER            = ${WIF_PROVIDER_FULL}"
echo "  WIF_SERVICE_ACCOUNT     = ${SA_EMAIL}"
echo ""
echo "  ANTHROPIC_API_KEY       = <your-api-key>"
echo "  AUTH_SECRET              = <random-32-byte-string>"
echo "  AUTH_GITHUB_ID           = <github-oauth-id>"
echo "  AUTH_GITHUB_SECRET       = <github-oauth-secret>"
echo "  AUTH_GOOGLE_ID           = <google-oauth-id>"
echo "  AUTH_GOOGLE_SECRET       = <google-oauth-secret>"
echo "  FRONTEND_URL             = <cloud-run-frontend-url>  (set after first deploy)"
echo "  DATABASE_URL             = ${DATABASE_URL}"
echo "  PINECONE_API_KEY         = <optional>"
echo "  PINECONE_INDEX_NAME      = <optional>"
echo ""
echo "Cloud SQL instance: ${DB_INSTANCE}"
echo "Connection name:    ${DB_CONNECTION_NAME}"
echo ""
echo "Then push to main to trigger deployment."
