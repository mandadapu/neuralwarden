# Design: Correlation-Aware Classify & Report Agents

**Date:** 2026-02-19
**Status:** Approved

## Goal

Thread correlated evidence (vulnerability + log matches) from the deterministic Correlation Engine through to the Classify and Report agents so the LLM layer can:
1. Force-escalate correlated findings to CRITICAL severity
2. Generate remediation `gcloud` commands for active exploits
3. Structure reports with "Active Incidents" leading the executive summary

This fulfills the VISION.md principle of **Intelligence Over Volume** — surfacing the 2% of findings that represent active exploitation.

## Approach

**Approach A: Enrich existing pipeline.** No new nodes. The deterministic Correlation Engine remains the $0 first pass; the LLM layers reasoning on top via enriched prompts.

## Changes

### 1. Correlation Engine (`pipeline/agents/correlation_engine.py`)

Enhance `correlate_findings()` to return a third value: `correlated_evidence`.

```python
# Return type: tuple[list[dict], int, list[dict]]
# Third element: correlated_evidence
# [
#   {
#     "rule_code": "gcp_002",
#     "asset": "allow-ssh",
#     "verdict": "Brute Force Attempt in Progress",
#     "mitre_tactic": "TA0006",
#     "mitre_technique": "T1110",
#     "evidence_logs": ["log line 1", ...],  # up to 5 samples
#     "matched_patterns": ["Failed password", "Invalid user"],
#   }
# ]
```

### 2. State Additions

**`cloud_scan_state.py`:** Add `correlated_evidence: list[dict]`

**`pipeline/state.py`:** Add `correlated_evidence: list[dict]` (empty for standalone runs)

### 3. Aggregate Node (`cloud_scan_graph.py`)

Call enhanced `correlate_findings()` and store `correlated_evidence` in state alongside existing `correlated_issues` and `active_exploits_detected`.

### 4. Threat Pipeline Bridge (`cloud_scan_graph.py`)

`threat_pipeline_node` passes `correlated_evidence` from scan state into the sub-pipeline's initial state.

### 5. Classify Agent (`pipeline/agents/classify.py`)

When `correlated_evidence` is present and non-empty, append a correlation priority addendum to the HumanMessage:

- Inject the correlated evidence JSON
- Instruct severity escalation (Medium/High + matching logs = CRITICAL)
- Request remediation gcloud commands
- Request MITRE mapping and impact quantification
- Set remediation_priority=1 for all correlated findings

The existing SYSTEM_PROMPT is unchanged. The addendum is contextual.

### 6. Report Agent (`pipeline/agents/report.py`)

When classified threats include correlated entries (risk=critical + from correlated evidence), add structural directive to the HumanMessage:

- Lead executive summary with "Active Incidents"
- Include remediation gcloud commands for each active exploit
- Separate active incidents from static findings

## Data Flow

```
Discovery -> Router -> Scanner/Log Analyzer
                            | (fan-in)
                       Aggregate
                       +-- correlate_findings() -> correlated_issues (severity upgraded)
                       +-- correlated_evidence[] (log samples for LLM)
                            |
                       Threat Pipeline (sub-invoke)
                       +-- Detect/Validate (unchanged)
                       +-- Classify (enriched with correlated_evidence)
                       +-- Report (structured: Active Incidents first)
                            |
                       Finalize
```

## Files Modified

| File | Change |
|------|--------|
| `pipeline/agents/correlation_engine.py` | Return evidence samples from `correlate_findings()` |
| `pipeline/cloud_scan_state.py` | Add `correlated_evidence` field |
| `pipeline/state.py` | Add `correlated_evidence` field |
| `pipeline/cloud_scan_graph.py` | Thread evidence through aggregate and threat_pipeline_node |
| `pipeline/agents/classify.py` | Correlation priority prompt addendum |
| `pipeline/agents/report.py` | Active Incidents report structure |

## Principles

- **Deterministic first, LLM second:** The correlation engine does the matching at $0. The LLM adds reasoning, not pattern matching.
- **Backward compatible:** Standalone threat pipeline runs (no cloud scan) see empty `correlated_evidence` and behave identically to before.
- **OODA loop:** Observe (Discovery) -> Orient (Router) -> Decide (Aggregate/Correlate) -> Act (Classify/Report with active incidents).
