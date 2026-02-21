# NeuralWarden — Architecture Document

## System Overview

NeuralWarden is a two-pipeline system: a **Threat Pipeline** for log-based threat detection and a **Cloud Scan Super Agent** for infrastructure vulnerability scanning with behavioral correlation. Both pipelines are orchestrated by LangGraph state graphs and share a common data model.

```
                    ┌─────────────────────────┐
                    │    Next.js 16 Frontend   │
                    │    (Auth.js v5 OAuth)    │
                    └────────────┬────────────┘
                                 │ HTTP + SSE
                    ┌────────────▼────────────┐
                    │    FastAPI Backend       │
                    │    (port 8000)           │
                    ├─────────────────────────┤
                    │                         │
          ┌─────────▼──────┐    ┌─────────▼──────────┐
          │ Threat Pipeline │    │ Cloud Scan Super    │
          │ (LLM-powered)  │    │ Agent (deterministic)│
          └────────────────┘    └─────────────────────┘
                    │                         │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────┐
                    │  SQLite / PostgreSQL │
                    │  (per-user isolation)│
                    └─────────────────────┘
```

## Pipeline 1: Threat Pipeline

Analyzes raw security logs using LLM agents with multi-model routing.

```
START
  │
  [should_burst?] ─── >1000 logs ──→ ingest_chunk (parallel) → aggregate
  │                                                                │
  ▼                                                                ▼
[ingest] ─── valid? ──→ [detect] ──→ [validate] ─── threats? ──→ [classify]
  │ No                                                │ No           │
  ▼                                                   ▼        [should_hitl?]
empty_report → END                              clean_report      │        │
                                                  → END          ▼        ▼
                                                           hitl_review  report
                                                                │      → END
                                                             report → END
```

### State: `PipelineState` (`pipeline/state.py`)

| Field | Type | Written By |
|-------|------|-----------|
| `raw_logs` | `list[str]` | Input |
| `parsed_logs` | `list[LogEntry]` | Ingest |
| `threats` | `list[Threat]` | Detect |
| `classified_threats` | `list[ClassifiedThreat]` | Classify |
| `report` | `IncidentReport` | Report |
| `correlated_evidence` | `list[dict]` | Threaded from Cloud Scan (empty for standalone runs) |
| `agent_metrics` | `dict` | All agents |

### Agents

| Agent | File | Model | Purpose |
|-------|------|-------|---------|
| Ingest | `pipeline/agents/ingest.py` | Haiku 4.5 | Parse raw logs → LogEntry objects |
| Ingest Chunk | `pipeline/agents/ingest_chunk.py` | Haiku 4.5 | Parallel batch ingestion for >1000 logs |
| Detect | `pipeline/agents/detect.py` | Sonnet 4.5 | Rule-based + AI threat detection |
| Validate | `pipeline/agents/validate.py` | Haiku 4.5 | Shadow-check 5% of clean logs |
| Classify | `pipeline/agents/classify.py` | Sonnet 4.5 | Risk scoring, MITRE mapping, RAG. Injects `CORRELATION_ADDENDUM` when `correlated_evidence` is present to force-escalate severity and generate remediation commands |
| HITL | `pipeline/agents/hitl.py` | — | LangGraph interrupt() for critical threats |
| Report | `pipeline/agents/report.py` | Haiku 4.5 | Incident reports with action plans. Leads with "Active Incidents" section when correlated evidence is threaded from Cloud Scan |

### Conditional Routing

- **`should_detect`** — skip if no valid parsed logs
- **`should_classify`** — skip if no threats detected
- **`should_hitl`** — pause if critical threats need human review
- **`should_burst`** — parallel ingest via Send() for >1000 logs

## Pipeline 2: Cloud Scan Super Agent

Scans GCP infrastructure using deterministic agents with LangGraph fan-out/fan-in.

```
START → [Discovery] → [Router] → dispatch (Send fan-out)
                                      │
                        ┌─────────────┼─────────────┐
                        ▼                             ▼
                 [Active Scanner]              [Log Analyzer]
                 (public assets)              (private assets)
                        │                             │
                        └─────────────┬───────────────┘
                                      ▼
                              [Aggregate + Correlate]
                                      │
                              [Remediation Generator]
                                      │
                              [Threat Pipeline?] ─── logs? ──→ [Threat Pipeline]
                                      │                     (correlated_evidence threaded)
                                      ▼                              │
                                  [Finalize] ◄───────────────────────┘
                                      │
                                     END
```

### State: `ScanAgentState` (`pipeline/cloud_scan_state.py`)

