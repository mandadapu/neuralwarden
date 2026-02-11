# AI NeuralWarden Pipeline v2.0

A multi-agent security log analysis platform with a **Next.js** dashboard and **FastAPI** backend, powered by **LangGraph** + **Anthropic Claude** with multi-model routing, shadow validation, RAG threat intelligence, and human-in-the-loop review.

## Architecture

### Pipeline

```
START
  │
  [should_burst?] ─── >1000 logs ──→ ingest_chunk (x N parallel) → aggregate
  │                                                                    │
  ▼                                                                    ▼
[ingest] ──── valid logs? ──→ [detect] ──→ [validate] ──── threats? ──→ [classify + RAG]
  │ No                                                      │ No           │
  ▼                                                         ▼             [should_hitl?]
empty_report → END                                    clean_report → END  │          │
                                                                          ▼          ▼
                                                                    hitl_review   report → END
                                                                          │
                                                                       report → END
```

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js 16 Frontend (port 3000)                                    │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────────┐   │
│  │ Sidebar  │  │ Threat Feed  │  │ Threat Detail Slide-Out     │   │
│  │ (nav +   │  │ + Summary    │  │ (severity gauge, tabs,      │   │
│  │  counts) │  │   Cards      │  │  MITRE, remediation,        │   │
│  │          │  │              │  │  actions dropdown)          │   │
│  └──────────┘  └──────────────┘  └─────────────────────────────┘   │
│  State: React Context + localStorage persistence                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP (port 8000)
┌───────────────────────────────▼─────────────────────────────────────┐
│  FastAPI Backend                                                     │
│  POST /api/analyze  │  POST /api/hitl/{id}/resume  │  GET /api/samples │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  LangGraph Pipeline (5 agents + validator)                     │  │
│  │  Ingest(Haiku) → Detect(Sonnet) → Validate(Sonnet)           │  │
│  │  → Classify(Sonnet+RAG) → HITL → Report(Opus)                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 5 Specialized Agents + 1 Validator

| Agent | Model | Cost | Purpose |
|-------|-------|------|---------|
| **Ingest** | Haiku 4.5 | $0.25/MTok | Parse raw logs into structured entries |
| **Detect** | Sonnet 4.5 | $3.00/MTok | Rule-based + AI threat detection |
| **Validate** | Sonnet 4.5 | $3.00/MTok | Shadow-check 5% of "clean" logs |
| **Classify** | Sonnet 4.5 | $3.00/MTok | Risk-score threats + MITRE ATT&CK + RAG |
| **Report** | Opus 4.6 | $15.00/MTok | Dual-audience incident reports |

### Key Features

1. **Next.js Dashboard** — Threat feed with detail slide-out panel, actions (snooze/ignore/solve), sidebar navigation with live counts
2. **FastAPI REST API** — `/api/analyze`, `/api/hitl/{id}/resume`, `/api/samples` endpoints with CORS support
3. **Validator Agent** — Samples 5% of "clean" logs and checks for missed threats
4. **RAG Threat Intelligence** — Pinecone vector DB with CVE data enriches classification
5. **Human-in-the-Loop** — LangGraph `interrupt()` pauses for critical threats; approve/reject UI
6. **Burst Mode** — Parallel ingest via `Send` API for >1000 logs
7. **Agent Metrics** — Per-agent cost, latency, and token tracking
8. **Persistent State** — Analysis results and threat actions persist across navigation via React Context + localStorage

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
# Add your API keys to .env:
#   ANTHROPIC_API_KEY  (required)
#   OPENAI_API_KEY     (for RAG embeddings)
#   PINECONE_API_KEY   (for RAG vector store)
```

### Seed Pinecone (optional, for RAG)

```bash
python scripts/seed_pinecone.py
```

## Usage

### Web Dashboard (recommended)

```bash
# Terminal 1: Start FastAPI backend
uvicorn api.main:app --reload --port 8000

# Terminal 2: Start Next.js frontend
cd frontend && npm run dev
# Opens at http://localhost:3000
```

### CLI
```bash
python main.py sample_logs/brute_force.txt
python main.py sample_logs/mixed_threats.txt
python main.py sample_logs/clean_logs.txt

