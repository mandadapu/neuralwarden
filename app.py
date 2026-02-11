"""Gradio dashboard for the AI NeuralWarden Pipeline."""

import time

import gradio as gr
from dotenv import load_dotenv

from models.incident_report import IncidentReport
from models.threat import ClassifiedThreat
from pipeline.graph import run_pipeline

load_dotenv()


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
        rows.append(
            f"<div style='display:flex;align-items:center;justify-content:space-between;"
            f"padding:8px 12px;margin:4px 0;border-radius:8px;border:1px solid {color}33;"
            f"background:{color}0d;'>"
            f"<div style='display:flex;align-items:center;gap:8px;'>"
            f"<span style='width:8px;height:8px;border-radius:50%;background:{color};display:inline-block;'></span>"
            f"<span style='font-weight:600;color:{color};'>{ct.type.replace('_', ' ').title()}</span>"
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


def analyze_logs(log_text: str) -> tuple[str, str, str, str]:
    """Run the pipeline and return results for all 4 panels."""
    if not log_text or not log_text.strip():
        return (
            "<div style='padding:16px;color:#6b7280;'>No logs provided</div>",
            "<div style='padding:16px;color:#6b7280;'>No threats</div>",
            "<div style='padding:16px;color:#6b7280;'>No classification</div>",
            "No report generated.",
        )

    raw_logs = [line.strip() for line in log_text.strip().split("\n") if line.strip()]

    start = time.time()
    result = run_pipeline(raw_logs)
    elapsed = time.time() - start

    stats = result.get("detection_stats", {})
    classified = result.get("classified_threats", [])
    report = result.get("report")

    # Stats bar
    stats_html = (
        f"<div style='display:flex;justify-content:space-between;padding:8px 16px;"
        f"background:#f8fafc;border-radius:8px;font-size:12px;color:#6b7280;'>"
        f"<div>Logs: <b>{result.get('total_count', 0)}</b> | "
        f"Threats: <b style='color:#dc2626;'>{stats.get('total_threats', 0)}</b> | "
        f"Invalid: <b style='color:#ca8a04;'>{result.get('invalid_count', 0)}</b></div>"
        f"<div>Time: <b>{elapsed:.1f}s</b></div></div>"
    )

    threats_html = _format_threats_html(classified)
    class_html = _format_classification_html(classified)
    report_md = _format_report_md(report) if report else "No report generated."

    return stats_html, threats_html, class_html, report_md


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

with gr.Blocks(
    title="AI NeuralWarden Pipeline",
) as demo:
    gr.Markdown(
        "# AI NeuralWarden Pipeline\n"
        "LangGraph + Anthropic Claude multi-model routing for automated security log analysis"
    )

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

    # Results section
    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### Threat Detection")
            threats_panel = gr.HTML(label="Detected Threats")
        with gr.Column(scale=1):
            gr.Markdown("### Risk Classification")
            classification_panel = gr.HTML(label="Risk Classification")

    gr.Markdown("### Incident Report")
    report_panel = gr.Markdown(label="Incident Report")

    # Wire up events
    sample_dropdown.change(load_sample, inputs=[sample_dropdown], outputs=[log_input])
    analyze_btn.click(
        analyze_logs,
        inputs=[log_input],
        outputs=[stats_bar, threats_panel, classification_panel, report_panel],
    )

if __name__ == "__main__":
    demo.launch(theme=gr.themes.Soft())
