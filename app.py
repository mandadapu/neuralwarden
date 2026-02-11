"""Gradio dashboard for the AI NeuralWarden Pipeline v2.0."""

import time
import uuid

import gradio as gr
from dotenv import load_dotenv
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from models.incident_report import IncidentReport
from models.threat import ClassifiedThreat
from pipeline.graph import build_pipeline

load_dotenv()

# Module-level HITL-enabled graph (built once, reused across requests)
_hitl_graph = None


def _get_hitl_graph():
    global _hitl_graph
    if _hitl_graph is None:
        _hitl_graph = build_pipeline(enable_hitl=True)
    return _hitl_graph


def _severity_color(risk: str) -> str:
    return {
        "critical": "#dc2626",
        "high": "#ea580c",
        "medium": "#ca8a04",
        "low": "#2563eb",
        "informational": "#6b7280",
    }.get(risk, "#6b7280")


def _format_threats_html(classified_threats: list[ClassifiedThreat]) -> str:
    if not classified_threats:
        return "<div style='padding:16px;color:#6b7280;text-align:center;'>No threats detected</div>"

    rows = []
    for ct in classified_threats:
        color = _severity_color(ct.risk)
        method_badge = ""
        if ct.method == "validator_detected":
            method_badge = (
                "<span style='padding:1px 5px;border-radius:3px;background:#7c3aed22;"
                "color:#7c3aed;font-size:9px;font-weight:700;margin-left:6px;'>VALIDATOR</span>"
            )
        rows.append(
            f"<div style='display:flex;align-items:center;justify-content:space-between;"
            f"padding:8px 12px;margin:4px 0;border-radius:8px;border:1px solid {color}33;"
            f"background:{color}0d;'>"
            f"<div style='display:flex;align-items:center;gap:8px;'>"
            f"<span style='width:8px;height:8px;border-radius:50%;background:{color};display:inline-block;'></span>"
            f"<span style='font-weight:600;color:{color};'>{ct.type.replace('_', ' ').title()}</span>"
            f"{method_badge}"
            f"</div>"
            f"<div style='display:flex;gap:8px;align-items:center;'>"
            f"<span style='font-family:monospace;font-size:12px;color:{color};'>{ct.confidence:.0%} conf</span>"
            f"<span style='padding:2px 8px;border-radius:4px;background:{color}22;color:{color};"
            f"font-weight:700;font-size:11px;text-transform:uppercase;'>{ct.risk}</span>"
            f"</div></div>"
        )
    return "".join(rows)


def _format_classification_html(classified_threats: list[ClassifiedThreat]) -> str:
    if not classified_threats:
        return "<div style='padding:16px;color:#6b7280;text-align:center;'>No classifications</div>"

    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    mitre = set()
    for ct in classified_threats:
        if ct.risk in counts:
            counts[ct.risk] += 1
        if ct.mitre_technique:
            mitre.add(ct.mitre_technique)

    html = "<div style='display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;'>"
    for level, count in counts.items():
        color = _severity_color(level)
        html += (
            f"<div style='text-align:center;padding:8px;border-radius:8px;background:{color}0d;'>"
            f"<div style='font-size:24px;font-weight:700;color:{color};'>{count}</div>"
            f"<div style='font-size:11px;color:#6b7280;'>{level.title()}</div></div>"
        )
    html += "</div>"

    if mitre:
        html += "<div style='margin-top:8px;'><span style='font-size:12px;color:#6b7280;'>MITRE: </span>"
        for t in sorted(mitre):
            html += f"<span style='padding:2px 6px;margin:2px;border-radius:4px;background:#f3f4f6;font-size:11px;font-family:monospace;'>{t}</span>"
        html += "</div>"

    return html


