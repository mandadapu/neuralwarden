"""CLI entry point for the AI NeuralWarden Pipeline."""

import sys

from dotenv import load_dotenv

from models.incident_report import IncidentReport
from pipeline.graph import run_pipeline


def format_report(report: IncidentReport) -> str:
    """Format an IncidentReport as readable text."""
    lines = []
    lines.append("=" * 70)
    lines.append("  INCIDENT REPORT")
    lines.append("=" * 70)
    lines.append("")

    # Summary
    lines.append("EXECUTIVE SUMMARY")
    lines.append("-" * 40)
    lines.append(report.summary)
    lines.append("")

    # Severity counts
    lines.append("THREAT OVERVIEW")
    lines.append("-" * 40)
    lines.append(f"  Total threats:  {report.threat_count}")
    lines.append(f"  Critical:       {report.critical_count}")
    lines.append(f"  High:           {report.high_count}")
    lines.append(f"  Medium:         {report.medium_count}")
    lines.append(f"  Low:            {report.low_count}")
    lines.append("")

    # Timeline
    if report.timeline:
        lines.append("ATTACK TIMELINE")
        lines.append("-" * 40)
        lines.append(report.timeline)
        lines.append("")

    # Action plan
    if report.action_plan:
        lines.append("ACTION PLAN")
        lines.append("-" * 40)
        for step in report.action_plan:
            urgency_tag = f"[{step.urgency.upper()}]"
            lines.append(f"  {step.step}. {step.action} {urgency_tag} ({step.owner})")
        lines.append("")

    # IOCs
    if report.ioc_summary:
        lines.append("INDICATORS OF COMPROMISE")
        lines.append("-" * 40)
        for ioc in report.ioc_summary:
            lines.append(f"  - {ioc}")
        lines.append("")

    # MITRE
    if report.mitre_techniques:
        lines.append("MITRE ATT&CK TECHNIQUES")
        lines.append("-" * 40)
        lines.append(f"  {', '.join(report.mitre_techniques)}")
        lines.append("")

    # Recommendations
    if report.recommendations:
        lines.append("STRATEGIC RECOMMENDATIONS")
        lines.append("-" * 40)
        for i, rec in enumerate(report.recommendations, 1):
            lines.append(f"  {i}. {rec}")
        lines.append("")

    lines.append("=" * 70)
    lines.append(f"  Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 70)
    return "\n".join(lines)


def cli():
    """Run the pipeline from command line."""
    load_dotenv()

    # Read logs from file argument or stdin
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
        try:
            with open(log_file) as f:
                raw_logs = [line.strip() for line in f if line.strip()]
        except FileNotFoundError:
            print(f"Error: File not found: {log_file}")
            sys.exit(1)
    else:
        print("Reading logs from stdin (Ctrl+D to finish)...")
        raw_logs = [line.strip() for line in sys.stdin if line.strip()]

    if not raw_logs:
        print("No log entries provided.")
        sys.exit(1)

    print(f"\nAnalyzing {len(raw_logs)} log entries...\n")

    # Run pipeline
    result = run_pipeline(raw_logs)

    # Print stats
    stats = result.get("detection_stats", {})
    print(f"Pipeline completed in {result.get('pipeline_time', 0):.1f}s")
    print(f"  Parsed: {result.get('total_count', 0)} logs ({result.get('invalid_count', 0)} invalid)")
    print(f"  Detected: {stats.get('total_threats', 0)} threats "
          f"({stats.get('rules_matched', 0)} rule-based, {stats.get('ai_detections', 0)} AI)")
    print(f"  Classified: {len(result.get('classified_threats', []))} threats")
    print()

    # Print report
    report = result.get("report")
    if report:
        print(format_report(report))
    else:
        print("No report generated.")


if __name__ == "__main__":
    cli()
