"""Gradio dashboard for the NeuralWarden AI Security Platform — UI."""

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


# ── Color helpers ──


def _severity_color(risk: str) -> str:
    return {
        "critical": "#dc2626",
        "high": "#ea580c",
        "medium": "#ca8a04",
        "low": "#2563eb",
        "informational": "#6b7280",
    }.get(risk, "#6b7280")


# ── Custom CSS ──

CUSTOM_CSS = """
/* Reset */
.gradio-container {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif !important;
    background: #f8f9fb !important;
}

#main-layout {
    gap: 0 !important;
    min-height: 100vh;
    flex-wrap: nowrap !important;
}

/* Sidebar */
#sidebar {
    background: #1e1b3a !important;
    padding: 0 !important;
    min-height: 100vh;
    max-width: 250px !important;
    min-width: 250px !important;
    overflow-y: auto;
}
#sidebar > div { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
#sidebar .block { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
#sidebar .label-wrap { display: none !important; }

/* Main content */
#main-content {
    background: #f8f9fb !important;
    padding: 0 !important;
    overflow-y: auto;
    flex: 1 !important;
}
#main-content > div { background: transparent !important; border: none !important; box-shadow: none !important; }
#main-content .block { border: none !important; box-shadow: none !important; }
#main-content .label-wrap { display: none !important; }

/* Input section */
#input-section {
    margin: 0 28px 20px !important;
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 12px !important;
    padding: 20px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
}
#input-section .block { background: transparent !important; }
#input-section textarea {
    border: 1px solid #e5e7eb !important;
    border-radius: 8px !important;
    font-size: 13px !important;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace !important;
}

/* Analyze button */
#analyze-btn {
    background: #6c5ce7 !important;
    border: none !important;
    border-radius: 8px !important;
    color: white !important;
    font-weight: 600 !important;
    padding: 10px 28px !important;
    font-size: 14px !important;
    transition: background 0.2s !important;
}
#analyze-btn:hover { background: #5b4bd5 !important; }

/* Report section */
#report-section {
    margin: 0 28px 28px !important;
    background: white !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 12px !important;
    padding: 24px !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
}

/* HITL */
#hitl-section { padding: 0 28px !important; }
#hitl-section .block {
    background: white !important;
    border: 2px solid #dc2626 !important;
    border-radius: 12px !important;
    padding: 16px !important;
}

/* Hide footer */
footer { display: none !important; }

/* Fix Gradio button defaults inside our layout */
.gr-button-primary { background: #6c5ce7 !important; }
.gr-button-stop { background: #dc2626 !important; }
"""

# ── Sidebar HTML ──

