# Correlation-Aware Classify & Report Agents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Thread correlated evidence from the deterministic Correlation Engine through to the Classify and Report agents so the LLM can escalate active exploits and generate remediation commands.

**Architecture:** Enhance `correlate_findings()` to return evidence samples alongside severity-upgraded issues. Thread `correlated_evidence` through state into the sub-pipeline. Classify Agent appends a correlation priority prompt addendum when evidence is present. Report Agent leads with Active Incidents.

**Tech Stack:** Python 3.13, LangGraph, Anthropic Claude (Sonnet for classify, Haiku for report), pytest

---

### Task 1: Enhance `correlate_findings()` to return evidence samples

**Files:**
- Modify: `pipeline/agents/correlation_engine.py:72-131`
- Test: `tests/test_correlation_engine.py`

**Step 1: Write the failing tests**

Add these tests to `tests/test_correlation_engine.py`:

```python
# --------------- evidence samples ---------------


def test_evidence_samples_returned_on_match():
    """Correlated findings include evidence log samples."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }]
    logs = [
        "2025-01-01 WARNING allow-ssh: Failed password for root from 203.0.113.5",
        "2025-01-01 WARNING allow-ssh: Invalid user admin from 203.0.113.5",
    ]
    result, count, evidence = correlate_findings(issues, logs)
    assert count == 1
    assert len(evidence) == 1
    assert evidence[0]["rule_code"] == "gcp_002"
    assert evidence[0]["asset"] == "allow-ssh"
    assert evidence[0]["verdict"] == "Brute Force Attempt in Progress"
    assert evidence[0]["mitre_tactic"] == "TA0006"
    assert evidence[0]["mitre_technique"] == "T1110"
    assert len(evidence[0]["evidence_logs"]) == 2
    assert "Failed password" in evidence[0]["evidence_logs"][0]
    assert set(evidence[0]["matched_patterns"]) == {"Failed password", "Invalid user"}


def test_evidence_logs_capped_at_five():
    """Evidence log samples are limited to 5."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }]
    logs = [f"2025-01-01 WARNING allow-ssh: Failed password attempt {i}" for i in range(10)]
    result, count, evidence = correlate_findings(issues, logs)
    assert count == 1
    assert len(evidence[0]["evidence_logs"]) == 5


def test_no_evidence_when_no_match():
    """No evidence returned when no patterns match."""
    issues = [{
        "rule_code": "gcp_002",
        "title": "Open SSH",
        "description": "desc",
        "severity": "high",
        "location": "Firewall: allow-ssh",
    }]
    logs = ["2025-01-01 INFO allow-ssh: healthy connection"]
    result, count, evidence = correlate_findings(issues, logs)
    assert count == 0
    assert evidence == []


def test_no_evidence_when_no_logs():
    """No evidence returned when log list is empty."""
    issues = [{"rule_code": "gcp_002", "title": "X", "description": "d", "severity": "high", "location": "Firewall: allow-ssh"}]
    result, count, evidence = correlate_findings(issues, [])
    assert count == 0
    assert evidence == []
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_correlation_engine.py::test_evidence_samples_returned_on_match tests/test_correlation_engine.py::test_evidence_logs_capped_at_five tests/test_correlation_engine.py::test_no_evidence_when_no_match tests/test_correlation_engine.py::test_no_evidence_when_no_logs -v`

Expected: FAIL — `correlate_findings()` returns 2 values, not 3.

**Step 3: Update existing tests for new return signature**

All existing tests unpack 2 values: `result, count = correlate_findings(...)`. Update them to unpack 3: `result, count, _evidence = correlate_findings(...)`. The underscore prefix signals the third value is intentionally unused in these tests.

Affected tests (update the unpack line in each):
- `test_no_log_lines_returns_original`
- `test_no_matching_patterns`
- `test_unknown_rule_code_passes_through`
- `test_gcp_002_brute_force_correlation`
- `test_gcp_004_data_exfiltration_correlation`
- `test_gcp_006_privilege_escalation_correlation`
- `test_mixed_issues_partial_correlation`
- `test_original_issues_not_mutated`
- `test_case_insensitive_matching`

