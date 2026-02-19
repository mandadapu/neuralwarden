# NeuralWarden — AI-Powered Cloud Security Platform

An agentic cloud security platform that combines **static vulnerability scanning**, **behavioral log analysis**, and **threat correlation** to detect active exploits across GCP infrastructure. Built with **LangGraph**, **Anthropic Claude**, **Next.js 16**, and **FastAPI**.

## What It Does

1. **Connects to your GCP project** — discovers VMs, firewalls, buckets, Cloud SQL
2. **Routes assets intelligently** — public assets get active compliance scans, private assets get log-based analysis
3. **Correlates findings** — cross-references scanner vulnerabilities with log activity to detect active exploits (e.g., open SSH port + brute force logs = active breach)
4. **Maps to MITRE ATT&CK** — every correlated finding gets tactic/technique IDs
5. **Generates incident reports** — prioritized action plans with business impact

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js 16 Frontend (port 3000)                                            │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │ Sidebar  │  │ Threat Feed  │  │ Cloud Detail     │  │ Configure     │   │
│  │ (11 nav  │  │ + Summary    │  │ SSE Scan Progress│  │ Modal         │   │
│  │  items)  │  │   Cards      │  │ Issues/Assets/VMs│  │ Creds/Services│   │
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
│  │                                                    Threat Pipeline   │   │
│  │                                              Detect→Validate→Classify│   │
│  │                                                    →HITL→Report     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  SQLite: cloud_accounts, cloud_issues, cloud_assets (per-user isolation)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 11 AI Agents

### Threat Pipeline (6 agents — LLM-powered)

| # | Agent | Model | Purpose |
|---|-------|-------|---------|
| 1 | **Ingest** | Haiku 4.5 | Parse raw logs into structured entries |
| 2 | **Detect** | Sonnet 4.5 | Rule-based + AI threat detection |
| 3 | **Validate** | Sonnet 4.5 | Shadow-check 5% of "clean" logs |
| 4 | **Classify** | Sonnet 4.5 | Risk scoring + MITRE ATT&CK + RAG |
| 5 | **HITL Gate** | — | Human-in-the-loop review for critical threats |
| 6 | **Report** | Opus 4.6 | Incident reports with action plans |

### Cloud Scan Super Agent (5 agents — deterministic, $0 cost)

| # | Agent | Purpose |
|---|-------|---------|
| 7 | **Discovery** | Enumerates GCP assets (VMs, buckets, firewalls, SQL) |
| 8 | **Router** | Routes assets to active scan (public) or log analysis (private) |
| 9 | **Active Scanner** | Compliance checks on public-facing assets |
| 10 | **Log Analyzer** | Queries Cloud Logging for behavioral signals |
| 11 | **Correlation Engine** | Cross-references scanner + log findings to detect active exploits |

### Correlation Intelligence Matrix

| Scanner Finds | Log Agent Finds | Verdict | MITRE |
|---|---|---|---|
| GCP_002 (Open SSH) | Failed password, Invalid user | Brute Force in Progress | T1110 |
| GCP_004 (Public Bucket) | AnonymousAccess, GetObject | Data Exfiltration | T1530 |
| GCP_006 (Default SA) | CreateServiceAccountKey | Privilege Escalation | T1078.004 |

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
```

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
# 38+ tests covering all agents, correlation engine, and pipeline
```

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | **Feed** | Summary cards, findings table, cost breakdown, incident report |
| `/snoozed` | **Snoozed** | Deferred threats with restore action |
| `/ignored` | **Ignored** | False positives / accepted risk |
| `/solved` | **Solved** | Resolved threats |
| `/autofix` | **AutoFix** | Automated remediation stats |
| `/clouds` | **Clouds** | Connected GCP accounts with issue counts |
| `/clouds/connect` | **Connect** | Add new GCP project with service account |
| `/clouds/[id]` | **Cloud Detail** | SSE scan progress, issues, assets, VMs, checks |
| `/agents` | **Agents** | 11 pipeline agents with status |
| `/mitre` | **MITRE ATT&CK** | Tactics and techniques reference |
| `/threat-intel` | **Threat Intel** | Pinecone vector DB threat feed |
| `/reports` | **Reports** | Generated incident reports with PDF export |
| `/pentests` | **Pentests** | Penetration testing tracker |
| `/integrations` | **Integrations** | Third-party service connections |

## Multi-Tenancy

Each user authenticates via Google OAuth. Cloud accounts, issues, and assets are isolated per `user_email`. The `X-User-Email` header is set by the frontend auth middleware. This supports both:

- **Multi-tenant SaaS** — each user sees only their own clouds
- **Single-tenant hosted** — deploy for one org with shared GCP credentials

## Project Structure

```
neuralwarden/
├── api/
│   ├── main.py                     # FastAPI app (CORS, routers)
│   ├── cloud_database.py           # Cloud accounts/issues/assets CRUD
│   ├── gcp_scanner.py              # GCP asset discovery + compliance checks
│   ├── gcp_logging.py              # Cloud Logging client + deterministic parser
│   └── routers/
│       ├── analyze.py              # POST /api/analyze (threat pipeline)
│       ├── clouds.py               # Cloud CRUD + SSE scan + issues/assets
│       ├── hitl.py                 # Human-in-the-loop resume
│       └── ...
├── pipeline/
│   ├── graph.py                    # Threat pipeline LangGraph
│   ├── cloud_scan_graph.py         # Cloud Scan Super Agent LangGraph
│   ├── cloud_scan_state.py         # ScanAgentState TypedDict
│   └── agents/
│       ├── ingest.py               # Haiku 4.5 log parser
│       ├── detect.py               # Sonnet 4.5 threat detection
│       ├── validate.py             # Sonnet 4.5 shadow validator
│       ├── classify.py             # Sonnet 4.5 risk scoring + RAG
│       ├── report.py               # Opus 4.6 incident reports
│       ├── cloud_router.py         # Public/private asset routing
│       ├── active_scanner.py       # Compliance checks for public assets
│       ├── log_analyzer.py         # Cloud Logging queries for private assets
│       └── correlation_engine.py   # Scanner + log cross-referencing
├── frontend/
│   └── src/
│       ├── app/(dashboard)/        # All dashboard pages
│       ├── app/(auth)/login/       # OAuth login
│       ├── components/             # 16 React components
│       ├── context/                # AnalysisContext (global state)
│       └── lib/                    # API client, types, constants
├── models/                         # Pydantic data models
├── rules/                          # Rule-based detection patterns
├── tests/                          # 38+ pytest tests
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
