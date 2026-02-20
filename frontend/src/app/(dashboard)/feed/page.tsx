"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useAnalysisContext } from "@/context/AnalysisContext";
import { listAllCloudIssues, setApiUserEmail, updateIssueStatus } from "@/lib/api";
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
  const [hiddenCloudIds, setHiddenCloudIds] = useState<Set<string>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const {
    isLoading, result, error, logText, skipIngest, autoAnalyze, pipelineProgress, setLogText, setAutoAnalyze, runAnalysis, resume,
    updateThreat, snoozeThreat, ignoreThreat, addThreatTo, snoozedThreats, ignoredThreats, loadLatestReport,
  } = useAnalysisContext();

  const refreshFeed = useCallback(async () => {
    if (!session?.user?.email) return;
    setRefreshing(true);
    setApiUserEmail(session.user.email);
    await loadLatestReport();
    try {
      let issues = await listAllCloudIssues();
      issues = issues.filter((i) => i.status === "todo" || i.status === "in_progress");
      setCloudThreats(issues.map(cloudIssueToThreat));
    } catch {}
    setLastRefreshed(new Date());
    setRefreshing(false);
  }, [session?.user?.email, loadLatestReport]);

  // Fetch on mount
  useEffect(() => {
    refreshFeed();
  }, [refreshFeed]);

  // Auto-start analysis when redirected from GCP fetch
  useEffect(() => {
    if (autoAnalyze && logText.trim() && !isLoading) {
      setAutoAnalyze(false);
      runAnalysis(logText);
    }
  }, [autoAnalyze, logText, isLoading, setAutoAnalyze, runAnalysis]);

  // Combine threat pipeline results with cloud scan issues
  // Filter out cloud issues already moved to snoozed/ignored/resolved
  const snoozedIds = new Set(snoozedThreats.map((t) => t.threat_id));
  const ignoredIds = new Set(ignoredThreats.map((t) => t.threat_id));
  const pipelineThreats = result?.classified_threats ?? [];
  const visibleCloudThreats = cloudThreats.filter(
    (t) => !hiddenCloudIds.has(t.threat_id) && !snoozedIds.has(t.threat_id) && !ignoredIds.has(t.threat_id)
  );
  const allThreats = [...visibleCloudThreats, ...pipelineThreats];

  // Build summary from what's actually displayed in the table
  const combinedSummary: Summary = {
    total_threats: allThreats.length,
    severity_counts: {
      critical: allThreats.filter((t) => t.risk === "critical").length,
      high: allThreats.filter((t) => t.risk === "high").length,
      medium: allThreats.filter((t) => t.risk === "medium").length,
      low: allThreats.filter((t) => t.risk === "low").length,
    },
    auto_ignored: result?.summary?.auto_ignored ?? 0,
    total_logs: result?.summary?.total_logs ?? 0,
    logs_cleared: result?.summary?.logs_cleared ?? 0,
  };

  const selectedThreat = selectedThreatIndex !== null ? allThreats[selectedThreatIndex] : null;

  const handleAction = async (threatId: string, action: string) => {
    // Check if this is a cloud issue (vs pipeline threat)
    const cloudThreat = cloudThreats.find((t) => t.threat_id === threatId);

    if (cloudThreat) {
      // Map action to backend status and context destination
      const actionConfig: Record<string, { backendStatus: string; destination: "snoozed" | "ignored" | "resolved" }> = {
        snooze: { backendStatus: "in_progress", destination: "snoozed" },
        ignore: { backendStatus: "ignored", destination: "ignored" },
        solve: { backendStatus: "resolved", destination: "resolved" },
      };
      const config = actionConfig[action];
      if (config) {
        try {
          await updateIssueStatus(threatId, config.backendStatus);
        } catch (err) {
          console.error("Failed to update cloud issue status:", err);
          return;
        }
        // Add to context list (shows in Snoozed/Ignored/Resolved pages)
        addThreatTo(cloudThreat, config.destination);
        // Remove from feed
        setCloudThreats((prev) => prev.filter((t) => t.threat_id !== threatId));
        setHiddenCloudIds((prev) => new Set(prev).add(threatId));
      }
      setSelectedThreatIndex(null);
      return;
    }

    // Pipeline threat — use AnalysisContext
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

      {/* Last refreshed + refresh button */}
      <div className="flex items-center justify-between mx-7 mb-3">
        <div className="text-xs text-[#8b949e]">
          {lastRefreshed
            ? `Last refreshed: ${lastRefreshed.toLocaleTimeString()}`
            : "Loading..."}
        </div>
        <button
          onClick={refreshFeed}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors disabled:opacity-50 cursor-pointer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={refreshing ? "animate-spin" : ""}
          >
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

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
