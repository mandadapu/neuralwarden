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
                    │  SQLite Database     │
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

### SQLite Database (`data/neuralwarden.db`)

| Table | Key Columns | Isolation |
|-------|------------|-----------|
| `cloud_accounts` | id, user_email, provider, project_id, credentials_json, services | Per user_email |
| `cloud_issues` | id, cloud_account_id, rule_code, severity, title, status | Per cloud_account |
| `cloud_assets` | id, cloud_account_id, asset_type, name, metadata_json | Per cloud_account |

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
| `Sidebar` | Navigation with live counts (12 items) |
| `ThreatsTable` | Findings table with severity/confidence/MITRE |
| `ThreatDetailPanel` | 480px slide-out with gauge, tabs, actions |
| `CloudConfigModal` | Configure cloud: name, purpose, credentials, services |
| `PipelineProgress` | Real-time agent progress bar |
| `SummaryCards` | KPI cards (open issues, auto-ignored, new, solved) |
| `PipelineFlowDiagram` | Interactive SVG data flow diagram for both pipelines |
| `RemediationModal` | Fix modal with gcloud scripts — copy to clipboard or download as `.sh` |
| `ScanLogModal` | Per-scan execution log with timing and service breakdown |

### SSE Streaming

Cloud scans stream progress via Server-Sent Events:

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

45+ tests covering:
- Correlation engine (16 tests): all rule codes, edge cases, case-insensitive matching, evidence samples, cap at 5 logs
- Cloud scan graph (6 tests): pipeline compilation, discovery, E2E correlation, evidence threading to state
- Classify agent (2 tests): correlation addendum injection, no-addendum without evidence
- Report agent (2 tests): active incidents section, no section without evidence
- Active scanner (5 tests): firewall, compute, bucket checks
- Router (9 tests): public/private classification per asset type
- Log analyzer (4 tests): log fetching, issue generation
- State (3 tests): TypedDict structure, fan-in aggregation

```bash
.venv/bin/python -m pytest tests/ -v
```
