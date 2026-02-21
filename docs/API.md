# API & Developer Documentation

Comprehensive reference for the NeuralWarden platform — REST API, Cloud Scan API, Repository API, Pentests API, data models, agents, pipeline orchestration, and Next.js dashboard.

---

## Table of Contents

- [REST API — Threat Pipeline](#rest-api--threat-pipeline)
  - [POST /api/analyze](#post-apianalyze)
  - [POST /api/hitl/{thread_id}/resume](#post-apihitlthread_idresume)
  - [GET /api/samples](#get-apisamples)
  - [GET /api/samples/{sample_id}](#get-apisamplessample_id)
  - [GET /api/health](#get-apihealth)
- [REST API — Cloud Management](#rest-api--cloud-management)
- [REST API — Repository Management](#rest-api--repository-management)
- [REST API — Pentests](#rest-api--pentests)
- [REST API — Reports](#rest-api--reports)
- [Response Schemas](#response-schemas)
- [Data Models](#data-models)
- [Pipeline State](#pipeline-state)
- [Rule-Based Detection](#rule-based-detection)
- [Agents](#agents)
- [Pipeline Orchestration](#pipeline-orchestration)
- [CLI Reference](#cli-reference)
- [Frontend Architecture](#frontend-architecture)
- [Error Handling & Fallbacks](#error-handling--fallbacks)
- [Sample Log Formats](#sample-log-formats)
- [Testing](#testing)
- [Cost Model](#cost-model)

---

## REST API

**Base URL:** `http://localhost:8000`

The FastAPI backend exposes a REST API consumed by the Next.js frontend. CORS is configured for `localhost:3000` and `localhost:3001`.

### POST /api/analyze

Runs the full pipeline on raw security logs.

**Request:**
```json
{
  "logs": "Feb 10 14:32:01 web-server sshd: Failed password for admin from 203.0.113.50..."
}
```

**Response:** `AnalysisResponse` (see [Response Schemas](#response-schemas))

**Notes:**
- Long-running (~20-40s depending on log volume and threat count)
- Returns `status: "hitl_required"` if critical threats trigger human-in-the-loop review
- Returns `status: "error"` with `error` field on pipeline failure

### POST /api/hitl/{thread_id}/resume

Resumes a paused pipeline after human-in-the-loop review.

**Path:** `thread_id` — the `thread_id` from the initial analysis response

**Request:**
```json
{
  "decision": "approve",
  "notes": "Confirmed as real threat, proceed with report generation"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `decision` | `"approve" \| "reject"` | Yes | Human reviewer decision |
| `notes` | `string` | No | Optional reviewer notes |

**Response:** `AnalysisResponse` with `status: "completed"`

### GET /api/samples

Lists available sample log scenarios.

**Response:**
```json
{
  "samples": [
    { "id": "brute_force", "name": "DAST — Brute Force Attack" },
    { "id": "data_exfiltration", "name": "Surface Monitoring — Data Exfiltration" },
    { "id": "mixed_threats", "name": "Mixed Threats (Multi-Stage)" },
    { "id": "clean_logs", "name": "Clean Logs (No Threats)" }
  ]
}
```

### GET /api/samples/{sample_id}

Returns the content of a specific sample log file.

**Response:**
```json
{
  "id": "brute_force",
  "name": "DAST — Brute Force Attack",
  "content": "Feb 10 14:32:01 web-server sshd: Failed password..."
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{ "status": "ok", "version": "2.0.0" }
```

---

## REST API — Cloud Management

All cloud endpoints require the `X-User-Email` header for per-user isolation. Credentials are never returned in responses.

### GET /api/clouds

List cloud accounts for the authenticated user.

**Headers:** `X-User-Email: user@example.com`

**Response:**
```json
[
  {
    "id": "uuid",
    "user_email": "user@example.com",
    "provider": "gcp",
    "name": "My GCP Project",
    "project_id": "my-project-123",
    "purpose": "production",
    "services": "[\"cloud_logging\", \"compute\"]",
    "last_scan_at": "2026-02-19T23:13:39Z",
    "status": "active",
    "issue_counts": { "critical": 1, "high": 2, "medium": 3, "low": 0, "total": 6 }
  }
]
```

### POST /api/clouds

Create a new cloud account.

**Request:**
```json
{
  "name": "My GCP Project",
  "project_id": "my-project-123",
  "provider": "gcp",
  "purpose": "production",
  "credentials_json": "{...service account key JSON...}",
  "services": ["cloud_logging", "compute", "firewall"]
}
```

### GET /api/clouds/all-issues

List all cloud issues across all accounts for the authenticated user.

### GET /api/clouds/checks

List compliance check definitions. Optional query param: `category`.

### GET /api/clouds/{id}

Get a single cloud account with issue counts.

### PUT /api/clouds/{id}

Update cloud account fields (name, purpose, credentials, services).

**Request:**
```json
{
  "name": "Updated Name",
  "purpose": "staging",
  "credentials_json": "{...new key...}",
  "services": ["cloud_logging", "compute", "firewall", "storage"]
}
```

All fields are optional — only provided fields are updated.

### DELETE /api/clouds/{id}

Delete a cloud account and all its associated issues/assets.

### GET /api/clouds/{id}/probe

Probe cloud account access — validates credentials and permissions.

### POST /api/clouds/{id}/toggle

Toggle cloud account active/inactive status.

### POST /api/clouds/{id}/scan

**SSE streaming endpoint.** Triggers the Cloud Scan Super Agent and streams progress events.

**Response:** `text/event-stream`

```
data: {"event": "starting", "total_assets": 0, "assets_scanned": 0}
data: {"event": "discovered", "total_assets": 5}
data: {"event": "routing", "total_assets": 5, "public_count": 2, "private_count": 3}
data: {"event": "scanned", "assets_scanned": 5, "scan_type": "full"}
data: {"event": "complete", "scan_type": "full", "asset_count": 5, "issue_count": 3, "active_exploits_detected": 1, "issue_counts": {...}, "has_report": false}
```

**SSE Event Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Stage: starting, discovered, routing, scanned, complete, error |
| `total_assets` | `int` | Total assets discovered |
| `public_count` | `int` | Assets routed to active scanner |
| `private_count` | `int` | Assets routed to log analyzer |
| `active_exploits_detected` | `int` | Issues correlated with live log activity |
| `issue_counts` | `object` | Breakdown by severity (critical/high/medium/low/total) |

### GET /api/clouds/{id}/scan-progress

Get current scan progress for a cloud account.

### GET /api/clouds/{id}/scan-logs

List historical scan logs for a cloud account.

### GET /api/clouds/{id}/scan-logs/{log_id}

Get a specific scan log with full log text.

### GET /api/clouds/{id}/issues

List issues for a cloud account. Optional query params: `status`, `severity`.

### PATCH /api/clouds/issues/{issue_id}

Update issue status.

**Request:**
```json
{ "status": "solved" }
```

Valid statuses: `todo`, `in_progress`, `ignored`, `solved`

### PATCH /api/clouds/issues/{issue_id}/severity

Update issue severity.

### GET /api/clouds/{id}/assets

List assets for a cloud account. Optional query param: `asset_type`.

---

## REST API — Repository Management

All repo endpoints require the `X-User-Email` header. Prefix: `/api/repos`.

### GET /api/repos

List repository connections for the authenticated user.

### POST /api/repos

Create a new repository connection.

### GET /api/repos/all-issues

List all repo issues across all connections for the authenticated user.

### GET /api/repos/github/user

Get authenticated GitHub user info (validates token).

### GET /api/repos/github/orgs

List GitHub organizations for the authenticated user.

### GET /api/repos/github/orgs/{org}/repos

List repositories for a GitHub organization.

### GET /api/repos/{conn_id}

Get a single repository connection with issue/asset counts.

### PUT /api/repos/{conn_id}

Update repository connection fields.

### DELETE /api/repos/{conn_id}

Delete a repository connection and all associated data.

### POST /api/repos/{conn_id}/toggle

Toggle repository connection active/inactive status.

### POST /api/repos/{conn_id}/scan

**SSE streaming endpoint.** Triggers the 3-layer repository scanning pipeline and streams progress events.

**Scanning layers:**
1. **Secret Detection** — 30+ regex patterns for 15+ providers (AWS, GCP, GitHub, Stripe, etc.)
2. **SCA** — parses lockfiles from 12 ecosystems, queries OSV.dev for known CVEs, detects copyleft/missing licenses
3. **AI SAST** — Claude Haiku code analysis with regex fallback when API key unavailable

**Implementation:** `api/github_scanner.py` orchestrates `api/secret_patterns.py`, `api/sca_scanner.py`, `api/sast_scanner.py`

### GET /api/repos/{conn_id}/scan-progress

Get current scan progress.

### GET /api/repos/{conn_id}/scan-logs

List historical scan logs.

### GET /api/repos/{conn_id}/scan-logs/{log_id}

Get a specific scan log.

### GET /api/repos/{conn_id}/issues

List issues for a repository connection. Optional query params: `status`, `severity`.

### PATCH /api/repos/issues/{issue_id}

Update issue status.

### PATCH /api/repos/issues/{issue_id}/severity

Update issue severity.

### GET /api/repos/{conn_id}/repos

List discovered repositories for a connection.

---

## REST API — Pentests

Pentest campaign and findings management. Prefix: `/api/pentests`.

### GET /api/pentests

List pentest campaigns for the authenticated user.

### POST /api/pentests

Create a new pentest campaign.

**Request:**
```json
{
  "name": "Q1 2026 Web App Pentest",
  "description": "External pentest of production web application",
  "vendor": "manual",
  "status": "planned",
  "severity": "medium",
  "scope": "*.example.com"
}
```

### GET /api/pentests/checks

List pentest check definitions. Optional query param: `group` (owasp, advanced, hardening).

Returns 13 security check categories with subchecks.

### GET /api/pentests/{pentest_id}

Get a single pentest campaign with finding counts.

### PUT /api/pentests/{pentest_id}

Update pentest campaign fields.

### DELETE /api/pentests/{pentest_id}

Delete a pentest campaign and all its findings.

### GET /api/pentests/{pentest_id}/findings

List findings for a pentest. Optional query params: `severity`, `status`.

### POST /api/pentests/{pentest_id}/findings

Create a new finding.

**Request:**
```json
{
  "title": "SQL Injection in Login Form",
  "description": "Parameterized queries not used in authentication endpoint",
  "severity": "critical",
  "status": "open",
  "cwe_id": "CWE-89",
  "cve_id": "",
  "request_data": "POST /login HTTP/1.1\n...",
  "response_data": "HTTP/1.1 500 Internal Server Error\n...",
  "validation_status": "confirmed"
}
```

### PATCH /api/pentests/findings/{finding_id}

Update finding fields (severity, status, validation_status, notes, etc.).

### POST /api/pentests/{pentest_id}/import

Bulk import findings from external tools.

---

## REST API — Reports

Report history and retrieval. Prefix: `/api/reports`.

### GET /api/reports

List recent analysis reports for the authenticated user.

### GET /api/reports/latest

Get the most recent analysis report.

### GET /api/reports/{analysis_id}

Get a full analysis report by ID.

---

## Response Schemas

### AnalysisResponse

Top-level response for `/api/analyze` and `/api/hitl/{id}/resume`.

| Field | Type | Description |
|-------|------|-------------|
| `thread_id` | `string \| null` | LangGraph thread ID (present when HITL is triggered) |
| `status` | `"completed" \| "hitl_required" \| "error"` | Pipeline result status |
| `summary` | `SummaryResponse` | Aggregated stats |
| `classified_threats` | `ClassifiedThreatResponse[]` | All classified threats |
| `pending_critical_threats` | `PendingThreatResponse[]` | Threats awaiting HITL review |
| `report` | `IncidentReportResponse \| null` | Generated incident report |
| `agent_metrics` | `dict[string, AgentMetricsResponse]` | Per-agent cost/latency |
| `pipeline_time` | `float` | Total pipeline duration (seconds) |
| `error` | `string \| null` | Error message if `status == "error"` |

### SummaryResponse

| Field | Type | Description |
|-------|------|-------------|
| `total_threats` | `int` | Total threats detected |
| `severity_counts` | `{critical, high, medium, low}` | Breakdown by severity |
| `auto_ignored` | `int` | Informational/auto-dismissed threats |
| `total_logs` | `int` | Total log lines processed |
| `logs_cleared` | `int` | Clean log lines |

### AgentMetricsResponse

| Field | Type | Description |
|-------|------|-------------|
| `cost_usd` | `float` | API cost in USD |
| `latency_ms` | `float` | Agent execution time |
| `input_tokens` | `int` | Tokens consumed |
| `output_tokens` | `int` | Tokens generated |

---

## Data Models

All models use [Pydantic v2](https://docs.pydantic.dev/) `BaseModel` with field validation.

### LogEntry

**File:** `models/log_entry.py`

A single parsed security log entry produced by the Ingest Agent.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `index` | `int` | *required* | Original line index in raw input |
| `timestamp` | `str` | `""` | Normalized timestamp string |
| `source` | `str` | `""` | Log source (e.g., `sshd`, `sudo`, `scp`) |
| `event_type` | `str` | `"unknown"` | One of: `failed_auth`, `successful_auth`, `file_transfer`, `data_transfer`, `command_exec`, `connection`, `privilege_escalation`, `system`, `unknown` |
| `source_ip` | `str` | `""` | Source IP address |
| `dest_ip` | `str` | `""` | Destination IP address |
| `user` | `str` | `""` | Username involved |
| `details` | `str` | `""` | Additional parsed details |
| `raw_text` | `str` | *required* | Original raw log line |
| `is_valid` | `bool` | `True` | Whether parsing succeeded |
| `parse_error` | `str \| None` | `None` | Error message if parsing failed |

### Threat

**File:** `models/threat.py`

A detected security threat before risk classification.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `threat_id` | `str` | *required* | Unique ID (e.g., `RULE-BRUTE-001`, `AI-RECON-001`) |
| `type` | `str` | *required* | Enterprise security type code: `dast`, `sast`, `cloud_configs`, `surface_monitoring`, `malware`, `exposed_secrets`, `prompt_injection`, `asi_01`, `asi_02`, `ai_pentest`, `open_source_deps`, `license_issues`, `k8s`, `eol_runtimes` |
| `confidence` | `float` | `0.0–1.0` | Detection confidence score |
| `source_log_indices` | `list[int]` | — | Indices of triggering log entries |
| `method` | `Literal["rule_based", "ai_detected", "validator_detected"]` | *required* | Detection method used |
| `description` | `str` | *required* | Human-readable description |
| `source_ip` | `str` | `""` | Primary source IP |

### ClassifiedThreat

**File:** `models/threat.py`

A threat enriched with risk scoring and MITRE ATT&CK mapping. Contains all `Threat` fields plus:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `risk` | `Literal` | `critical\|high\|medium\|low\|informational` | Severity level |
| `risk_score` | `float` | `0.0–10.0` | Numeric score (likelihood x impact x exploitability) |
| `mitre_technique` | `str` | — | MITRE ATT&CK technique ID (e.g., `T1110`) |
| `mitre_tactic` | `str` | — | MITRE ATT&CK tactic (e.g., `Initial Access`) |
| `business_impact` | `str` | — | Business impact assessment |
| `affected_systems` | `list[str]` | — | Systems affected |
| `remediation_priority` | `int` | `>= 0` | Priority ranking (1 = highest) |

### ActionStep

**File:** `models/incident_report.py`

A single remediation action in the incident report.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `step` | `int` | *required* | Step number |
| `action` | `str` | *required* | Specific action to take |
| `urgency` | `str` | *required* | `immediate`, `1hr`, `24hr`, `1week` |
| `owner` | `str` | `"Security Team"` | Responsible party |

### IncidentReport

**File:** `models/incident_report.py`

Complete incident report generated by the Report Agent.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `summary` | `str` | *required* | Executive summary (2-3 sentences) |
| `threat_count` | `int` | `0` | Total threats detected |
| `critical_count` | `int` | `0` | Critical-severity threats |
| `high_count` | `int` | `0` | High-severity threats |
| `medium_count` | `int` | `0` | Medium-severity threats |
| `low_count` | `int` | `0` | Low-severity threats |
| `timeline` | `str` | `""` | Reconstructed attack timeline |
| `action_plan` | `list[ActionStep]` | `[]` | Ordered remediation steps |
| `recommendations` | `list[str]` | `[]` | Strategic prevention recommendations |
| `ioc_summary` | `list[str]` | `[]` | Indicators of Compromise |
| `mitre_techniques` | `list[str]` | `[]` | All MITRE ATT&CK technique IDs observed |
| `generated_at` | `datetime` | `now()` | Report generation timestamp |

---

## Pipeline State

**File:** `pipeline/state.py`

`PipelineState` is a `TypedDict(total=False)` that flows through the LangGraph pipeline. Each agent reads what it needs and writes its outputs.

```
┌──────────────────────────────────────────────────────┐
│                   PipelineState                      │
├──────────────────────────────────────────────────────┤
│ Input         │ raw_logs: list[str]                  │
├───────────────┼──────────────────────────────────────┤
│ Ingest writes │ parsed_logs: list[LogEntry]          │
│               │ invalid_count: int                   │
│               │ total_count: int                     │
├───────────────┼──────────────────────────────────────┤
│ Detect writes │ threats: list[Threat]                │
│               │ detection_stats: dict[str, Any]      │
├───────────────┼──────────────────────────────────────┤
│ Classify      │ classified_threats: list[Classified] │
├───────────────┼──────────────────────────────────────┤
│ Report writes │ report: IncidentReport | None        │
├───────────────┼──────────────────────────────────────┤
│ Metadata      │ error: str | None                    │
│               │ pipeline_cost: float                 │
│               │ pipeline_time: float                 │
└──────────────────────────────────────────────────────┘
```

---

## Rule-Based Detection

**File:** `rules/detection.py`

Five pattern-matching detectors that run **instantly with zero API cost**. These always execute before AI detection. Each detector outputs threats using the enterprise taxonomy type codes.

### `detect_brute_force(logs, threshold=5)`

Detects N+ failed authentication attempts from the same IP.

- **Matches:** `event_type == "failed_auth"` with same `source_ip`
- **Confidence:** `min(0.5 + count * 0.05, 0.99)`
- **Threat ID:** `RULE-BRUTE-{ip}`
- **Type:** `dast`

### `detect_port_scan(logs, threshold=10)`

Detects connections to N+ distinct ports from the same source.

- **Matches:** `event_type == "connection"` with port in `details`
- **Confidence:** `min(0.6 + ports * 0.03, 0.95)`
- **Threat ID:** `RULE-SCAN-{ip}`
- **Type:** `dast`

### `detect_privilege_escalation(logs)`

Detects sudo/su usage patterns.

- **Matches:** `event_type in (privilege_escalation, sudo, su)` or `source in (sudo, su)` or `"USER=root"` in raw text
- **Confidence:** `0.85` (fixed)
- **Threat ID:** `RULE-PRIVESC-001`
- **Type:** `cloud_configs`

### `detect_data_exfiltration(logs, threshold_mb=100.0)`

Detects large outbound transfers exceeding threshold.

- **Matches:** `event_type in (file_transfer, data_transfer)` with size in raw text
- **Size parsing:** Supports GB, MB, KB units
- **Confidence:** `min(0.7 + (total_mb / 1000) * 0.1, 0.95)`
- **Threat ID:** `RULE-EXFIL-001`
- **Type:** `surface_monitoring`

### `detect_lateral_movement(logs)`

Detects internal-to-internal connections on unusual ports.

- **Matches:** Both `source_ip` and `dest_ip` are RFC 1918 addresses (`10.x`, `172.16-31.x`, `192.168.x`) with `event_type in (connection, ssh, rdp, smb)`
- **Confidence:** `0.75` (fixed)
- **Threat ID:** `RULE-LATERAL-001`
- **Type:** `malware`

### `run_all_rules(logs)`

Aggregator that runs all five detectors and returns combined `list[Threat]`.

---

## Agents

### Threat Pipeline Agents

### Ingest Agent

**File:** `pipeline/agents/ingest.py`
**Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — $0.25/MTok
**Temperature:** 0

Parses raw log lines into structured `LogEntry` objects via batch prompting.

**Function:** `run_ingest(state: PipelineState) -> dict`

**Behavior:**
1. Numbers all raw log lines as `[0] line text...`
2. Sends batch to Haiku with JSON-mode system prompt
3. Parses response JSON into `LogEntry` objects
4. Marks any unparseable entries as `is_valid=False`
5. If LLM returns fewer entries than input, marks remainder as invalid

**Fallback:** If the LLM call fails entirely, all entries are marked `is_valid=False` with the error message. The pipeline continues — downstream agents will see zero valid logs and short-circuit.

### Detect Agent

**File:** `pipeline/agents/detect.py`
**Model:** Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) — $3/MTok
**Temperature:** 0.2

Two-layer threat detection combining rule-based patterns and AI analysis.

**Function:** `run_detect(state: PipelineState) -> dict`

**Behavior:**
1. **Layer 1 (free):** Calls `run_all_rules()` on valid parsed logs
2. **Layer 2 (API):** Sends logs + rule results to Sonnet asking for additional novel threats
3. Merges results: `all_threats = rule_threats + ai_threats`
4. Returns `detection_stats` with breakdown by method

**Fallback:** If AI detection fails, rule-based results are returned alone. No data is lost.

**Returns:**
```python
{
    "threats": list[Threat],
    "detection_stats": {
        "rules_matched": int,
        "ai_detections": int,
        "total_threats": int,
    }
}
```

### Classify Agent

**File:** `pipeline/agents/classify.py`
**Model:** Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) — $3/MTok
**Temperature:** 0.1

Risk-scores each threat with MITRE ATT&CK mappings.

**Function:** `run_classify(state: PipelineState) -> dict`

**Behavior:**
1. Formats threats as JSON for the LLM
2. Requests risk level, risk score, MITRE technique/tactic, business impact, affected systems, remediation priority
3. Matches AI classifications back to original threats by `threat_id`
4. Sorts results by `remediation_priority` (1 = highest)

**Fallback:** `_fallback_classify(threat, priority)` assigns `risk="medium"`, `risk_score=5.0` to any threat the AI fails to classify. Ensures all threats get a classification.

### Report Agent

**File:** `pipeline/agents/report.py`
**Model:** Claude Opus 4.6 (`claude-opus-4-6`) — $15/MTok
**Temperature:** 0.3

Generates dual-audience incident reports with action plans.

**Function:** `run_report(state: PipelineState) -> dict`

**Behavior:**
1. Builds context from classified threats, detection stats, and log timeline samples (capped at 50 entries)
2. Requests JSON report with summary, timeline, action plan, recommendations, IOCs, MITRE techniques
3. Computes severity counts from classified threats
4. Returns a complete `IncidentReport` object

**Fallback:** Generates a template report with raw classified threat data and an auto-generated action plan (one step per threat). The `summary` notes that manual review is required.

### Cloud Scan Agents

### Discovery Agent

**File:** `pipeline/cloud_scan_graph.py:discovery_node`

Enumerates GCP assets using `gcp_scanner.run_scan()`. Parses `metadata_json` strings into `metadata` dicts for downstream agents.

### Router Agent

**File:** `pipeline/agents/cloud_router.py`

Inspects each asset's metadata to classify as public or private. Routes via LangGraph `Send()` for parallel processing.

**Public criteria:** compute with external IP, bucket without enforced public access prevention, firewall with 0.0.0.0/0, Cloud SQL with public IP.

### Active Scanner Agent

**File:** `pipeline/agents/active_scanner.py`

Runs compliance checks on public-facing assets:
- `gcp_002` — Firewall allows unrestricted ingress (0.0.0.0/0)
- `gcp_004` — GCS bucket publicly accessible via IAM
- `gcp_006` — Compute instance using default service account

### Log Analyzer Agent

**File:** `pipeline/agents/log_analyzer.py`

Queries Cloud Logging for resource-specific audit events (last 24h, severity >= WARNING). Generates issues for error spikes (`log_001`) and authentication failures (`log_002`).

### Correlation Engine

**File:** `pipeline/agents/correlation_engine.py`

Runs in the Aggregate Node. Cross-references scan issues with log lines by resource name + attack pattern matching. When a scanner finding has matching behavioral signals in logs, the issue is upgraded to critical with MITRE ATT&CK mapping and `[ACTIVE]` tag.

**Intelligence Matrix:**

| Scanner Rule | Log Patterns | Verdict | MITRE |
|---|---|---|---|
| `gcp_002` | Failed password, Invalid user, Connection closed | Brute Force Attempt in Progress | TA0006 / T1110 |
| `gcp_004` | AnonymousAccess, GetObject, storage.objects.get | Data Exfiltration Occurring | TA0010 / T1530 |
| `gcp_006` | CreateServiceAccountKey, SetIamPolicy | Privilege Escalation Risk | TA0004 / T1078.004 |
| `log_002` | Invalid user, unauthorized, brute | Unauthorized Access Attempt | TA0001 / T1078 |

---

## Pipeline Orchestration

**File:** `pipeline/graph.py`

Uses [LangGraph](https://langchain-ai.github.io/langgraph/) `StateGraph` with conditional edges.

### Graph Structure

```
START
  │
  ▼
[ingest] ──── valid logs? ───┐
  │                          │ No
  │ Yes                      ▼
  ▼                    [empty_report] → END
[detect] ──── threats? ─────┐
  │                         │ No
  │ Yes                     ▼
  ▼                   [clean_report] → END
[classify]
  │
  ▼
[report] → END
```

### Conditional Routing Functions

**`should_detect(state) -> "detect" | "empty_report"`**
Routes to Detect only if at least one `parsed_log` has `is_valid=True`. Otherwise generates an empty report (all logs malformed).

**`should_classify(state) -> "classify" | "clean_report"`**
Routes to Classify only if `threats` list is non-empty. Otherwise generates a clean report (no threats found).

### Short-Circuit Nodes

- **`empty_report_node`** — All logs malformed. Produces report advising review of log sources.
- **`clean_report_node`** — No threats found. Produces report confirming normal activity.

### Entry Points

**`build_pipeline() -> CompiledStateGraph`**
Constructs and compiles the LangGraph pipeline. Called once per invocation.

**`run_pipeline(raw_logs: list[str]) -> PipelineState`**
Main entry point. Initializes state, invokes the graph, records `pipeline_time`.

---

## CLI Reference

**File:** `main.py`

### Usage

```bash
# From file
python main.py sample_logs/brute_force.txt

# From stdin
cat logs.txt | python main.py
```

### Functions

**`cli()`**
Reads logs from file argument or stdin, runs pipeline, prints stats and formatted report.

**`format_report(report: IncidentReport) -> str`**
Formats an `IncidentReport` as plaintext with sections: Executive Summary, Threat Overview, Attack Timeline, Action Plan, IOCs, MITRE Techniques, Strategic Recommendations.

### Output Example

```
======================================================================
  INCIDENT REPORT
======================================================================

EXECUTIVE SUMMARY
----------------------------------------
Brute force SSH attack from 203.0.113.50 detected with 8 failed attempts...

THREAT OVERVIEW
----------------------------------------
  Total threats:  2
  Critical:       1
  High:           1
  Medium:         0
  Low:            0

ACTION PLAN
----------------------------------------
  1. Block IP 203.0.113.50 at firewall [IMMEDIATE] (Security Team)
  2. Reset compromised credentials [1HR] (IT Ops)
  ...
======================================================================
  Generated: 2026-02-10 14:32:01
======================================================================
```

---

## Frontend Architecture

**Stack:** Next.js 16 (App Router) + React 19 + Tailwind CSS v4
**Theme:** Green/Dark (`sidebar=#0f1419`, `primary=#00e68a`, `background=#0d1117`)

### Launch

```bash
cd frontend && npm run dev
# Opens at http://localhost:3000
```

### State Management

**File:** `frontend/src/context/AnalysisContext.tsx`

Global state via React Context (`AnalysisProvider`) wrapping the entire app in `layout.tsx`. State persists to `localStorage` under the key `neuralwarden_analysis`.

| State | Type | Description |
|-------|------|-------------|
| `result` | `AnalysisResponse \| null` | Latest analysis result from backend |
| `logText` | `string` | Current log input text |
| `isLoading` | `boolean` | Pipeline running indicator |
| `error` | `string \| null` | Error message |
| `snoozedThreats` | `ClassifiedThreat[]` | Threats deferred for later |
| `ignoredThreats` | `ClassifiedThreat[]` | False positives / accepted risk |
| `solvedThreats` | `ClassifiedThreat[]` | Resolved threats |

**Actions:**
- `runAnalysis(logs)` — Calls `POST /api/analyze`, resets all threat lists
- `resume(decision, notes)` — Calls `POST /api/hitl/{id}/resume`
- `snoozeThreat(id)` / `ignoreThreat(id)` / `solveThreat(id)` — Moves threat from feed to respective list
- `restoreThreat(id, from)` — Moves threat back to feed
- `updateThreat(id, updates)` — In-place updates (risk level adjustment)

### Key Components

**`ThreatDetailPanel.tsx`** — Slide-out panel (480px) from the right, triggered by clicking a threat row:
- Header with close button and threat name
- Severity gauge (SVG semicircle) + severity badge + type/method/MITRE tags
- Tabbed content: Overview | Activity | Tasks
- Overview sections: TL;DR, Business Impact, MITRE ATT&CK, remediation steps, affected systems, source details
- Actions dropdown: Snooze, Ignore, Mark as solved, Adjust severity (submenu)
- Prev/next navigation with keyboard shortcuts (Escape, arrow keys)
- Backdrop overlay with body scroll lock

**`ThreatsTable.tsx`** — Findings table with clickable rows, severity badges, confidence indicators

**`Sidebar.tsx`** — Navigation with live counts from context (feed count, snoozed, ignored, resolved) — 13 items

**`SeverityGauge.tsx`** — SVG semicircular gauge rendering `risk_score` (0-10) as a colored arc

**`ThreatTypeIcon.tsx`** — SVG icons for 14 enterprise security type codes

### Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `(auth)/login/page.tsx` | Google OAuth login |
| `/` | `page.tsx` | Main feed: summary cards, findings table, cost breakdown, incident report |
| `/snoozed` | `snoozed/page.tsx` | Deferred threats table with restore action |
| `/ignored` | `ignored/page.tsx` | Accepted risk / false positives with restore action |
| `/resolved` | `resolved/page.tsx` | Resolved threats with reopen action |
| `/autofix` | `autofix/page.tsx` | Automated fix statistics |
| `/clouds` | `clouds/page.tsx` | Connected GCP accounts with issue counts |
| `/clouds/connect` | `clouds/connect/page.tsx` | Add new GCP project |
| `/clouds/[id]` | `clouds/[id]/layout.tsx` | Cloud detail: SSE scan, issues, assets, VMs, checks, scan logs tabs |
| `/repositories` | `repositories/page.tsx` | Connected GitHub repositories with issue counts |
| `/repositories/connect` | `repositories/connect/page.tsx` | Add new repository connection |
| `/repositories/[id]` | `repositories/[id]/page.tsx` | Repository detail: SSE scan, issues, assets, scan logs |
| `/agents` | `agents/page.tsx` | 12 pipeline agents grouped by Threat Pipeline / Cloud Scan |
| `/mitre` | `mitre/page.tsx` | MITRE ATT&CK reference |
| `/threat-intel` | `threat-intel/page.tsx` | Pinecone threat intel feed |
| `/reports` | `reports/page.tsx` | Generated reports with PDF export |
| `/pentests` | `pentests/page.tsx` | Pentest campaigns list |
| `/pentests/[id]` | `pentests/[id]/page.tsx` | Pentest detail with findings and timeline |
| `/pentests/checks` | `pentests/checks/page.tsx` | Security check catalog (13 categories) |
| `/integrations` | `integrations/page.tsx` | Third-party connections |

### API Client

**File:** `frontend/src/lib/api.ts`

62 exported functions calling the FastAPI backend directly on port 8000 (bypasses Next.js rewrite proxy to avoid timeout issues with long-running analysis):

```typescript
const BASE = `${window.location.protocol}//${window.location.hostname}:8000/api`;
```

**Function groups:**
- **Analysis & Reports** (6): `analyze`, `resumeHitl`, `analyzeStream`, `listReports`, `getReport`, `getLatestReport`
- **Samples & Generation** (4): `listSamples`, `getSample`, `listScenarios`, `generateLogs`
- **Cloud Monitoring** (18): `listClouds`, `createCloud`, `getCloud`, `updateCloud`, `deleteCloud`, `toggleCloud`, `probeCloudAccess`, `scanCloud`, `scanCloudStream`, `getScanProgress`, `listAllCloudIssues`, `listCloudIssues`, `updateIssueStatus`, `updateIssueSeverity`, `listCloudAssets`, `listCloudChecks`, `listScanLogs`, `getScanLog`
- **Repository Integration** (18): `listRepoConnections`, `createRepoConnection`, `getRepoConnection`, `updateRepoConnection`, `deleteRepoConnection`, `toggleRepoConnection`, `getGitHubUser`, `listGitHubOrgs`, `listGitHubRepos`, `scanRepoConnectionStream`, `getRepoScanProgress`, `listRepoIssues`, `listAllRepoIssues`, `updateRepoIssueStatus`, `updateRepoIssueSeverity`, `listRepoAssets`, `listRepoScanLogs`, `getRepoScanLog`
- **Pentests** (10): `listPentests`, `createPentest`, `getPentest`, `updatePentest`, `deletePentest`, `listFindings`, `createFinding`, `updateFinding`, `listPentestChecks`, `importFindings`
- **Threat Intelligence** (3): `getThreatIntelStats`, `listThreatIntelEntries`, `searchThreatIntel`
- **GCP Logging** (2): `getGcpStatus`, `fetchGcpLogs`

---

## Error Handling & Fallbacks

Every agent implements graceful degradation:

| Agent | Failure Mode | Fallback Behavior |
|-------|-------------|-------------------|
| **Ingest** | LLM call fails | All entries marked `is_valid=False`, pipeline continues |
| **Ingest** | JSON parse error | Same as above |
| **Detect** | AI detection fails | Returns rule-based results only (printed warning) |
| **Classify** | Classification fails | All threats get `risk=medium`, `risk_score=5.0` |
| **Report** | Report generation fails | Template report with raw data, marked for manual review |

The pipeline **never crashes** — it always produces a result, even if degraded.

---

## Sample Log Formats

### `sample_logs/brute_force.txt`

SSH brute force attack: multiple failed auth attempts from a single IP, followed by a successful login and privilege escalation. Expected: 2+ threats (critical/high).

### `sample_logs/data_exfiltration.txt`

Large outbound SCP transfers to an external IP. Expected: 1+ data exfiltration threat.

### `sample_logs/mixed_threats.txt`

Multi-stage attack: port scanning → brute force → privilege escalation → lateral movement → data exfiltration. Expected: 4+ threats across multiple categories.

### `sample_logs/clean_logs.txt`

Normal operational logs (SSH logins, cron jobs, system updates). Expected: 0 threats. Tests the short-circuit path (detect → clean_report → END).

---

## Testing

```bash
.venv/bin/python -m pytest tests/ -v
```

### Test Files

| File | Coverage |
|------|----------|
| `test_correlation_engine.py` | Correlation rules, severity upgrade, MITRE mapping, case-insensitive matching, evidence cap |
| `test_cloud_scan_graph.py` | Pipeline compilation, discovery, mock scan, E2E correlation |
| `test_cloud_router.py` | Public/private classification for all asset types |
| `test_active_scanner.py` | Firewall, compute, bucket compliance checks |
| `test_log_analyzer.py` | Log fetching, error/auth issue generation |
| `test_cloud_scan_state.py` | TypedDict structure, fan-in aggregation |
| `test_detect.py` | All 5 rule-based detection patterns, thresholds |
| `test_classify.py` | Fallback classification, model constraints |
| `test_pipeline.py` | Conditional routing, short-circuit paths, burst mode |
| `test_ingest.py` | LogEntry model validation, edge cases |
| `test_validate.py` | Clean sample selection, fractions, caps |
| `test_report.py` | Report generation, active incidents section |
| `test_hitl.py` | HITL interrupt, resume |
| `test_database.py` | Analysis persistence CRUD |
| `test_cloud_database.py` | Cloud account/issue/asset CRUD |
| `test_clouds_router.py` | Cloud API endpoint integration |
| `test_pentests_router.py` | Pentest API endpoint integration |
| `test_gcp_scanner.py` | GCP asset discovery |
| `test_gcp_logging.py` | Cloud Logging client |
| `test_gcp_router.py` | GCP routing logic |
| `test_vector_store.py` | RAG vector store queries |
| `test_threat_intel_api.py` | Threat intelligence endpoints |
| `test_notifications.py` | Alert formatting |
| `test_pdf.py` | PDF export generation |
| `test_pii.py` | PII auto-redaction |
| `test_stream.py` | Streaming analysis |
| `test_watcher.py` | Monitoring watchers |
| `test_generator.py` | Log generation |
| `test_burst.py` | Burst mode parallel ingestion |

**247 tests across 29 files.** All tests run without API calls — they use mocked or synthetic data.

---

## Cost Model

| Agent | Model | Input Cost | Output Cost | Typical Usage |
|-------|-------|-----------|------------|---------------|
| Ingest | Haiku 4.5 | $0.25/MTok | $1.25/MTok | ~500 tokens in, ~1K out |
| Detect | Sonnet 4.5 | $3.00/MTok | $15.00/MTok | ~1K tokens in, ~500 out |
| Classify | Sonnet 4.5 | $3.00/MTok | $15.00/MTok | ~800 tokens in, ~600 out |
| Report | Opus 4.6 | $15.00/MTok | $75.00/MTok | ~1.5K tokens in, ~1K out |

**Cost-saving strategies:**
- Rule-based detection runs first (free, instant)
- Conditional routing skips agents when unnecessary
- Haiku handles high-volume parsing at 12x lower cost than Sonnet
- Opus is only invoked for final report generation (smallest token volume)

Typical cost per analysis: **~$0.01-0.05** depending on log volume and threat count.
