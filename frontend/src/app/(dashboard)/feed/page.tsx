"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAnalysisContext } from "@/context/AnalysisContext";
import { listAllCloudIssues, setApiUserEmail } from "@/lib/api";
import type { ClassifiedThreat, CloudIssue, Summary } from "@/lib/types";
import SummaryCards from "@/components/SummaryCards";
import PipelineProgress from "@/components/PipelineProgress";
import ThreatsTable from "@/components/ThreatsTable";
import HitlReviewPanel from "@/components/HitlReviewPanel";
import CostBreakdown from "@/components/CostBreakdown";
import IncidentReport from "@/components/IncidentReport";
import ThreatDetailPanel from "@/components/ThreatDetailPanel";

const RISK_SCORES: Record<string, number> = {
  critical: 95,
  high: 75,
  medium: 50,
  low: 25,
};

function cloudIssueToThreat(issue: CloudIssue): ClassifiedThreat {
  return {
    threat_id: issue.id,
    type: issue.title,
    confidence: 1.0,
    source_log_indices: [],
    method: "rule_based",
    description: issue.description,
    source_ip: "",
    risk: issue.severity,
    risk_score: RISK_SCORES[issue.severity] ?? 50,
    mitre_technique: issue.rule_code,
    mitre_tactic: "",
    business_impact: issue.title,
    affected_systems: issue.location ? [issue.location] : [],
    remediation_priority: RISK_SCORES[issue.severity] ?? 50,
  };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [selectedThreatIndex, setSelectedThreatIndex] = useState<number | null>(null);
  const [cloudThreats, setCloudThreats] = useState<ClassifiedThreat[]>([]);
  const {
    isLoading, result, error, logText, skipIngest, autoAnalyze, pipelineProgress, setLogText, setAutoAnalyze, runAnalysis, resume,
    updateThreat, snoozeThreat, ignoreThreat,
  } = useAnalysisContext();

  // Fetch cloud scan issues
  useEffect(() => {
    if (!session?.user?.email) return;
    setApiUserEmail(session.user.email);
    listAllCloudIssues().then((issues) => {
      // Filter out resolved issues (solved/ignored) — show todo + in_progress
      issues = issues.filter((i) => i.status === "todo" || i.status === "in_progress");
      setCloudThreats(issues.map(cloudIssueToThreat));
    }).catch(() => {});
  }, [session?.user?.email]);

  // Auto-start analysis when redirected from GCP fetch
  useEffect(() => {
    if (autoAnalyze && logText.trim() && !isLoading) {
      setAutoAnalyze(false);
      runAnalysis(logText);
    }
  }, [autoAnalyze, logText, isLoading, setAutoAnalyze, runAnalysis]);

  // Combine threat pipeline results with cloud scan issues
  const pipelineThreats = result?.classified_threats ?? [];
  const allThreats = [...cloudThreats, ...pipelineThreats];

  // Build combined summary
  const combinedSummary: Summary = result?.summary
    ? {
        ...result.summary,
        total_threats: result.summary.total_threats + cloudThreats.length,
        severity_counts: {
          critical: (result.summary.severity_counts.critical ?? 0) + cloudThreats.filter((t) => t.risk === "critical").length,
          high: (result.summary.severity_counts.high ?? 0) + cloudThreats.filter((t) => t.risk === "high").length,
          medium: (result.summary.severity_counts.medium ?? 0) + cloudThreats.filter((t) => t.risk === "medium").length,
          low: (result.summary.severity_counts.low ?? 0) + cloudThreats.filter((t) => t.risk === "low").length,
        },
      }
    : {
        total_threats: cloudThreats.length,
        severity_counts: {
          critical: cloudThreats.filter((t) => t.risk === "critical").length,
          high: cloudThreats.filter((t) => t.risk === "high").length,
          medium: cloudThreats.filter((t) => t.risk === "medium").length,
          low: cloudThreats.filter((t) => t.risk === "low").length,
        },
        auto_ignored: 0,
        total_logs: 0,
        logs_cleared: 0,
      };

  const selectedThreat = selectedThreatIndex !== null ? allThreats[selectedThreatIndex] : null;

  const handleAction = (threatId: string, action: string) => {
    switch (action) {
      case "ignore":
        ignoreThreat(threatId);
        setSelectedThreatIndex(null);
        break;
      case "snooze":
        snoozeThreat(threatId);
        setSelectedThreatIndex(null);
        break;
      case "adjust_critical":
        updateThreat(threatId, { risk: "critical" });
        break;
      case "adjust_high":
        updateThreat(threatId, { risk: "high" });
        break;
      case "adjust_medium":
        updateThreat(threatId, { risk: "medium" });
        break;
      case "adjust_low":
        updateThreat(threatId, { risk: "low" });
        break;
    }
  };

  return (
    <>
      <SummaryCards summary={combinedSummary} />

      {isLoading && pipelineProgress.length > 0 && (
        <PipelineProgress stages={pipelineProgress} />
      )}

      {error && (
        <div className="mx-7 mb-4 p-4 bg-red-950/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      <ThreatsTable
        threats={allThreats}
        onThreatClick={(_threat, index) => setSelectedThreatIndex(index)}
      />

      {result?.status === "hitl_required" && (
        <HitlReviewPanel
          threats={result.pending_critical_threats}
          onResume={resume}
          isLoading={isLoading}
        />
      )}

      {result && (
        <CostBreakdown
          agentMetrics={result.agent_metrics}
          pipelineTime={result.pipeline_time}
        />
      )}

      {result?.status === "hitl_required" && (
        <div className="mx-7 mb-4 p-4 bg-yellow-950/20 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm italic">
          Awaiting human review of critical threats before generating report...
        </div>
      )}

      <IncidentReport report={result?.report ?? null} analysisId={result?.analysis_id} />

      {selectedThreat && (
        <ThreatDetailPanel
          threat={selectedThreat}
          threats={allThreats}
          currentIndex={selectedThreatIndex!}
          onClose={() => setSelectedThreatIndex(null)}
          onNavigate={(index) => setSelectedThreatIndex(index)}
          onAction={handleAction}
        />
      )}
    </>
  );
}