SIDEBAR_HTML = """
<div style="height:100vh;overflow-y:auto;color:#a0aec0;font-size:14px;">
    <!-- Logo -->
    <div style="padding:18px 20px;display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,#6c5ce7,#a855f7);border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <span style="color:white;font-size:16px;font-weight:700;letter-spacing:-0.3px;">NeuralWarden</span>
    </div>

    <!-- Account selector -->
    <div style="margin:0 12px 16px;padding:10px 12px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
        <span style="color:#c4c4d4;font-size:13px;font-weight:500;">Security Pipeline v2</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
    </div>

    <!-- Primary nav -->
    <div style="padding:0 8px;">
        <div style="padding:10px 14px;background:rgba(108,92,231,0.18);border-radius:8px;color:white;font-weight:600;margin-bottom:2px;display:flex;align-items:center;gap:10px;cursor:pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Feed
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;color:#8b8fa3;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            Snoozed
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#8b8fa3;">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Ignored
            </div>
            <span id="ignored-badge" style="background:#6c5ce7;color:white;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">0</span>
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;color:#8b8fa3;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Solved
        </div>
    </div>

    <div style="height:1px;background:rgba(255,255,255,0.08);margin:14px 12px;"></div>

    <!-- AutoFix -->
    <div style="padding:0 8px;">
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;color:#8b8fa3;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            AutoFix
        </div>
    </div>

    <div style="height:1px;background:rgba(255,255,255,0.08);margin:14px 12px;"></div>

    <!-- Resources -->
    <div style="padding:0 8px;">
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#8b8fa3;">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                Log Sources
            </div>
            <span style="background:rgba(255,255,255,0.1);color:#8b8fa3;font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;">4</span>
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#8b8fa3;">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/></svg>
                Agents
            </div>
            <span style="background:rgba(255,255,255,0.1);color:#8b8fa3;font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;">6</span>
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#8b8fa3;">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                MITRE ATT&CK
            </div>
            <span style="background:rgba(255,255,255,0.1);color:#8b8fa3;font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;">1</span>
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:#8b8fa3;">
            <div style="display:flex;align-items:center;gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Threat Intel
            </div>
            <span style="background:rgba(255,255,255,0.1);color:#8b8fa3;font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;">1</span>
        </div>
    </div>

    <div style="height:1px;background:rgba(255,255,255,0.08);margin:14px 12px;"></div>

    <!-- Bottom nav -->
    <div style="padding:0 8px 20px;">
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;color:#8b8fa3;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Reports
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;color:#8b8fa3;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Pentests
        </div>
        <div style="padding:10px 14px;border-radius:8px;display:flex;align-items:center;gap:10px;cursor:pointer;color:#8b8fa3;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            Integrations
        </div>
    </div>
</div>
"""

# ── Top bar HTML ──

TOPBAR_HTML = """
<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 28px;background:white;border-bottom:1px solid #eee;">
    <div style="font-size:20px;font-weight:500;color:#1a1a2e;">Hello, Analyst!</div>
    <div style="display:flex;align-items:center;gap:18px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="cursor:pointer;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <span style="color:#6b7280;font-size:14px;cursor:pointer;">Docs</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="cursor:pointer;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#6c5ce7,#a855f7);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:13px;cursor:pointer;">SA</div>
    </div>
</div>
"""


# ── HTML formatters ──