def _format_report_md(report: IncidentReport) -> str:
    lines = [f"## Executive Summary\n\n{report.summary}\n"]

    if report.timeline:
        lines.append(f"## Attack Timeline\n\n{report.timeline}\n")

    if report.action_plan:
        lines.append("## Action Plan\n")
        for step in report.action_plan:
            urgency = f"**[{step.urgency.upper()}]**"
            lines.append(f"{step.step}. {step.action} {urgency} _{step.owner}_")
        lines.append("")

    if report.recommendations:
        lines.append("## Strategic Recommendations\n")
        for rec in report.recommendations:
            lines.append(f"- {rec}")
        lines.append("")

    if report.ioc_summary:
        lines.append("## Indicators of Compromise\n")
        for ioc in report.ioc_summary:
            lines.append(f"- `{ioc}`")
        lines.append("")

    return "\n".join(lines)


def _format_hitl_html(pending_threats: list[dict]) -> str:
    """Format critical threats for HITL review panel."""
    if not pending_threats:
        return ""

    html = (
        "<div style='padding:12px;background:#fef2f2;border:2px solid #dc2626;"
        "border-radius:8px;margin-bottom:12px;'>"
        "<div style='font-weight:700;color:#dc2626;font-size:16px;margin-bottom:8px;'>"
        f"CRITICAL: {len(pending_threats)} threats require human review</div>"
    )

    for pt in pending_threats:
        html += (
            f"<div style='padding:8px;margin:6px 0;background:white;border-radius:6px;"
            f"border:1px solid #fca5a5;'>"
            f"<div style='font-weight:600;color:#991b1b;'>{pt.get('type', 'unknown').replace('_', ' ').title()}</div>"
            f"<div style='font-size:13px;color:#374151;margin:4px 0;'>{pt.get('description', '')}</div>"
            f"<div style='font-size:12px;color:#6b7280;'>"
            f"Source: {pt.get('source_ip', 'N/A')} | "
            f"MITRE: {pt.get('mitre_technique', 'N/A')} | "
            f"Score: {pt.get('risk_score', 0):.1f}/10</div>"
            f"<div style='font-size:12px;color:#059669;margin-top:4px;'>"
            f"Suggested: {pt.get('suggested_action', 'Investigate')}</div>"
            f"</div>"
        )
    html += "</div>"
    return html


def _format_cost_html(agent_metrics: dict, pipeline_time: float) -> str:
    """Format agent cost/latency breakdown."""
    if not agent_metrics:
        return ""

    total_cost = sum(m.get("cost_usd", 0) for m in agent_metrics.values())
    html = (
        "<div style='margin-top:8px;padding:8px 12px;background:#f0fdf4;"
        "border-radius:6px;font-size:12px;'>"
        "<div style='font-weight:600;color:#166534;margin-bottom:4px;'>Cost Breakdown</div>"
        "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px;'>"
    )
    for name, metrics in agent_metrics.items():
        cost = metrics.get("cost_usd", 0)
        latency = metrics.get("latency_ms", 0)
        html += (
            f"<div style='padding:4px;'>"
            f"<span style='font-weight:600;'>{name}</span>: "
            f"<span style='color:#166534;'>${cost:.4f}</span> "
            f"<span style='color:#6b7280;'>({latency:.0f}ms)</span></div>"
        )
    html += (
        f"</div>"
        f"<div style='margin-top:4px;font-weight:700;color:#166534;'>"
        f"Total: ${total_cost:.4f} in {pipeline_time:.1f}s</div></div>"
    )
    return html