| Field | Type | Notes |
|-------|------|-------|
| `project_id` | `str` | GCP project ID |
| `credentials_json` | `str` | Service account key |
| `enabled_services` | `list[str]` | Services to scan |
| `discovered_assets` | `list[dict]` | All found assets |
| `public_assets` | `list[dict]` | Router output |
| `private_assets` | `list[dict]` | Router output |
| `current_asset` | `dict` | Set by Send() for fan-out |
| `scan_issues` | `Annotated[list, operator.add]` | Fan-in aggregation |
| `log_lines` | `Annotated[list, operator.add]` | Fan-in aggregation |
| `correlated_issues` | `list[dict]` | Post-correlation final issues |
| `correlated_evidence` | `list[dict]` | Evidence samples threaded to Classify/Report agents |
| `active_exploits_detected` | `int` | Count of correlated findings |
| `scanned_assets` | `Annotated[list, operator.add]` | Fan-in aggregation of scanned assets |

### Agents

| Agent | File | Purpose |
|-------|------|---------|
| Discovery | `cloud_scan_graph.py:discovery_node` | Calls `gcp_scanner.run_scan()`, parses metadata |
| Router | `agents/cloud_router.py` | `is_public()` inspects metadata per asset type |
| Active Scanner | `agents/active_scanner.py` | Compliance checks: GCP_002, GCP_004, GCP_006 |
| Log Analyzer | `agents/log_analyzer.py` | Cloud Logging queries per resource |
| Correlation Engine | `agents/correlation_engine.py` | Cross-references scan issues + log lines, returns evidence samples |
| Remediation Generator | `agents/remediation_generator.py` | Maps rule_codes to parameterized `gcloud` fix scripts |

### Router Logic (`is_public`)

| Asset Type | Public If... |
|-----------|-------------|
| `compute_instance` | Has `accessConfigs` (external IP) |
| `gcs_bucket` | `publicAccessPrevention != "enforced"` |
| `firewall_rule` | `source_ranges` includes `0.0.0.0/0` |
| `cloud_sql` | Has `publicIp` |

### Correlation Engine

Uses a two-layer strategy: **deterministic first ($0), LLM second**. The engine matches scanner rule codes to log patterns, then threads evidence samples into the Classify Agent for reasoning.

Maps scanner `rule_code` to log patterns:

| Rule | Log Patterns | Verdict | MITRE | LLM Action |
|------|-------------|---------|-------|------------|
| `gcp_002` | Failed password, Invalid user | Brute Force Attempt | TA0006 / T1110 | Escalate to CRITICAL, generate `gcloud compute firewall-rules update` |
| `gcp_004` | AnonymousAccess, GetObject | Data Exfiltration | TA0010 / T1530 | Escalate to CRITICAL, generate `gcloud storage buckets update` |
| `gcp_006` | CreateServiceAccountKey, SetIamPolicy | Privilege Escalation | TA0004 / T1078.004 | Escalate to CRITICAL, explain lateral movement risk |
| `log_002` | Invalid user, unauthorized | Unauthorized Access | TA0001 / T1078 | Escalate to CRITICAL |

When correlated: severity → `critical`, title → `[ACTIVE] ...`, MITRE fields attached.

### Evidence Threading

`correlate_findings()` returns a 3-tuple: `(correlated_issues, active_count, correlated_evidence)`. Each evidence entry includes:

| Field | Content |
|-------|---------|
| `rule_code` | Scanner rule that matched |
| `asset` | Affected resource name |
| `verdict` | Human-readable exploit description |
| `mitre_tactic` / `mitre_technique` | ATT&CK mapping |
| `evidence_logs` | Up to 5 matching log lines |
| `matched_patterns` | Patterns that triggered the match |

**Flow:** `correlate_findings()` → `correlated_evidence[]` in `ScanAgentState` → `threat_pipeline_node` bridges to `PipelineState` → Classify Agent (`CORRELATION_ADDENDUM` injected) → Report Agent ("Active Incidents" section)

## Data Layer

### Database Abstraction (`api/db.py`)

Supports both SQLite (development) and PostgreSQL (Cloud Run production) via `get_conn()`, `adapt_sql()`, `placeholder()`, `insert_or_ignore()`, and `is_postgres()`. Schema DDL is auto-adapted per dialect.

### Tables