def _format_summary_cards(result: dict | None = None) -> str:
    """Build the four summary cards."""
    if result is None:
        return """
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:16px;padding:20px 28px;">
            <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
                <div style="height:8px;border-radius:4px;background:#f3f4f6;margin-bottom:14px;"></div>
                <div style="display:flex;align-items:baseline;gap:8px;">
                    <span style="font-size:30px;font-weight:700;color:#1a1a2e;">0</span>
                    <span style="font-size:14px;color:#6b7280;">Open Issues</span>
                </div>
            </div>
            <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:22px;height:22px;background:#f59e0b22;border-radius:50%;display:flex;align-items:center;justify-content:center;"><div style="width:9px;height:9px;background:#f59e0b;border-radius:50%;"></div></div>
                    <span style="font-size:14px;color:#6b7280;">Auto Ignored</span>
                </div>
                <div style="font-size:30px;font-weight:700;color:#1a1a2e;">0</div>
                <div style="font-size:12px;color:#9ca3af;margin-top:4px;">0 hours saved</div>
            </div>
            <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:22px;height:22px;background:#3b82f622;border-radius:50%;display:flex;align-items:center;justify-content:center;"><div style="width:9px;height:9px;background:#3b82f6;border-radius:50%;"></div></div>
                    <span style="font-size:14px;color:#6b7280;">New</span>
                </div>
                <div style="font-size:30px;font-weight:700;color:#1a1a2e;">0</div>
                <div style="font-size:12px;color:#9ca3af;margin-top:4px;">awaiting analysis</div>
            </div>
            <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:22px;height:22px;background:#22c55e22;border-radius:50%;display:flex;align-items:center;justify-content:center;"><div style="width:9px;height:9px;background:#22c55e;border-radius:50%;"></div></div>
                    <span style="font-size:14px;color:#6b7280;">Solved</span>
                </div>
                <div style="font-size:30px;font-weight:700;color:#1a1a2e;">0</div>
                <div style="font-size:12px;color:#9ca3af;margin-top:4px;">in last 7 days</div>
            </div>
        </div>"""

    classified = result.get("classified_threats", [])
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for ct in classified:
        if ct.risk in counts:
            counts[ct.risk] += 1

    total = sum(counts.values())
    ignored = result.get("validator_missed_count", 0)
    cleared = result.get("total_count", 0) - total

    # Severity bar
    bar_colors = {"critical": "#dc2626", "high": "#ea580c", "medium": "#2563eb", "low": "#22c55e"}
    bar_html = ""
    if total > 0:
        for level, count in counts.items():
            pct = (count / total) * 100
            if pct > 0:
                bar_html += f"<div style='width:{pct}%;background:{bar_colors[level]};height:100%;'></div>"

    legend = ""
    for level, count in counts.items():
        if count > 0:
            legend += (
                f"<span style='display:inline-flex;align-items:center;gap:4px;margin-right:12px;'>"
                f"<span style='width:8px;height:8px;border-radius:50%;background:{bar_colors[level]};display:inline-block;'></span>"
                f"<span style='font-size:12px;color:#6b7280;'>{count}</span></span>"
            )

    return f"""
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:16px;padding:20px 28px;">
        <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
            <div style="display:flex;gap:0;margin-bottom:14px;height:8px;border-radius:4px;overflow:hidden;background:#f3f4f6;">
                {bar_html}
            </div>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
                <span style="font-size:30px;font-weight:700;color:#1a1a2e;">{total}</span>
                <span style="font-size:14px;color:#6b7280;">Open Issues</span>
            </div>
            <div>{legend}</div>
        </div>
        <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:22px;height:22px;background:#f59e0b22;border-radius:50%;display:flex;align-items:center;justify-content:center;"><div style="width:9px;height:9px;background:#f59e0b;border-radius:50%;"></div></div>
                <span style="font-size:14px;color:#6b7280;">Auto Ignored</span>
            </div>
            <div style="font-size:30px;font-weight:700;color:#1a1a2e;">{ignored}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">{cleared} logs cleared</div>
        </div>
        <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:22px;height:22px;background:#3b82f622;border-radius:50%;display:flex;align-items:center;justify-content:center;"><div style="width:9px;height:9px;background:#3b82f6;border-radius:50%;"></div></div>
                <span style="font-size:14px;color:#6b7280;">New</span>
            </div>
            <div style="font-size:30px;font-weight:700;color:#1a1a2e;">{total}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">detected this session</div>
        </div>
        <div style="background:white;border-radius:12px;padding:20px;border:1px solid #e5e7eb;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:22px;height:22px;background:#22c55e22;border-radius:50%;display:flex;align-items:center;justify-content:center;"><div style="width:9px;height:9px;background:#22c55e;border-radius:50%;"></div></div>
                <span style="font-size:14px;color:#6b7280;">Solved</span>
            </div>
            <div style="font-size:30px;font-weight:700;color:#1a1a2e;">0</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px;">in last 7 days</div>
        </div>
    </div>"""


def _format_filter_bar() -> str:
    """Build the search / filter toolbar."""
    return """
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 28px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
            <div style="display:flex;align-items:center;gap:8px;background:white;border:1px solid #e5e7eb;border-radius:8px;padding:8px 14px;width:200px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <span style="color:#9ca3af;font-size:13px;">Search</span>
            </div>
            <div style="display:flex;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="padding:8px 16px;background:#1a1a2e;color:white;font-size:13px;font-weight:500;cursor:pointer;">All findings</div>
                <div style="padding:8px 16px;background:white;color:#6b7280;font-size:13px;font-weight:500;border-left:1px solid #e5e7eb;cursor:pointer;">AI refined</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:white;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;">
                <span style="font-size:13px;color:#374151;">All types</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <div style="padding:8px 10px;background:white;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;display:flex;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding:8px 14px;background:white;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;">
            <span style="font-size:13px;color:#374151;">Actions</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
    </div>"""