def analyze_logs(log_text: str, thread_state: str | None):
    """Run the pipeline and return results for all panels."""
    if not log_text or not log_text.strip():
        return (
            "<div style='padding:16px;color:#6b7280;'>No logs provided</div>",
            "<div style='padding:16px;color:#6b7280;'>No threats</div>",
            "<div style='padding:16px;color:#6b7280;'>No classification</div>",
            "",  # hitl_html
            gr.update(visible=False),  # hitl_panel visibility
            "No report generated.",
            "",  # cost_html
            None,  # thread_state
        )

    raw_logs = [line.strip() for line in log_text.strip().split("\n") if line.strip()]
    thread_id = str(uuid.uuid4())
    graph = _get_hitl_graph()
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "raw_logs": raw_logs,
        "parsed_logs": [],
        "invalid_count": 0,
        "total_count": 0,
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
    }

    start = time.time()

    try:
        # Stream the graph to detect interrupts
        result = {}
        interrupt_data = None
        for event in graph.stream(initial_state, config, stream_mode="values"):
            result = event

        # Check if graph was interrupted (snapshot has pending tasks)
        snapshot = graph.get_state(config)
        if snapshot.next:
            # Graph is interrupted — HITL needed
            elapsed = time.time() - start
            classified = result.get("classified_threats", [])
            stats = result.get("detection_stats", {})
            agent_metrics = result.get("agent_metrics", {})

            # Build pending threats from classified critical threats
            pending = []
            for ct in classified:
                if ct.risk == "critical":
                    pending.append({
                        "threat_id": ct.threat_id,
                        "type": ct.type,
                        "risk_score": ct.risk_score,
                        "description": ct.description,
                        "source_ip": ct.source_ip,
                        "mitre_technique": ct.mitre_technique,
                        "business_impact": ct.business_impact,
                        "suggested_action": (
                            f"Block {ct.source_ip}" if ct.source_ip else "Investigate immediately"
                        ),
                    })

            stats_html = (
                f"<div style='display:flex;justify-content:space-between;padding:8px 16px;"
                f"background:#fef2f2;border-radius:8px;font-size:12px;color:#991b1b;'>"
                f"<div>Logs: <b>{result.get('total_count', 0)}</b> | "
                f"Threats: <b style='color:#dc2626;'>{stats.get('total_threats', 0)}</b> | "
                f"CRITICAL REVIEW REQUIRED</div>"
                f"<div>Time: <b>{elapsed:.1f}s</b> (paused)</div></div>"
            )

            return (
                stats_html,
                _format_threats_html(classified),
                _format_classification_html(classified),
                _format_hitl_html(pending),
                gr.update(visible=True),
                "*Awaiting human review of critical threats before generating report...*",
                _format_cost_html(agent_metrics, elapsed),
                thread_id,
            )

        # No interrupt — normal completion
        elapsed = time.time() - start
    except Exception as e:
        print(f"[Dashboard] Pipeline error: {e}")
        return (
            f"<div style='padding:16px;color:#dc2626;'>Pipeline error: {e}</div>",
            "", "", "", gr.update(visible=False), "Pipeline failed.", "", None,
        )

    stats = result.get("detection_stats", {})
    classified = result.get("classified_threats", [])
    report = result.get("report")
    agent_metrics = result.get("agent_metrics", {})
    validator_missed = result.get("validator_missed_count", 0)

    # Stats bar
    validator_info = f" | Validator found: <b style='color:#7c3aed;'>{validator_missed}</b>" if validator_missed else ""
    burst_info = f" | Burst: <b>{result.get('chunk_count', 0)}</b> chunks" if result.get("burst_mode") else ""
    stats_html = (
        f"<div style='display:flex;justify-content:space-between;padding:8px 16px;"
        f"background:#f8fafc;border-radius:8px;font-size:12px;color:#6b7280;'>"
        f"<div>Logs: <b>{result.get('total_count', 0)}</b> | "
        f"Threats: <b style='color:#dc2626;'>{stats.get('total_threats', 0)}</b> | "
        f"Invalid: <b style='color:#ca8a04;'>{result.get('invalid_count', 0)}</b>"
        f"{validator_info}{burst_info}</div>"
        f"<div>Time: <b>{elapsed:.1f}s</b></div></div>"
    )

    threats_html = _format_threats_html(classified)
    class_html = _format_classification_html(classified)
    report_md = _format_report_md(report) if report else "No report generated."
    cost_html = _format_cost_html(agent_metrics, elapsed)

    return (
        stats_html, threats_html, class_html,
        "", gr.update(visible=False),
        report_md, cost_html, None,
    )


