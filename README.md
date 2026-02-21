# NeuralWarden: Autonomous Multi-Agent Cloud Defense

An agentic cloud security platform that runs a fully **autonomous defense loop** — from asset discovery to vulnerability scanning, behavioral log analysis, threat correlation, MITRE ATT&CK mapping, incident reporting, and automated remediation. Built with **LangGraph**, **Anthropic Claude**, **Next.js 16**, and **FastAPI**.

**Three pillars:**
- **Neural Discovery** — maps your cloud attack surface autonomously across Compute, Storage, Firewall, SQL, and IAM
- **Agentic Analysis** — parallel workers investigate every resource with compliance checks and behavioral log queries
- **Automated Wardenship** — closes the loop with correlation-driven severity escalation and ready-to-run remediation scripts

## The Autonomous Defense Loop

```
  1. DISCOVER          2. ROUTE             3. INVESTIGATE
  ┌──────────┐      ┌──────────┐      ┌────────────────────┐
  │ Discovery│─────▶│  Router  │─────▶│ Active Scanner     │ (public assets)
  │   Node   │      │   Node   │      │ Log Analyzer       │ (private assets)
  └──────────┘      └──────────┘      └─────────┬──────────┘
       │                                         │
       │  Maps your GCP            Parallel       │  Compliance checks
       │  environment              fan-out        │  + Cloud Logging queries
       │                                         │
       ▼                                         ▼
  4. CORRELATE         5. REASON            6. REMEDIATE
  ┌──────────┐      ┌──────────────┐      ┌──────────────┐
  │Correlation│────▶│Threat Pipeline│────▶│ Remediation  │
  │  Engine   │     │ (6 LLM agents)│     │  Generator   │
  └──────────┘     └──────────────┘      └──────────────┘
       │                  │                      │
       │  Weakness +      │  Detect, Validate    │  gcloud scripts
       │  Attack =        │  Classify, HITL      │  per issue with
       │  Active Exploit  │  Report              │  copy/download
```

1. **Discovery Node** — maps the environment (VMs, firewalls, buckets, Cloud SQL, service accounts)
2. **Router Node** — intelligence-based triage, routes public assets to active scanning and private assets to log analysis
3. **Specialized Workers** — parallel investigation: compliance checks on public-facing assets, Cloud Logging queries on private assets
4. **Correlation Engine (Neural Core)** — the reasoning heart of NeuralWarden; connects the "weakness" to the "attack" by cross-referencing scanner vulnerabilities with live log activity, then threads evidence into the LLM layer for severity escalation
5. **Threat Pipeline (Neural Engine)** — 6 LLM-powered agents using Claude Sonnet as the reasoning engine for detection, validation, MITRE ATT&CK classification, human-in-the-loop review, and executive reporting
6. **Remediation Generator** — produces parameterized `gcloud` fix scripts for every detected issue, ready to copy or download as `.sh`

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js 16 Frontend (port 3000)                                            │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │ Sidebar  │  │ Threat Feed  │  │ Cloud Detail     │  │ AutoFix       │   │
│  │ (13 nav  │  │ + Summary    │  │ SSE Scan Progress│  │ Dashboard     │   │
│  │  items)  │  │   Cards      │  │ Issues/Assets/VMs│  │ + Fix Modal   │   │
│  └──────────┘  └──────────────┘  └──────────────────┘  └───────────────┘   │
│  Auth: Auth.js v5 (Google OAuth)  │  State: React Context + localStorage   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ HTTP + SSE (port 8000)
┌────────────────────────────────────▼────────────────────────────────────────┐
│  FastAPI Backend                                                            │
│                                                                             │
│  ┌─── Cloud Scan Super Agent (LangGraph) ──────────────────────────────┐   │
│  │                                                                      │   │
│  │  Discovery → Router → ┬─ Active Scanner (public) ─┐→ Aggregate     │   │
│  │                       └─ Log Analyzer (private)  ──┘  + Correlate   │   │
│  │                                                          │           │   │
│  │                                        Remediation ← Threat Pipeline │   │
│  │                                        Generator    Detect→Validate  │   │
│  │                                                     →Classify→HITL   │   │
│  │                                                     →Report          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─── Scan Execution Logs ─────────────────────────────────────────────┐   │
│  │  Per-service timing · Success/failure tracking · Historical logs    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  SQLite/PostgreSQL: cloud_accounts, cloud_issues, cloud_assets, scan_logs  │
│          pentests, pentest_findings, repo_connections, repo_issues, ...     │
│          (per-user isolation via X-User-Email)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 12 AI Agents