def _threat_type_icon(threat_type: str) -> str:
    """SVG icon for each threat type."""
    icons = {
        "brute_force": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        "port_scan": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        "data_exfiltration": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        "privilege_escalation": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        "lateral_movement": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    }
    return icons.get(
        threat_type,
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    )


def _format_threats_table(classified_threats: list[ClassifiedThreat] | None = None) -> str:
    """Build the findings data table."""
    empty_body = """<tr><td colspan="6" style="text-align:center;padding:48px;color:#9ca3af;font-size:14px;">
        No findings yet. Paste logs and click <b>Analyze Threats</b> to start.
    </td></tr>"""

    if not classified_threats:
        rows = empty_body
    else:
        rows = ""
        for ct in classified_threats:
            color = _severity_color(ct.risk)
            icon = _threat_type_icon(ct.type)

            severity_badge = (
                f"<span style='display:inline-flex;align-items:center;gap:5px;'>"
                f"<span style='width:8px;height:8px;border-radius:50%;background:{color};display:inline-block;'></span>"
                f"<span style='color:{color};font-weight:600;font-size:13px;'>{ct.risk.title()}</span></span>"
            )

            if ct.method == "validator_detected":
                status_label, status_style = "Validator", "color:#7c3aed;border:1px solid #c4b5fd;background:#f5f3ff;"
            else:
                status_label, status_style = "New", "color:#3b82f6;border:1px solid #93c5fd;background:#eff6ff;"
            status_badge = f"<span style='padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;{status_style}'>{status_label}</span>"

            location = ct.source_ip or "N/A"
            affected = ct.affected_systems[0] if ct.affected_systems else ""
            if affected:
                location_html = (
                    f"<div style='display:flex;align-items:center;gap:5px;'>"
                    f"<svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='#6b7280' stroke-width='2'><rect x='2' y='2' width='20' height='8' rx='2'/><rect x='2' y='14' width='20' height='8' rx='2'/></svg>"
                    f"<span style='color:#374151;font-size:13px;'>{affected}</span></div>"
                )
            else:
                location_html = f"<span style='color:#374151;font-size:13px;'>{location}</span>"

            desc = ct.description[:90] + "..." if len(ct.description) > 90 else ct.description
            mitre = f" <span style='color:#9ca3af;font-size:11px;'>({ct.mitre_technique})</span>" if ct.mitre_technique else ""

            rows += (
                f"<tr style='border-bottom:1px solid #f3f4f6;' "
                f"onmouseover=\"this.style.background='#f9fafb'\" onmouseout=\"this.style.background='white'\">"
                f"<td style='padding:14px 16px;width:50px;'>{icon}</td>"
                f"<td style='padding:14px 16px;'>"
                f"<div style='font-weight:500;color:#1a1a2e;font-size:13px;'>{ct.type.replace('_', ' ').title()}{mitre}</div>"
                f"<div style='color:#6b7280;font-size:12px;margin-top:2px;'>{desc}</div></td>"
                f"<td style='padding:14px 16px;'>{severity_badge}</td>"
                f"<td style='padding:14px 16px;'>{location_html}</td>"
                f"<td style='padding:14px 16px;font-size:13px;color:#374151;'>{ct.confidence:.0%}</td>"
                f"<td style='padding:14px 16px;'>{status_badge}</td></tr>"
            )

    return (
        f"<div style='background:white;border-radius:12px;border:1px solid #e5e7eb;margin:0 28px;overflow:hidden;'>"
        f"<table style='width:100%;border-collapse:collapse;'>"
        f"<thead><tr style='border-bottom:2px solid #e5e7eb;'>"
        f"<th style='text-align:left;padding:14px 16px;font-weight:600;color:#374151;font-size:13px;width:50px;'>Type</th>"
        f"<th style='text-align:left;padding:14px 16px;font-weight:600;color:#374151;font-size:13px;'>Name</th>"
        f"<th style='text-align:left;padding:14px 16px;font-weight:600;color:#374151;font-size:13px;'>Severity</th>"
        f"<th style='text-align:left;padding:14px 16px;font-weight:600;color:#374151;font-size:13px;'>Location</th>"
        f"<th style='text-align:left;padding:14px 16px;font-weight:600;color:#374151;font-size:13px;'>Confidence</th>"
        f"<th style='text-align:left;padding:14px 16px;font-weight:600;color:#374151;font-size:13px;'>Status</th>"
        f"</tr></thead><tbody>{rows}</tbody></table></div>"
    )