def resume_pipeline(thread_id: str, decision: str, notes: str):
    """Resume the pipeline after human HITL review."""
    if not thread_id:
        return (
            gr.update(visible=False),
            "Error: No active pipeline to resume.",
            "",
        )

    graph = _get_hitl_graph()
    config = {"configurable": {"thread_id": thread_id}}

    human_decisions = {
        "decision": decision.lower(),
        "reviewer": "dashboard_user",
        "notes": notes,
    }

    try:
        result = {}
        for event in graph.stream(
            Command(resume=human_decisions), config, stream_mode="values"
        ):
            result = event

        report = result.get("report")
        report_md = _format_report_md(report) if report else "No report generated."
        agent_metrics = result.get("agent_metrics", {})
        pipeline_time = result.get("pipeline_time", 0)
        cost_html = _format_cost_html(agent_metrics, pipeline_time)

        return (gr.update(visible=False), report_md, cost_html)
    except Exception as e:
        print(f"[Dashboard] Resume error: {e}")
        return (gr.update(visible=False), f"Error resuming: {e}", "")


def load_sample(sample_name: str) -> str:
    """Load a sample log file."""
    file_map = {
        "Brute Force Attack": "sample_logs/brute_force.txt",
        "Data Exfiltration": "sample_logs/data_exfiltration.txt",
        "Mixed Threats (Multi-Stage)": "sample_logs/mixed_threats.txt",
        "Clean Logs (No Threats)": "sample_logs/clean_logs.txt",
    }
    path = file_map.get(sample_name, "")
    if not path:
        return ""
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        return f"Sample file not found: {path}"


# ── Build Dashboard ──

with gr.Blocks(title="AI NeuralWarden Pipeline v2.0") as demo:
    gr.Markdown(
        "# AI NeuralWarden Pipeline v2.0\n"
        "LangGraph + Anthropic Claude multi-model routing with validator, RAG, and human-in-the-loop"
    )

    # Hidden state for HITL thread tracking
    thread_state = gr.State(value=None)

    # Input section
    with gr.Row():
        with gr.Column(scale=2):
            log_input = gr.Textbox(
                label="Security Logs",
                placeholder="Paste security logs here or load a sample...",
                lines=10,
            )
            with gr.Row():
                sample_dropdown = gr.Dropdown(
                    choices=[
                        "Brute Force Attack",
                        "Data Exfiltration",
                        "Mixed Threats (Multi-Stage)",
                        "Clean Logs (No Threats)",
                    ],
                    label="Load Sample",
                    interactive=True,
                )
                analyze_btn = gr.Button("Analyze Threats", variant="primary", size="lg")

    # Stats bar
    stats_bar = gr.HTML(label="Pipeline Statistics")

    # Cost breakdown
    cost_panel = gr.HTML(label="Cost Breakdown")

    # Results section
    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### Threat Detection")
            threats_panel = gr.HTML(label="Detected Threats")
        with gr.Column(scale=1):
            gr.Markdown("### Risk Classification")
            classification_panel = gr.HTML(label="Risk Classification")

    # HITL Review Panel (hidden by default)
    with gr.Column(visible=False) as hitl_panel:
        gr.Markdown("### Pending Human Review")
        hitl_threats_html = gr.HTML()
        with gr.Row():
            approve_btn = gr.Button("Approve All", variant="primary")
            reject_btn = gr.Button("Reject All", variant="stop")
        hitl_notes = gr.Textbox(label="Reviewer Notes", lines=2, placeholder="Optional notes...")

    gr.Markdown("### Incident Report")
    report_panel = gr.Markdown(label="Incident Report")

    # Wire up events
    sample_dropdown.change(load_sample, inputs=[sample_dropdown], outputs=[log_input])

    analyze_btn.click(
        analyze_logs,
        inputs=[log_input, thread_state],
        outputs=[
            stats_bar, threats_panel, classification_panel,
            hitl_threats_html, hitl_panel,
            report_panel, cost_panel, thread_state,
        ],
    )

    approve_btn.click(
        lambda tid, notes: resume_pipeline(tid, "approve", notes),
        inputs=[thread_state, hitl_notes],
        outputs=[hitl_panel, report_panel, cost_panel],
    )

    reject_btn.click(
        lambda tid, notes: resume_pipeline(tid, "reject", notes),
        inputs=[thread_state, hitl_notes],
        outputs=[hitl_panel, report_panel, cost_panel],
    )

if __name__ == "__main__":
    demo.launch(theme=gr.themes.Soft())