**Step 4: Implement the enhancement**

In `pipeline/agents/correlation_engine.py`, modify `correlate_findings()`:

```python
def correlate_findings(
    scan_issues: list[dict],
    log_lines: list[str],
) -> tuple[list[dict], int, list[dict]]:
    """Cross-reference scan issues with log activity.

    Returns
    -------
    correlated_issues : list[dict]
        Copy of *scan_issues* with matched entries upgraded.
    active_exploit_count : int
        Number of issues correlated with live log activity.
    correlated_evidence : list[dict]
        Evidence samples for each correlated finding (for LLM consumption).
    """
    if not log_lines:
        return list(scan_issues), 0, []

    active_count = 0
    correlated: list[dict] = []
    evidence_list: list[dict] = []

    for issue in scan_issues:
        rule = CORRELATION_RULES.get(issue.get("rule_code", ""))
        if rule is None:
            correlated.append(issue)
            continue

        resource = _extract_resource_name(issue.get("location", ""))

        related_logs = [
            line for line in log_lines
            if resource.lower() in line.lower()
        ]

        matched_patterns = [
            p for p in rule["log_patterns"]
            if any(p.lower() in line.lower() for line in related_logs)
        ]

        if matched_patterns:
            upgraded = dict(issue)
            upgraded["severity"] = "critical"
            upgraded["title"] = f"[ACTIVE] {issue['title']}"
            upgraded["description"] = (
                f"{issue['description']}\n\n"
                f"CORRELATED: {rule['verdict']}. "
                f"{len(related_logs)} related log events detected."
            )
            upgraded["correlated"] = True
            upgraded["verdict"] = rule["verdict"]
            upgraded["mitre_tactic"] = rule["mitre_tactic"]
            upgraded["mitre_technique"] = rule["mitre_technique"]
            correlated.append(upgraded)
            active_count += 1

            evidence_list.append({
                "rule_code": issue.get("rule_code", ""),
                "asset": resource,
                "verdict": rule["verdict"],
                "mitre_tactic": rule["mitre_tactic"],
                "mitre_technique": rule["mitre_technique"],
                "evidence_logs": related_logs[:5],
                "matched_patterns": matched_patterns,
            })
        else:
            correlated.append(issue)

    return correlated, active_count, evidence_list
```

**Step 5: Run all correlation engine tests**

Run: `.venv/bin/python -m pytest tests/test_correlation_engine.py -v`

Expected: ALL PASS

**Step 6: Commit**

```bash
git add pipeline/agents/correlation_engine.py tests/test_correlation_engine.py
git commit -m "feat: return evidence samples from correlate_findings()"
```

---

### Task 2: Add `correlated_evidence` to state definitions

**Files:**
- Modify: `pipeline/cloud_scan_state.py:52-53`
- Modify: `pipeline/state.py:52-53`

**Step 1: Add field to `ScanAgentState`**

In `pipeline/cloud_scan_state.py`, add after the `active_exploits_detected` line:

```python
    # ── Correlation ──
    correlated_issues: list[dict]
    active_exploits_detected: int
    correlated_evidence: list[dict]   # <-- NEW: evidence samples for LLM
```

**Step 2: Add field to `PipelineState`**

In `pipeline/state.py`, add after the `chunk_count` line:

```python
    # --- v2.1: Correlation Evidence (injected from cloud scan context) ---
    correlated_evidence: list[dict]
```

**Step 3: Run existing tests to verify no breakage**

Run: `.venv/bin/python -m pytest tests/test_correlation_engine.py tests/test_cloud_scan_graph.py tests/test_classify.py -v`

