"""Generate downloadable PDF incident reports from saved analyses."""

from __future__ import annotations

from datetime import datetime

from fpdf import FPDF


def generate_pdf(analysis_data: dict) -> bytes:
    """Generate a PDF incident report from analysis data.

    Args:
        analysis_data: dict with keys report_json, threats_json, created_at,
            log_count, threat_count, critical_count, pipeline_time, pipeline_cost.

    Returns:
        PDF file content as bytes.
    """
    report = analysis_data.get("report_json") or {}
    threats = analysis_data.get("threats_json") or []
    created_at = analysis_data.get("created_at", "")
    log_count = analysis_data.get("log_count", 0)
    threat_count = analysis_data.get("threat_count", 0)
    critical_count = analysis_data.get("critical_count", 0)
    pipeline_time = analysis_data.get("pipeline_time", 0.0)
    pipeline_cost = analysis_data.get("pipeline_cost", 0.0)

    # Parse date for display
    try:
        dt = datetime.fromisoformat(created_at)
        date_str = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, TypeError):
        date_str = str(created_at) if created_at else "N/A"

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── Header ──────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 12, "Incident Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, f"Generated: {date_str}", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.cell(
        0,
        6,
        f"Logs: {log_count}  |  Threats: {threat_count}  |  Critical: {critical_count}"
        f"  |  Time: {pipeline_time:.1f}s  |  Cost: ${pipeline_cost:.4f}",
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )
    pdf.set_text_color(0, 0, 0)
    pdf.ln(6)

    # ── Executive Summary ───────────────────────────────────────────────
    _section_heading(pdf, "Executive Summary")
    summary_text = report.get("summary", "No summary available.")
    _write_body(pdf, summary_text)
    pdf.ln(4)

    # ── Threat Overview Table ───────────────────────────────────────────
    if threats:
        _section_heading(pdf, "Threat Overview")
        _threat_table(pdf, threats)
        pdf.ln(4)

    # ── Severity Breakdown ──────────────────────────────────────────────
    if threats:
        _section_heading(pdf, "Severity Breakdown")
        severity_counts: dict[str, int] = {}
        for t in threats:
            risk = str(t.get("risk", "unknown")).lower()
            severity_counts[risk] = severity_counts.get(risk, 0) + 1
        for level in ("critical", "high", "medium", "low", "info"):
            count = severity_counts.get(level, 0)
            if count:
                pdf.set_font("Helvetica", "", 10)
                pdf.cell(0, 6, f"  {level.capitalize()}: {count}", new_x="LMARGIN", new_y="NEXT")
        # Include any unlisted severities
        for level, count in severity_counts.items():
            if level not in ("critical", "high", "medium", "low", "info") and count:
                pdf.set_font("Helvetica", "", 10)
                pdf.cell(0, 6, f"  {level.capitalize()}: {count}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # ── Timeline ────────────────────────────────────────────────────────
    timeline = report.get("timeline")
    if timeline:
        _section_heading(pdf, "Timeline")
        _write_body(pdf, str(timeline))
        pdf.ln(4)

    # ── Action Plan ─────────────────────────────────────────────────────
    action_plan = report.get("action_plan") or []
    if action_plan:
        _section_heading(pdf, "Action Plan")
        for i, item in enumerate(action_plan, 1):
            if isinstance(item, dict):
                action = item.get("action", "")
                urgency = item.get("urgency", "")
                owner = item.get("owner", "")
                tag = f" [{urgency}]" if urgency else ""
                owner_str = f" (Owner: {owner})" if owner else ""
                _write_body(pdf, f"{i}. {action}{tag}{owner_str}")
            else:
                _write_body(pdf, f"{i}. {item}")
        pdf.ln(4)

    # ── IOCs ────────────────────────────────────────────────────────────
    iocs = report.get("ioc_summary") or []
    if iocs:
        _section_heading(pdf, "Indicators of Compromise (IOCs)")
        for ioc in iocs:
            pdf.set_font("Courier", "", 9)
            pdf.cell(0, 5, f"  - {_safe(str(ioc))}", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.ln(4)

    # ── MITRE Techniques ────────────────────────────────────────────────
    mitre = report.get("mitre_techniques") or []
    if mitre:
        _section_heading(pdf, "MITRE ATT&CK Techniques")
        for tech in mitre:
            _write_body(pdf, f"  - {tech}")
        pdf.ln(4)

    # ── Recommendations ─────────────────────────────────────────────────
    recommendations = report.get("recommendations") or []
    if recommendations:
        _section_heading(pdf, "Recommendations")
        for rec in recommendations:
            _write_body(pdf, f"  - {rec}")
        pdf.ln(4)

    return bytes(pdf.output())


# ── Helpers ─────────────────────────────────────────────────────────────


def _safe(text: str) -> str:
    """Replace characters that latin-1 cannot encode."""
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _section_heading(pdf: FPDF, title: str) -> None:
    """Render a bold section heading with a bottom line."""
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(3)


def _write_body(pdf: FPDF, text: str) -> None:
    """Write a paragraph of body text."""
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(0, 5, _safe(text))


def _threat_table(pdf: FPDF, threats: list[dict]) -> None:
    """Render the threat overview table."""
    # Available width: A4 = 210mm, default margins = 10mm each side => 190mm
    col_widths = [38, 38, 24, 20, 70]  # ID, Type, Risk, Score, Source IP
    headers = ["ID", "Type", "Risk", "Score", "Source IP"]

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(240, 240, 240)
    for header, w in zip(headers, col_widths):
        pdf.cell(w, 7, header, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 9)
    for t in threats:
        row = [
            _safe(str(t.get("threat_id", ""))),
            _safe(str(t.get("type", ""))),
            _safe(str(t.get("risk", ""))),
            _safe(str(t.get("risk_score", ""))),
            _safe(str(t.get("source_ip", ""))),
        ]
        for value, w in zip(row, col_widths):
            # Truncate to a safe number of characters based on column width
            max_chars = max(4, int(w / 2.2))
            display = (value[:max_chars - 1] + "~") if len(value) > max_chars else value
            pdf.cell(w, 6, display, border=1)
        pdf.ln()