### Cloud Scan Super Agent (6 agents — deterministic, $0 LLM cost)

| # | Agent | Purpose |
|---|-------|---------|
| 1 | **Discovery** | Enumerates GCP assets across 5 services (Compute, Storage, Firewall, Cloud SQL, Cloud Logging) |
| 2 | **Router** | Routes public assets to active scanning, private assets to log-based analysis |
| 3 | **Active Scanner** | 10 compliance checks (GCP_001–010) on public-facing assets |
| 4 | **Log Analyzer** | Queries Cloud Logging for brute force, data exfiltration, privilege escalation signals |
| 5 | **Correlation Engine** (Neural Core) | The reasoning heart of NeuralWarden — cross-references scanner + log findings to detect active exploits with MITRE mapping. Returns evidence samples (up to 5 log lines) threaded into the Threat Pipeline for LLM reasoning |
| 6 | **Remediation Generator** | Maps rule_codes to parameterized `gcloud` fix scripts (6 templates) |

### Threat Pipeline — Neural Engine (6 agents — LLM-powered)

Claude Sonnet serves as the Neural Engine for high-reasoning classification and threat detection.

| # | Agent | Model | Purpose |
|---|-------|-------|---------|
| 7 | **Ingest** | Haiku 4.5 | Parse raw logs into structured entries |
| 8 | **Detect** | Sonnet 4.5 | Rule-based + AI threat detection |
| 9 | **Validate** | Haiku 4.5 | Shadow-check 5% of "clean" logs |
| 10 | **Classify** | Sonnet 4.5 | Risk scoring + MITRE ATT&CK + RAG. When `correlated_evidence` is present, injects `CORRELATION_ADDENDUM` to force-escalate severity and generate remediation commands |
| 11 | **HITL Gate** | — | Human-in-the-loop review for critical threats |
| 12 | **Report** | Haiku 4.5 | Incident reports with action plans. Leads with "Active Incidents" section when correlated evidence is threaded from Cloud Scan |

### Correlation Intelligence Matrix

The Correlation Engine uses a two-layer strategy: **deterministic first ($0), LLM second**. The engine matches scanner rule codes to log patterns, then threads evidence samples into the Classify Agent for reasoning.

| Scanner Finds | Log Agent Finds | Verdict | MITRE | LLM Action |
|---|---|---|---|---|
| GCP_002 (Open SSH) | Failed password, Invalid user | Brute Force in Progress | T1110 | Escalate to CRITICAL, generate `gcloud compute firewall-rules update` |
| GCP_004 (Public Bucket) | AnonymousAccess, GetObject | Data Exfiltration | T1530 | Escalate to CRITICAL, generate `gcloud storage buckets update` |
| GCP_006 (Default SA) | CreateServiceAccountKey | Privilege Escalation | T1078.004 | Escalate to CRITICAL, explain lateral movement risk |

**Evidence flow:** `correlate_findings()` → `correlated_evidence[]` (up to 5 log samples per finding) → `ScanAgentState` → `threat_pipeline_node` → `PipelineState` → Classify (`CORRELATION_ADDENDUM`) → Report ("Active Incidents" section)

### Remediation Templates

Every issue with a matching rule_code gets a ready-to-run `gcloud` script generated automatically after each scan. No LLM cost — pure template-based generation.