Expected: ALL PASS (TypedDict with `total=False` means new optional fields don't break existing code)

**Step 4: Commit**

```bash
git add pipeline/cloud_scan_state.py pipeline/state.py
git commit -m "feat: add correlated_evidence field to pipeline states"
```

---

### Task 3: Thread evidence through aggregate and threat_pipeline nodes

**Files:**
- Modify: `pipeline/cloud_scan_graph.py:99-171`
- Test: `tests/test_cloud_scan_graph.py`

**Step 1: Write the failing test**

Add to `tests/test_cloud_scan_graph.py`:

```python
def test_correlation_evidence_threaded_to_state():
    """Aggregate node produces correlated_evidence for LLM consumption."""
    mock_assets = [
        {"asset_type": "firewall_rule", "name": "allow-ssh",
         "metadata": {"source_ranges": ["0.0.0.0/0"], "direction": "INGRESS"}},
        {"asset_type": "compute_instance", "name": "allow-ssh",
         "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.5"}]}},
    ]
    brute_force_logs = [
        "2025-01-01 WARNING allow-ssh: Failed password for root from 203.0.113.5",
        "2025-01-01 WARNING allow-ssh: Invalid user admin from 203.0.113.5",
    ]

    with patch("pipeline.cloud_scan_graph._discover_assets", return_value=(mock_assets, {})):
        with patch("pipeline.agents.log_analyzer._fetch_asset_logs", return_value=brute_force_logs):
            result = run_cloud_scan(
                cloud_account_id="test-id",
                project_id="test-proj",
                credentials_json="{}",
                enabled_services=["cloud_logging", "firewall"],
            )
            evidence = result.get("correlated_evidence", [])
            assert len(evidence) >= 1
            assert evidence[0]["rule_code"] == "gcp_002"
            assert evidence[0]["asset"] == "allow-ssh"
            assert len(evidence[0]["evidence_logs"]) > 0
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_cloud_scan_graph.py::test_correlation_evidence_threaded_to_state -v`

Expected: FAIL — `correlated_evidence` not in result (aggregate_node doesn't store it yet)

**Step 3: Update `aggregate_node`**

In `pipeline/cloud_scan_graph.py`, update `aggregate_node`:

```python
def aggregate_node(state: ScanAgentState) -> dict:
    """Merge results from all scanner agents and run correlation engine."""
    scanned = state.get("scanned_assets", [])
    public_count = sum(1 for s in scanned if s.get("route") == "active")
    scan_type = "full" if public_count > 0 else "cloud_logging_only"

    scan_issues = state.get("scan_issues", [])
    log_lines = state.get("log_lines", [])
    correlated_issues, active_count, correlated_evidence = correlate_findings(scan_issues, log_lines)

    return {
        "scan_status": "scanned",
        "assets_scanned": len(scanned),
        "scan_type": scan_type,
        "correlated_issues": correlated_issues,
        "active_exploits_detected": active_count,
        "correlated_evidence": correlated_evidence,
    }
```

**Step 4: Update `threat_pipeline_node` to pass evidence**

In `pipeline/cloud_scan_graph.py`, update `threat_pipeline_node` to include `correlated_evidence` in the sub-pipeline input:

```python
def threat_pipeline_node(state: ScanAgentState) -> dict:
    """Feed collected log lines into the existing threat detection pipeline."""
    from api.gcp_logging import deterministic_parse
    from pipeline.graph import build_pipeline

    log_lines = state.get("log_lines", [])
    if not log_lines:
        return {}

    parsed = deterministic_parse(log_lines)

    threat_graph = build_pipeline(enable_hitl=False)
    result = threat_graph.invoke({
        "raw_logs": log_lines,
        "parsed_logs": parsed,
        "invalid_count": 0,
        "total_count": len(parsed),
        "threats": [],
        "detection_stats": {},
        "classified_threats": [],
        "report": None,
        "error": None,
        "pipeline_cost": 0.0,
        "pipeline_time": 0.0,
        "validator_findings": [],
        "validator_sample_size": 0,
        "validator_missed_count": 0,
        "rag_context": {},
        "human_decisions": [],
        "hitl_required": False,
        "pending_critical_threats": [],
        "agent_metrics": {},
        "burst_mode": False,
        "chunk_count": 0,
        "correlated_evidence": state.get("correlated_evidence", []),
    })

    return {
        "classified_threats": result.get("classified_threats", []),
        "report": result.get("report"),
        "agent_metrics": result.get("agent_metrics", {}),
    }
```

**Step 5: Run all cloud scan graph tests**

Run: `.venv/bin/python -m pytest tests/test_cloud_scan_graph.py -v`

Expected: ALL PASS

**Step 6: Commit**

```bash
git add pipeline/cloud_scan_graph.py tests/test_cloud_scan_graph.py
git commit -m "feat: thread correlated_evidence through aggregate and threat pipeline"
```

---

### Task 4: Enhance Classify Agent with correlation priority prompt

**Files:**
- Modify: `pipeline/agents/classify.py`
- Test: `tests/test_classify.py`

**Step 1: Write the failing tests**

Add to `tests/test_classify.py`:

```python
import json
from unittest.mock import patch, MagicMock
from pipeline.agents.classify import run_classify, CORRELATION_ADDENDUM


def test_correlation_addendum_injected_when_evidence_present():
    """Classify prompt includes correlation context when evidence exists."""
    evidence = [{
        "rule_code": "gcp_002",
        "asset": "allow-ssh",
        "verdict": "Brute Force Attempt in Progress",
        "mitre_tactic": "TA0006",
        "mitre_technique": "T1110",
        "evidence_logs": ["allow-ssh: Failed password for root"],
        "matched_patterns": ["Failed password"],
    }]
    state = {
        "threats": [_make_threat()],
        "correlated_evidence": evidence,
        "agent_metrics": {},
        "rag_context": {},
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps([{
            "threat_id": "TEST-001",
            "risk": "critical",
            "risk_score": 9.5,
            "mitre_technique": "T1110",
            "mitre_tactic": "Credential Access",
            "business_impact": "Active brute force",
            "affected_systems": ["allow-ssh"],
            "remediation_priority": 1,
        }])
        resp.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
        return resp

    with patch("pipeline.agents.classify.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_classify(state)
        human_msg = captured_messages[-1].content
        assert "CORRELATION CONTEXT" in human_msg
        assert "allow-ssh" in human_msg
        assert "Brute Force" in human_msg


def test_no_correlation_addendum_when_no_evidence():
    """Classify prompt is unchanged when no correlated evidence."""
    state = {
        "threats": [_make_threat()],
        "correlated_evidence": [],
        "agent_metrics": {},
        "rag_context": {},
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps([{
            "threat_id": "TEST-001",
            "risk": "medium",
            "risk_score": 5.0,
            "mitre_technique": "T1110",
            "mitre_tactic": "Initial Access",
            "business_impact": "Potential brute force",
            "affected_systems": [],
            "remediation_priority": 1,
        }])
        resp.usage_metadata = {"input_tokens": 100, "output_tokens": 50}
        return resp

    with patch("pipeline.agents.classify.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_classify(state)
        human_msg = captured_messages[-1].content
        assert "CORRELATION CONTEXT" not in human_msg
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_classify.py::test_correlation_addendum_injected_when_evidence_present tests/test_classify.py::test_no_correlation_addendum_when_no_evidence -v`

Expected: FAIL — `CORRELATION_ADDENDUM` does not exist

**Step 3: Implement the enhancement**

In `pipeline/agents/classify.py`, add the addendum constant and update `run_classify`:

```python
CORRELATION_ADDENDUM = """

## CORRELATION CONTEXT — ACTIVE EXPLOITS
The following vulnerabilities have been matched with active log evidence.
These represent ACTIVE EXPLOITS, not theoretical risks.

{evidence_json}

### SEVERITY ESCALATION RULES
- If a finding appears in the correlation context above, FORCE ESCALATE its severity to CRITICAL.
- For correlated findings, include an immediate remediation gcloud command in business_impact.
- Map correlated activity to the specific MITRE ATT&CK Tactic from the evidence.
- Set remediation_priority to 1 for ALL correlated findings.

### OUTPUT REQUIREMENTS FOR CORRELATED FINDINGS
For each correlated finding you MUST include:
- In business_impact: explain WHY the vulnerability and log behavior together indicate active exploitation
- In mitre_technique/mitre_tactic: use the values from correlation evidence
- In affected_systems: include the asset name from correlation evidence
"""
```

In `run_classify`, after building `threat_data` and before the LLM call, construct the human message content:

```python
    # Build the human message
    base_content = f"Classify these {len(threats)} detected threats:\n\n{json.dumps(threat_data, indent=2)}"

    # Enrich with correlation evidence if available
    correlated_evidence = state.get("correlated_evidence", [])
    if correlated_evidence:
        base_content += CORRELATION_ADDENDUM.format(
            evidence_json=json.dumps(correlated_evidence, indent=2)
        )
```

Then use `base_content` as the `HumanMessage` content instead of the current f-string.

**Step 4: Run all classify tests**

Run: `.venv/bin/python -m pytest tests/test_classify.py -v`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add pipeline/agents/classify.py tests/test_classify.py
git commit -m "feat: inject correlation priority prompt into Classify Agent"
```

---

### Task 5: Enhance Report Agent with Active Incidents structure

**Files:**
- Modify: `pipeline/agents/report.py`
- Create: `tests/test_report.py`

**Step 1: Write the failing test**

Create `tests/test_report.py`:

```python
"""Tests for report agent correlation awareness."""

import json
from unittest.mock import patch, MagicMock

from models.threat import ClassifiedThreat
from pipeline.agents.report import run_report


def _make_classified_threat(
    threat_id="T-001",
    risk="critical",
    risk_score=9.5,
    description="Active brute force on allow-ssh",
    source_ip="203.0.113.5",
    mitre_technique="T1110",
) -> ClassifiedThreat:
    return ClassifiedThreat(
        threat_id=threat_id,
        type="brute_force",
        confidence=0.95,
        method="rule_based",
        description=description,
        source_ip=source_ip,
        risk=risk,
        risk_score=risk_score,
        mitre_technique=mitre_technique,
        mitre_tactic="Credential Access",
        business_impact="Active exploitation detected",
        affected_systems=["allow-ssh"],
        remediation_priority=1,
    )


def test_report_includes_active_incidents_section():
    """Report prompt includes Active Incidents when correlated evidence exists."""
    state = {
        "classified_threats": [_make_classified_threat()],
        "detection_stats": {"rules_matched": 1, "ai_detections": 0, "total_threats": 1},
        "parsed_logs": [],
        "total_count": 10,
        "invalid_count": 0,
        "agent_metrics": {},
        "correlated_evidence": [{
            "rule_code": "gcp_002",
            "asset": "allow-ssh",
            "verdict": "Brute Force Attempt in Progress",
            "mitre_tactic": "TA0006",
            "mitre_technique": "T1110",
            "evidence_logs": ["allow-ssh: Failed password for root"],
            "matched_patterns": ["Failed password"],
        }],
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps({
            "summary": "Active brute force attack detected on allow-ssh.",
            "timeline": "Attack timeline here.",
            "action_plan": [{"step": 1, "action": "Block SSH", "urgency": "immediate", "owner": "Security Team"}],
            "recommendations": ["Restrict SSH access"],
            "ioc_summary": ["IP: 203.0.113.5"],
            "mitre_techniques": ["T1110"],
        })
        resp.usage_metadata = {"input_tokens": 200, "output_tokens": 100}
        return resp

    with patch("pipeline.agents.report.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_report(state)
        human_msg = captured_messages[-1].content
        assert "Active Incidents" in human_msg
        assert "allow-ssh" in human_msg
        assert "gcloud" in human_msg.lower() or "remediation" in human_msg.lower()


def test_report_no_active_incidents_without_evidence():
    """Report prompt omits Active Incidents when no correlated evidence."""
    state = {
        "classified_threats": [_make_classified_threat(risk="medium", risk_score=5.0)],
        "detection_stats": {"rules_matched": 1, "ai_detections": 0, "total_threats": 1},
        "parsed_logs": [],
        "total_count": 10,
        "invalid_count": 0,
        "agent_metrics": {},
        "correlated_evidence": [],
    }

    captured_messages = []

    def mock_invoke(messages, **kwargs):
        captured_messages.extend(messages)
        resp = MagicMock()
        resp.content = json.dumps({
            "summary": "One medium threat detected.",
            "timeline": "",
            "action_plan": [{"step": 1, "action": "Review", "urgency": "24hr", "owner": "Security Team"}],
            "recommendations": [],
            "ioc_summary": [],
            "mitre_techniques": [],
        })
        resp.usage_metadata = {"input_tokens": 200, "output_tokens": 100}
        return resp

    with patch("pipeline.agents.report.ChatAnthropic") as MockLLM:
        MockLLM.return_value.invoke = mock_invoke
        result = run_report(state)
        human_msg = captured_messages[-1].content
        assert "Active Incidents" not in human_msg
```

**Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_report.py -v`

Expected: FAIL — Report Agent doesn't read `correlated_evidence` or inject Active Incidents section

**Step 3: Implement the enhancement**

In `pipeline/agents/report.py`, after building the `threat_summary` and `log_samples`, add correlation-aware content to the human message:

```python
    # Build Active Incidents section if correlated evidence exists
    correlated_evidence = state.get("correlated_evidence", [])
    active_incidents_section = ""
    if correlated_evidence:
        active_incidents_section = (
            "\n\n## Active Incidents (Correlated — HIGHEST PRIORITY)\n"
            "These findings have matching live log evidence. Lead your executive summary with these.\n"
            "For each, include the specific remediation gcloud command.\n\n"
            + json.dumps(correlated_evidence, indent=2)
        )
```

Then append `active_incidents_section` to the HumanMessage content.

**Step 4: Run all report tests**

Run: `.venv/bin/python -m pytest tests/test_report.py -v`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add pipeline/agents/report.py tests/test_report.py
git commit -m "feat: report agent leads with Active Incidents when correlated"
```

---

### Task 6: Run full test suite and verify no regressions

**Files:**
- No new files

**Step 1: Run the full test suite**

Run: `.venv/bin/python -m pytest tests/ -v`

Expected: ALL PASS (38+ existing tests + new tests)

**Step 2: Run the cloud scan graph E2E test specifically**

Run: `.venv/bin/python -m pytest tests/test_cloud_scan_graph.py::test_correlation_engine_e2e -v`

Expected: PASS — this test will now unpack 3 values from `correlate_findings()` internally (via `aggregate_node`)

**Step 3: Commit if any fixups were needed**

```bash
git add -u
git commit -m "fix: address test regressions from correlation evidence threading"
```

Only commit if changes were needed. Skip if all tests passed on first run.

---

### Task 7: Update `run_pipeline` initial state for standalone runs

**Files:**
- Modify: `pipeline/graph.py:239-261`

**Step 1: Add `correlated_evidence` to initial state**

In `pipeline/graph.py`, add to the `initial_state` dict in `run_pipeline()`:

```python
    initial_state: dict = {
        # ... existing fields ...
        "chunk_count": 0,
        "correlated_evidence": [],  # <-- NEW: empty for standalone runs
    }
```

**Step 2: Run threat pipeline tests**

Run: `.venv/bin/python -m pytest tests/ -v`

Expected: ALL PASS

**Step 3: Commit**

```bash
git add pipeline/graph.py
git commit -m "feat: include correlated_evidence in standalone pipeline initial state"
```
