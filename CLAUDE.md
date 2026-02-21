# CLAUDE.md — Project Context for Claude Code

## Project

NeuralWarden — AI-powered cloud security platform with GCP scanning, threat correlation, and incident reporting.

## Tech Stack

- **Backend:** Python 3.13, FastAPI, LangGraph, Anthropic Claude (Haiku/Sonnet/Opus)
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Auth.js v5
- **Database:** SQLite (via `api/cloud_database.py`)
- **Auth:** Google OAuth via Auth.js v5
- **Testing:** pytest (45+ tests)

## Commands

```bash
# Start backend
.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000

# Start frontend
cd frontend && npm run dev

# Run tests (use project venv — base Python is 3.8 and missing deps)
.venv/bin/python -m pytest tests/ -v

# Run specific test group
.venv/bin/python -m pytest tests/test_correlation_engine.py tests/test_cloud_scan_graph.py -v
```

## Architecture

Two LangGraph pipelines:

1. **Cloud Scan Super Agent** (`pipeline/cloud_scan_graph.py`) — runs first, deterministic GCP scanning
   - Discovery → Router → Active Scanner/Log Analyzer (parallel via Send) → Aggregate+Correlate → Remediation → Threat Pipeline → Finalize
   - Correlation Engine produces `correlated_evidence` (log samples + MITRE mappings) threaded into Threat Pipeline

2. **Threat Pipeline** (`pipeline/graph.py`) — LLM-powered log analysis, fed by Cloud Scan
   - Ingest(Haiku) → Detect(Sonnet) → Validate(Haiku) → Classify(Sonnet+RAG+Correlation) → HITL → Report(Haiku)
   - Classify Agent injects `CORRELATION_ADDENDUM` when `correlated_evidence` is present (severity escalation, remediation commands)
   - Report Agent leads with "Active Incidents" section when correlated evidence exists

## Key Files

| Area | Files |
|------|-------|
| API entry | `api/main.py` |
| Cloud endpoints | `api/routers/clouds.py` |
| GCP scanner | `api/gcp_scanner.py` |
| Cloud DB | `api/cloud_database.py` |
| Threat pipeline | `pipeline/graph.py`, `pipeline/state.py` |
| Cloud scan pipeline | `pipeline/cloud_scan_graph.py`, `pipeline/cloud_scan_state.py` |
| Correlation engine | `pipeline/agents/correlation_engine.py` |
| Remediation generator | `pipeline/agents/remediation_generator.py` |
| Classify agent | `pipeline/agents/classify.py` |
| Report agent | `pipeline/agents/report.py` |
| Router agent | `pipeline/agents/cloud_router.py` |
| Active scanner | `pipeline/agents/active_scanner.py` |
| Log analyzer | `pipeline/agents/log_analyzer.py` |
| Frontend API client | `frontend/src/lib/api.ts` |
| Frontend types | `frontend/src/lib/types.ts` |
| Cloud detail page | `frontend/src/app/(dashboard)/clouds/[id]/layout.tsx` |
| Cloud config modal | `frontend/src/components/CloudConfigModal.tsx` |
| Agents page | `frontend/src/app/(dashboard)/agents/page.tsx` |
| Pipeline flow diagram | `frontend/src/components/PipelineFlowDiagram.tsx` |
| Sidebar | `frontend/src/components/Sidebar.tsx` |

## Conventions

- **State fan-in:** `scan_issues`, `log_lines`, `scanned_assets` use `Annotated[list, operator.add]` for parallel aggregation
- **Correlated results:** stored in `correlated_issues` (non-annotated) to avoid double-appending to `scan_issues`
- **Correlated evidence:** `correlate_findings()` returns 3-tuple `(issues, count, evidence)` — evidence samples (up to 5 log lines) are threaded via `correlated_evidence` field in both `ScanAgentState` and `PipelineState`
- **Correlation-aware LLM:** Classify Agent appends `CORRELATION_ADDENDUM` to prompt when evidence present; Report Agent adds "Active Incidents" section
- **Credentials security:** `_account_with_counts()` strips `credentials_json` from all API responses
- **Per-user isolation:** all cloud queries filter by `user_email` from `X-User-Email` header
- **SSE streaming:** scan progress via `sse-starlette` EventSourceResponse
- **Services JSON:** `cloud_accounts.services` stored as JSON string, parsed on read

## NeuralWarden Security Taxonomy

All threat and issue types follow this 4-category taxonomy. The source of truth is `frontend/src/lib/taxonomy.ts`.

| Category | ID | Description | Types |
|----------|-----|------------|-------|
| **AI & Agentic Security** | `ai_native` | Detects subversion of AI goal-setting and autonomous actions. | `prompt_injection`, `asi_01`, `asi_02`, `ai_pentest` |
| **Code & Supply Chain** | `supply_chain` | Scans source code and third-party libraries for known vulnerabilities. | `sast`, `open_source_deps`, `license_issues` |
| **Infrastructure & Runtime** | `infrastructure` | Monitors cloud environments, containers, and leaked credentials. | `cloud_configs`, `k8s`, `exposed_secrets`, `eol_runtimes` |
| **Threat Intel & Perimeter** | `threat_intel` | Active detection of malware and external surface probes. | `dast`, `malware`, `surface_monitoring` |

When adding new threat types:
1. Add to the correct category in `frontend/src/lib/taxonomy.ts`
2. Add an icon in `frontend/src/components/ThreatTypeIcon.tsx`
3. Add remediation steps in `frontend/src/lib/remediation.ts`
4. Update the detect agent prompt in `pipeline/agents/detect.py`

## Common Pitfalls

- Use `.venv/bin/python` for tests — system Python 3.8 is missing `Annotated`, `pydantic`, `langgraph`
- `listClouds()` returns a plain array, not `{accounts: [...]}`
- Frontend lock file at `.next/dev/lock` can persist — delete it if Next.js won't start
- PUT/POST cloud endpoints must go through `_account_with_counts()` to strip credentials