| Rule Code | Fix | Script |
|---|---|---|
| `gcp_002` | Restrict SSH firewall to trusted CIDRs | `gcloud compute firewall-rules update {asset} --source-ranges=...` |
| `gcp_004` | Remove public access from GCS bucket | `gcloud storage buckets update gs://{asset} --public-access-prevention=enforced` |
| `gcp_006` | Migrate from default service account | Multi-step: create custom SA, grant roles, update instance |
| `log_001` | Investigate high error rate | `gcloud logging read 'severity>=ERROR' --project=... --limit=50` |
| `log_002` | Enable audit logging | Fetch auth failures + enable Data Access audit logging |
| `log_003` | Deploy Cloud Armor WAF rules | Create security policy + block recon paths |

Scripts include `#!/bin/bash` headers, `set -euo pipefail`, contextual comments, and safety notes. Users can **copy to clipboard** or **download as `.sh`** from the Fix modal.

### Scan Execution Logs

Every scan run produces a structured execution log capturing:
- **Per-service timing** — how long each service (compute, storage, cloud_logging) took
- **Success/failure status** — which services succeeded, failed, or were skipped
- **Asset and issue counts** — per-service breakdown
- **Timestamped log entries** — detailed trace of scan operations

Scan logs are accessible via "View Scan Log" after each scan and from the historical **Scan Logs** tab.

## Setup

```bash
# Clone and create venv
python3.13 -m venv .venv
source .venv/bin/activate

# Install backend
pip install -e ".[dev]"

# Install frontend
cd frontend && npm install && cd ..

# Configure
cp .env.example .env
# Required:
#   ANTHROPIC_API_KEY
#   AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET  (for OAuth)
#   AUTH_SECRET                           (for session encryption)
# Optional:
#   OPENAI_API_KEY     (for RAG embeddings)
#   PINECONE_API_KEY   (for RAG vector store)
#   GITHUB_TOKEN       (for repository scanning)
```

### GCP Service Account

To scan a GCP project, create a service account with these roles:

| Role | Purpose |
|------|---------|
| `roles/compute.viewer` | Discover VMs, firewalls, networks |
| `roles/storage.objectViewer` | Discover Cloud Storage buckets |
| `roles/logging.viewer` | Query Cloud Logging for behavioral signals |
| `roles/cloudasset.viewer` | Optional — Cloud Asset Inventory |

Download the JSON key and paste it into the **Configure** modal in the app.

## Usage

```bash
# Terminal 1: Backend
uvicorn api.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev
# Opens at http://localhost:3000
```

### CLI

```bash
python main.py sample_logs/brute_force.txt
python main.py sample_logs/mixed_threats.txt --hitl
```

### Tests

```bash
# Run with project venv (has all deps)
.venv/bin/python -m pytest tests/ -v
# 247 tests across 29 files covering all agents, correlation engine, pipelines, and API routers
```

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | **Feed** | Summary cards, findings table, cost breakdown, incident report |
| `/snoozed` | **Snoozed** | Deferred threats with restore action |
| `/ignored` | **Ignored** | False positives / accepted risk |
| `/resolved` | **Resolved** | Resolved threats |
| `/autofix` | **AutoFix** | Live remediation dashboard — available fixes, applied, skipped counts + issue table with "View Fix" |
| `/clouds` | **Clouds** | Connected GCP accounts with issue counts |
| `/clouds/connect` | **Connect** | Add new GCP project with service account |
| `/clouds/[id]` | **Cloud Detail** | SSE scan progress, issues with Fix button, assets, VMs, checks, scan logs |
| `/repositories` | **Repositories** | Connected GitHub repositories with issue counts |
| `/repositories/connect` | **Connect Repo** | Add new GitHub repository connection |
| `/repositories/[id]` | **Repo Detail** | SSE scan progress, issues, assets, scan logs |
| `/agents` | **Agents** | 12 pipeline agents with status |
| `/mitre` | **MITRE ATT&CK** | Tactics and techniques reference |
| `/threat-intel` | **Threat Intel** | Pinecone vector DB threat feed |
| `/reports` | **Reports** | Generated incident reports with PDF export |
| `/pentests` | **Pentests** | Penetration testing campaigns |
| `/pentests/[id]` | **Pentest Detail** | Campaign findings and timeline |
| `/pentests/checks` | **Pentest Checks** | Security check catalog (13 categories) |
| `/integrations` | **Integrations** | Third-party service connections |

