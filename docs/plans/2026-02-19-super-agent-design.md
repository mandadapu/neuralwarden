# Super Agent & Router Agent — Design Document

**Date**: 2026-02-19
**Status**: Approved
**Scope**: Replace the basic `run_scan()` with a LangGraph-based Super Agent that intelligently routes assets to active scanning or log analysis, then feeds results into the existing threat pipeline.

## Overview

A stateful LangGraph agent graph that sits between the "Start Scan" UI button and GCP APIs. The Router Agent inspects each discovered asset's metadata to determine if it's publicly exposed (active scan) or private (log-based analysis). Results from both paths are aggregated and fed into the existing threat pipeline (Detect → Validate → Classify → Report) for LLM-powered classification, MITRE mapping, and incident reporting.

## Architecture

```
POST /api/clouds/{id}/scan (SSE stream)
    ↓
[Discovery Node]
    Enumerate GCP assets using gcp_scanner discovery functions
    Stream: "discovering_assets" event
    ↓
[Router Node]
    For each asset, inspect metadata to determine public/private
    Route via LangGraph Send() for parallel processing
    Stream: "routing_asset" event per asset
    ↓ (parallel per asset)
┌─────────────────────┐    ┌─────────────────────────┐
│ Active Scanner Agent │    │ Log Analysis Agent       │
│ (public assets)      │    │ (private assets)         │
│                      │    │                          │
│ Runs compliance      │    │ Queries Cloud Logging    │
│ checks: open SSH,    │    │ for resource-specific    │
│ public buckets,      │    │ audit events: anonymous  │
│ default SA, etc.     │    │ access, IAM denied, etc. │
└──────────┬──────────┘    └────────────┬────────────┘
           ↓                            ↓
    [Aggregate Node]
        Merge all issues + log entries
        Stream: "scan_complete" event
        ↓
    [Existing Threat Pipeline]
        Detect → Validate → Classify → Report
        Stream: "agent_start"/"agent_complete" events (existing)
        ↓
    [Save Results]
        Save issues, assets, report to cloud_issues/cloud_assets tables
        Update last_scan_at
        Stream: "complete" event with final results
```

## LangGraph State

```python
class ScanAgentState(TypedDict):
    # Input
    cloud_account_id: str
    project_id: str
    credentials_json: str
    enabled_services: list[str]

    # Discovery
    discovered_assets: Annotated[list[dict], operator.add]  # aggregated from parallel nodes

    # Router decisions
    public_assets: list[dict]
    private_assets: list[dict]

    # Scanner results (aggregated from parallel agents)
    scan_issues: Annotated[list[dict], operator.add]
    log_entries: Annotated[list[str], operator.add]  # raw log lines for threat pipeline

    # Scan metadata
    scan_status: str  # discovering, routing, scanning, analyzing, complete
    assets_scanned: int
    total_assets: int

    # Results (from threat pipeline)
    classified_threats: list  # ClassifiedThreat objects
    report: dict | None
    agent_metrics: dict
```

## Router Logic

The Router Node inspects `metadata_json` for each asset to determine public exposure:

```python
def is_public(asset: dict) -> bool:
    metadata = asset.get("metadata", {})
    asset_type = asset["asset_type"]

    # Compute Engine: has external IP via accessConfigs
    if asset_type == "compute_instance":
        for iface in metadata.get("networkInterfaces", []):
            if "accessConfigs" in iface:
                return True

    # GCS Bucket: publicAccessPrevention not enforced
    if asset_type == "gcs_bucket":
        if metadata.get("publicAccessPrevention") != "enforced":
            return True

    # Firewall Rule: allows 0.0.0.0/0
    if asset_type == "firewall_rule":
        for src in metadata.get("source_ranges", []):
            if src in ("0.0.0.0/0", "::/0"):
                return True

    # Cloud SQL: has public IP
    if asset_type == "cloud_sql":
        if metadata.get("publicIp"):
            return True

    return False
```

## Agent Specializations

### Active Scanner Agent
- Receives a public asset
- Calls the appropriate compliance check functions from `gcp_scanner.py`
- Returns issues (same dict format as existing)
- Example: for a `firewall_rule` with 0.0.0.0/0, calls `_check_open_ssh()`

### Log Analysis Agent
- Receives a private asset
- Queries Cloud Logging for the specific resource ID over last 24h
- Filter: `resource.labels.instance_id="<id>" AND (severity>=WARNING OR protoPayload.methodName:"SetIamPolicy")`
- Uses `deterministic_parse()` to parse log entries
- Returns raw log lines for the threat pipeline + any log-based issues (log_001, log_002, log_003)

## SSE Streaming Events

| Event | Data | When |
|-------|------|------|
| `scan_start` | `{total_assets: N}` | Discovery complete |
| `asset_routing` | `{asset_name, route: "active"/"log", index, total}` | Each asset routed |
| `asset_scanned` | `{asset_name, issues_found: N, route}` | Each asset scanned |
| `scan_complete` | `{total_issues, public_count, private_count}` | All assets done |
| `agent_start` | `{stage: "detect"}` | Threat pipeline starts (existing) |
| `agent_complete` | `{stage: "detect", elapsed_s, cost_usd}` | Threat pipeline stage done (existing) |
| `complete` | `{issues, report, scan_summary}` | Everything done |
| `error` | `{message}` | Any error |

## API Changes

### Replace: `POST /api/clouds/{cloud_id}/scan`

Current: calls `run_scan()` synchronously, returns JSON.
New: SSE streaming endpoint that invokes the LangGraph super agent.

```python
@router.post("/{cloud_id}/scan")
async def scan_cloud(cloud_id: str, request: Request):
    # Returns SSE stream
    return EventSourceResponse(scan_stream_generator(cloud_id, user_email))
```

## Files

### New
- `pipeline/cloud_scan_graph.py` — LangGraph StateGraph for the super agent
- `pipeline/cloud_scan_state.py` — ScanAgentState TypedDict
- `pipeline/agents/cloud_router.py` — Router node + public/private detection
- `pipeline/agents/active_scanner.py` — Active scanner agent node
- `pipeline/agents/log_analyzer.py` — Log analysis agent node
- `api/routers/cloud_scan_stream.py` — SSE streaming endpoint

### Modified
- `api/routers/clouds.py` — Replace scan endpoint with SSE version
- `frontend/src/app/(dashboard)/clouds/[id]/layout.tsx` — Wire scan button to SSE stream
- `frontend/src/lib/api.ts` — Add `scanCloudStream()` SSE function
- `frontend/src/lib/types.ts` — Add scan event types

## UI Updates

The "Start Scan" button in the cloud detail layout will:
1. Open an SSE connection to the new streaming scan endpoint
2. Show a progress panel (similar to PipelineProgress.tsx) with:
   - "Discovering assets..." → "Found N assets"
   - Per-asset progress: "Scanning [asset_name] (3/10)..." with active/log badge
   - "Running threat analysis..." (existing pipeline stages)
   - Final summary: "Scan complete — N issues found"
3. Refresh the issues/assets tables when complete