def _format_hitl_html(pending_threats: list[dict]) -> str:
    """Format critical threats for HITL review panel."""
    if not pending_threats:
        return ""

    html = (
        "<div style='padding:16px 20px;background:#fef2f2;border:2px solid #dc2626;"
        "border-radius:12px;margin:16px 28px;'>"
        "<div style='font-weight:700;color:#dc2626;font-size:16px;margin-bottom:12px;display:flex;align-items:center;gap:8px;'>"
        "<svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='#dc2626' stroke-width='2'>"
        "<path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/>"
        "<line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>"
        f"CRITICAL: {len(pending_threats)} threats require human review</div>"
    )

    for pt in pending_threats:
        html += (
            f"<div style='padding:12px;margin:8px 0;background:white;border-radius:8px;"
            f"border:1px solid #fca5a5;'>"
            f"<div style='font-weight:600;color:#991b1b;'>{pt.get('type', 'unknown').replace('_', ' ').title()}</div>"
            f"<div style='font-size:13px;color:#374151;margin:4px 0;'>{pt.get('description', '')}</div>"
            f"<div style='font-size:12px;color:#6b7280;'>"
            f"Source: {pt.get('source_ip', 'N/A')} | "
            f"MITRE: {pt.get('mitre_technique', 'N/A')} | "
            f"Score: {pt.get('risk_score', 0):.1f}/10</div>"
            f"<div style='font-size:12px;color:#059669;margin-top:4px;'>"
            f"Suggested: {pt.get('suggested_action', 'Investigate')}</div></div>"
        )
    html += "</div>"
    return html


def _format_cost_html(agent_metrics: dict, pipeline_time: float) -> str:
    """Agent cost / latency breakdown card."""
    if not agent_metrics:
        return ""

    total_cost = sum(m.get("cost_usd", 0) for m in agent_metrics.values())
    html = (
        "<div style='margin:16px 28px;padding:20px;background:white;"
        "border-radius:12px;border:1px solid #e5e7eb;font-size:13px;'>"
        "<div style='font-weight:600;color:#166534;margin-bottom:10px;display:flex;align-items:center;gap:6px;'>"
        "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#166534' stroke-width='2'>"
        "<line x1='12' y1='1' x2='12' y2='23'/>"
        "<path d='M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'/></svg>"
        "Cost Breakdown</div>"
        "<div style='display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;'>"
    )
    for name, metrics in agent_metrics.items():
        cost = metrics.get("cost_usd", 0)
        latency = metrics.get("latency_ms", 0)
        html += (
            f"<div style='padding:10px;background:#f0fdf4;border-radius:8px;'>"
            f"<div style='font-weight:600;color:#374151;font-size:12px;'>{name}</div>"
            f"<div style='color:#166534;font-weight:700;'>${cost:.4f}</div>"
            f"<div style='color:#9ca3af;font-size:11px;'>{latency:.0f}ms</div></div>"
        )
    html += (
        f"</div><div style='margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;"
        f"font-weight:700;color:#166534;'>Total: ${total_cost:.4f} in {pipeline_time:.1f}s</div></div>"
    )
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


# ── Pipeline callbacks ──