# With human-in-the-loop for critical threats
python main.py sample_logs/brute_force.txt --hitl
```

### Tests
```bash
pytest tests/ -v
```

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | **Threat Feed** | Log input, analysis, summary cards, findings table with detail panel |
| `/snoozed` | **Snoozed** | Deferred threats with restore action |
| `/ignored` | **Ignored** | False positives / accepted risk with restore action |
| `/solved` | **Solved** | Resolved threats with reopen action |
| `/autofix` | **Autofix** | Automated fix statistics |
| `/log-sources` | **Log Sources** | Connected log source configuration |
| `/agents` | **Agents** | Pipeline agent status and models |
| `/mitre` | **MITRE ATT&CK** | Tactics and techniques reference |
| `/threat-intel` | **Threat Intel** | Pinecone vector DB threat feed |
| `/reports` | **Reports** | Generated incident reports |
| `/pentests` | **Pentests** | Penetration testing tracker |
| `/integrations` | **Integrations** | Third-party service connections |

## Sample Logs

| File | Scenario | Expected Threats |
|------|----------|-----------------|
| `brute_force.txt` | SSH brute force + privilege escalation | 2+ threats (critical/high) |
| `data_exfiltration.txt` | Large outbound transfers | 1+ data exfil threat |
| `mixed_threats.txt` | Port scan + brute force + lateral movement + exfil | 4+ threats |
| `clean_logs.txt` | Normal operations | 0 threats (short-circuit) |

## Project Structure

```
neuralwarden/
├── main.py                         # CLI entry point
├── api/
│   ├── main.py                     # FastAPI app (CORS, routers)
│   ├── schemas.py                  # Pydantic request/response schemas
│   ├── services.py                 # Pipeline orchestration service
│   └── routers/
│       ├── analyze.py              # POST /api/analyze
│       ├── hitl.py                 # POST /api/hitl/{id}/resume
│       └── samples.py             # GET /api/samples
├── frontend/
│   ├── package.json                # Next.js 16 + React 19
│   └── src/
│       ├── app/
│       │   ├── layout.tsx          # Root layout (Sidebar + Topbar + AnalysisProvider)
│       │   ├── page.tsx            # Main threat feed dashboard
│       │   ├── globals.css         # Tailwind v4 theme (blue/navy)
│       │   ├── snoozed/page.tsx    # Snoozed threats
│       │   ├── ignored/page.tsx    # Ignored threats
│       │   ├── solved/page.tsx     # Solved threats
│       │   └── ...                 # 8 more route pages
│       ├── components/
│       │   ├── Sidebar.tsx         # Navigation with live counts
│       │   ├── Topbar.tsx          # Header bar
│       │   ├── ThreatsTable.tsx    # Findings table with clickable rows
│       │   ├── ThreatDetailPanel.tsx # Slide-out detail panel + actions
│       │   ├── SeverityGauge.tsx   # SVG semicircular risk gauge
│       │   ├── SeverityBadge.tsx   # Colored severity pill
│       │   ├── ThreatTypeIcon.tsx  # Threat type SVG icons
│       │   ├── SummaryCards.tsx    # Stats cards (threats, logs, cost)
│       │   ├── LogInput.tsx        # Log paste textarea
│       │   ├── HitlReviewPanel.tsx # HITL approve/reject UI
│       │   ├── IncidentReport.tsx  # Report renderer
│       │   ├── CostBreakdown.tsx   # Agent cost breakdown
│       │   └── PageShell.tsx       # Shared sub-page layout
│       ├── context/
│       │   └── AnalysisContext.tsx  # Global state + localStorage persistence
│       └── lib/
│           ├── api.ts              # Backend API client
│           ├── types.ts            # TypeScript interfaces
│           ├── constants.ts        # Severity colors, labels
│           └── remediation.ts      # Threat remediation guidance
├── pipeline/
│   ├── state.py                    # PipelineState TypedDict
│   ├── graph.py                    # LangGraph StateGraph v2.0
│   ├── metrics.py                  # AgentTimer cost/latency tracking
│   ├── vector_store.py             # Pinecone RAG wrapper
│   └── agents/
│       ├── ingest.py               # Haiku 4.5
│       ├── ingest_chunk.py         # Burst mode chunk processor
│       ├── detect.py               # Sonnet 4.5
│       ├── validate.py             # Sonnet 4.5 (shadow validator)
│       ├── classify.py             # Sonnet 4.5 (+ RAG)
│       ├── hitl.py                 # Human-in-the-loop interrupt
│       └── report.py               # Opus 4.6
├── rules/
│   └── detection.py                # Rule-based detection patterns
├── models/
│   ├── log_entry.py
│   ├── threat.py
│   └── incident_report.py
├── data/
│   └── cve_seeds.json              # CVE data for Pinecone
├── scripts/
│   └── seed_pinecone.py            # Seed Pinecone index
├── sample_logs/
├── tests/                          # 49 tests
└── docs/
    └── API.md                      # Full API documentation
```