| Table | Database File | Key Columns | Isolation |
|-------|--------------|------------|-----------|
| `cloud_accounts` | `cloud_database.py` | id, user_email, provider, project_id, credentials_json, services | Per user_email |
| `cloud_issues` | `cloud_database.py` | id, cloud_account_id, rule_code, severity, title, status | Per cloud_account |
| `cloud_assets` | `cloud_database.py` | id, cloud_account_id, asset_type, name, metadata_json | Per cloud_account |
| `cloud_checks` | `cloud_database.py` | id, rule_code, title, description, category, severity | Global |
| `scan_logs` | `cloud_database.py` | id, cloud_account_id, started_at, status, log_text | Per cloud_account |
| `repo_connections` | `repo_database.py` | id, user_email, provider, name, token | Per user_email |
| `repo_assets` | `repo_database.py` | id, connection_id, asset_type, name, metadata_json | Per connection |
| `repo_issues` | `repo_database.py` | id, connection_id, rule_code, severity, title, status | Per connection |
| `repo_scan_logs` | `repo_database.py` | id, connection_id, started_at, status, log_text | Per connection |
| `pentests` | `pentests_database.py` | id, user_email, name, status, target | Per user_email |
| `pentest_findings` | `pentests_database.py` | id, pentest_id, title, severity, cwe_id, cve_id | Per pentest |
| `pentest_checks` | `pentests_database.py` | id, rule_code, title, group_name, subchecks_json | Global (seeded) |
| `analyses` | `database.py` | id, user_email, summary, report_json, created_at | Per user_email |

### Per-User Isolation

All queries filter by `user_email` from the `X-User-Email` header (set by frontend Auth.js middleware). Credentials are stored encrypted per-account and never returned in GET responses.

## Frontend

### Tech Stack
- Next.js 16 (App Router) + React 19 + Tailwind CSS v4
- Auth.js v5 with Google OAuth
- TypeScript strict mode

### State Management
`AnalysisContext` (React Context) wraps the entire app. Persists to localStorage. Manages:
- Analysis results (threats, report, metrics)
- Threat workflow (snooze, ignore, solve, restore)
- Cloud scan progress (SSE events)

### Key Components

| Component | Purpose |
|-----------|---------|
| `Sidebar` | Navigation with live counts (13 items) |
| `ThreatsTable` | Findings table with severity/confidence/MITRE |
| `ThreatDetailPanel` | 480px slide-out with gauge, tabs, actions |
| `CloudConfigModal` | Configure cloud: name, purpose, credentials, services |
| `RepoConfigModal` | Configure repository connection: name, token, settings |
| `CreatePentestModal` | Create new pentest campaign |
| `FindingDetailModal` | Pentest finding detail with CVE/CWE, request/response, validation |
| `PipelineProgress` | Real-time agent progress bar |
| `SummaryCards` | KPI cards (open issues, auto-ignored, new, solved) |
| `PipelineFlowDiagram` | Interactive SVG data flow diagram for both pipelines |
| `RemediationModal` | Fix modal with gcloud scripts — copy to clipboard or download as `.sh` |
| `ScanLogModal` | Per-scan execution log with timing and service breakdown |
| `ThreatTypeIcon` | SVG icons for 14 enterprise security type codes |
| `ScanProgressOverlay` | Full-screen scan progress indicator |
| `Topbar` | Top navigation bar |

### SSE Streaming

Cloud scans and repository scans stream progress via Server-Sent Events:

| Event | Data |
|-------|------|
| `starting` | Scan initialized |
| `discovered` | Asset count |
| `routing` | Public/private split |
| `scanned` | Assets scanned count |
| `complete` | Final counts + `active_exploits_detected` |
| `error` | Error message |

## Security

- OAuth-only authentication (no passwords stored)
- Credentials stripped from all GET/list API responses
- Per-user data isolation at the database layer
- PII auto-redaction in log processing
- Service account keys stored encrypted in SQLite

## Testing

247 tests across 29 files covering:
- Correlation engine (16 tests): all rule codes, edge cases, case-insensitive matching, evidence samples, cap at 5 logs
- Cloud scan graph (6 tests): pipeline compilation, discovery, E2E correlation, evidence threading to state
- Cloud router (9 tests): public/private classification per asset type
- Active scanner (5 tests): firewall, compute, bucket compliance checks
- Log analyzer (4 tests): log fetching, issue generation
- Cloud scan state (3 tests): TypedDict structure, fan-in aggregation
- Classify agent (2 tests): correlation addendum injection, no-addendum without evidence
- Report agent (2 tests): active incidents section, no section without evidence
- Detect agent: all 5 rule-based detection patterns, thresholds
- Pipeline routing: conditional routing, short-circuit paths, burst mode
- API routers: clouds, pentests, samples, reports endpoints
- Validate, ingest, HITL, PDF export, notifications, vector store, GCP logging/scanner
- Database operations, stream analysis, watcher, threat intel

```bash
.venv/bin/python -m pytest tests/ -v
```