def analyze_logs(log_text: str, thread_state: str | None):
    """Run the pipeline and return results for all panels."""
    if not log_text or not log_text.strip():
        return (
            _format_summary_cards(None),
            _format_filter_bar() + _format_threats_table(None),
            "",
            gr.update(visible=False),
            "No report generated.",
            "",
            None,
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
        result = {}
        for event in graph.stream(initial_state, config, stream_mode="values"):
            result = event

        snapshot = graph.get_state(config)
        if snapshot.next:
            # Graph interrupted — HITL needed
            elapsed = time.time() - start
            classified = result.get("classified_threats", [])
            agent_metrics = result.get("agent_metrics", {})

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

            return (
                _format_summary_cards(result),
                _format_filter_bar() + _format_threats_table(classified),
                _format_hitl_html(pending),
                gr.update(visible=True),
                "*Awaiting human review of critical threats before generating report...*",
                _format_cost_html(agent_metrics, elapsed),
                thread_id,
            )

        elapsed = time.time() - start
    except Exception as e:
        print(f"[Dashboard] Pipeline error: {e}")
        return (
            _format_summary_cards(None),
            f"<div style='padding:24px 28px;color:#dc2626;font-size:14px;'>Pipeline error: {e}</div>",
            "",
            gr.update(visible=False),
            "Pipeline failed.",
            "",
            None,
        )

    classified = result.get("classified_threats", [])
    report = result.get("report")
    agent_metrics = result.get("agent_metrics", {})

    return (
        _format_summary_cards(result),
        _format_filter_bar() + _format_threats_table(classified),
        "",
        gr.update(visible=False),
        _format_report_md(report) if report else "No report generated.",
        _format_cost_html(agent_metrics, elapsed),
        None,
    )


def resume_pipeline(thread_id: str, decision: str, notes: str):
    """Resume the pipeline after human HITL review."""
    if not thread_id:
        return (gr.update(visible=False), "Error: No active pipeline to resume.", "")

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

with gr.Blocks(title="NeuralWarden \u2014 Security Dashboard") as demo:
    thread_state = gr.State(value=None)

    with gr.Row(elem_id="main-layout"):
        # ── Sidebar ──
        with gr.Column(scale=1, min_width=250, elem_id="sidebar"):
            gr.HTML(SIDEBAR_HTML)

        # ── Main Content ──
        with gr.Column(scale=5, elem_id="main-content"):
            gr.HTML(TOPBAR_HTML)

            # Summary cards (dynamic)
            summary_cards = gr.HTML(value=_format_summary_cards(None))

            # Input section
            with gr.Group(elem_id="input-section"):
                log_input = gr.Textbox(
                    label="Paste Security Logs",
                    placeholder="Paste security logs here or load a sample scenario...",
                    lines=6,
                    show_label=True,
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
                    analyze_btn = gr.Button(
                        "Analyze Threats",
                        variant="primary",
                        size="lg",
                        elem_id="analyze-btn",
                    )

            # Findings table (dynamic)
            threats_table = gr.HTML(
                value=_format_filter_bar() + _format_threats_table(None),
            )

            # Cost breakdown (dynamic)
            cost_panel = gr.HTML()

            # HITL Review Panel (hidden by default)
            with gr.Column(visible=False) as hitl_panel:
                hitl_threats_html = gr.HTML()
                with gr.Row():
                    approve_btn = gr.Button("Approve All", variant="primary")
                    reject_btn = gr.Button("Reject All", variant="stop")
                hitl_notes = gr.Textbox(
                    label="Reviewer Notes",
                    lines=2,
                    placeholder="Optional notes...",
                )

            # Incident report
            with gr.Group(elem_id="report-section"):
                gr.Markdown("### Incident Report")
                report_panel = gr.Markdown(value="No report generated.")

    # ── Wire up events ──
    sample_dropdown.change(load_sample, inputs=[sample_dropdown], outputs=[log_input])

    analyze_btn.click(
        analyze_logs,
        inputs=[log_input, thread_state],
        outputs=[
            summary_cards,
            threats_table,
            hitl_threats_html,
            hitl_panel,
            report_panel,
            cost_panel,
            thread_state,
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
    demo.launch(theme=gr.themes.Soft(), css=CUSTOM_CSS)