## Multi-Tenancy

Each user authenticates via Google OAuth. Cloud accounts, repositories, pentests, issues, and assets are isolated per `user_email`. The `X-User-Email` header is set by the frontend auth middleware. This supports both:

- **Multi-tenant SaaS** — each user sees only their own data
- **Single-tenant hosted** — deploy for one org with shared credentials

## Project Structure

```
neuralwarden/
├── api/
│   ├── main.py                     # FastAPI app (CORS, routers)
│   ├── db.py                       # DB abstraction (SQLite/PostgreSQL)
│   ├── cloud_database.py           # Cloud accounts/issues/assets/scan_logs CRUD
│   ├── repo_database.py            # Repo connections/issues/assets/scan_logs CRUD
│   ├── pentests_database.py        # Pentests/findings/checks CRUD
│   ├── database.py                 # Analysis report persistence
│   ├── gcp_scanner.py              # GCP asset discovery + compliance checks
│   ├── gcp_logging.py              # Cloud Logging client + deterministic parser
│   ├── github_scanner.py           # GitHub repository scanning
│   └── routers/
│       ├── analyze.py              # POST /api/analyze (threat pipeline)
│       ├── clouds.py               # Cloud CRUD + SSE scan + issues/assets/scan-logs
│       ├── repos.py                # Repo CRUD + SSE scan + issues/assets/scan-logs
│       ├── pentests.py             # Pentest campaigns + findings + checks
│       ├── reports.py              # Report listing + retrieval
│       ├── hitl.py                 # Human-in-the-loop resume
│       ├── samples.py              # Sample log scenarios
│       ├── generator.py            # Log generation
│       ├── stream.py               # Streaming analysis
│       ├── gcp_logging.py          # GCP logging status + fetch
│       ├── threat_intel.py         # Threat intelligence feed
│       ├── watcher.py              # Monitoring watchers
│       └── export.py               # Export functionality
├── pipeline/
│   ├── graph.py                    # Threat pipeline LangGraph
│   ├── cloud_scan_graph.py         # Cloud Scan Super Agent LangGraph
│   ├── cloud_scan_state.py         # ScanAgentState TypedDict
│   └── agents/
│       ├── ingest.py               # Haiku 4.5 log parser
│       ├── ingest_chunk.py         # Chunked log batch ingestion
│       ├── detect.py               # Sonnet 4.5 threat detection
│       ├── validate.py             # Sonnet 4.5 shadow validator
│       ├── classify.py             # Sonnet 4.5 risk scoring + RAG
│       ├── report.py               # Opus 4.6 incident reports
│       ├── hitl.py                 # Human-in-the-loop interrupt
│       ├── cloud_router.py         # Public/private asset routing
│       ├── active_scanner.py       # Compliance checks for public assets
│       ├── log_analyzer.py         # Cloud Logging queries for private assets
│       ├── correlation_engine.py   # Scanner + log cross-referencing
│       └── remediation_generator.py # Deterministic gcloud fix scripts
├── frontend/
│   └── src/
│       ├── app/(dashboard)/        # All dashboard pages
│       ├── app/(auth)/login/       # OAuth login
│       ├── components/             # 24 React components
│       ├── context/                # AnalysisContext (global state)
│       └── lib/                    # API client (62 functions), types, taxonomy, remediation
├── models/                         # Pydantic data models
├── rules/                          # Rule-based detection patterns
├── tests/                          # 247 pytest tests across 29 files
├── docs/
│   ├── API.md                      # REST API reference
│   ├── ARCHITECTURE.md             # System design document
│   └── VISION.md                   # Product vision
└── sample_logs/                    # Test scenarios
```

## Docs

- [API Reference](docs/API.md) — REST endpoints, schemas, SSE events
- [Architecture](docs/ARCHITECTURE.md) — System design, agent pipeline, data flow
- [Vision](docs/VISION.md) — Product direction and roadmap
