"use client";

import { useState } from "react";
import { useAnalysisContext } from "@/context/AnalysisContext";
import Topbar from "@/components/Topbar";
import SummaryCards from "@/components/SummaryCards";
import LogInput from "@/components/LogInput";
import ThreatsTable from "@/components/ThreatsTable";
import HitlReviewPanel from "@/components/HitlReviewPanel";
import CostBreakdown from "@/components/CostBreakdown";
import IncidentReport from "@/components/IncidentReport";
import ThreatDetailPanel from "@/components/ThreatDetailPanel";

export default function DashboardPage() {
  const [selectedThreatIndex, setSelectedThreatIndex] = useState<number | null>(null);
  const {
    isLoading, result, error, logText, setLogText, runAnalysis, resume,
    updateThreat, snoozeThreat, ignoreThreat,
  } = useAnalysisContext();

  const threats = result?.classified_threats ?? [];
  const selectedThreat = selectedThreatIndex !== null ? threats[selectedThreatIndex] : null;

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
      <Topbar />

      <SummaryCards summary={result?.summary ?? null} />

      <LogInput
        value={logText}
        onChange={setLogText}
        onAnalyze={() => runAnalysis(logText)}
        isLoading={isLoading}
      />

      {error && (
        <div className="mx-7 mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <ThreatsTable
        threats={threats}
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
        <div className="mx-7 mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm italic">
          Awaiting human review of critical threats before generating report...
        </div>
      )}

      <IncidentReport report={result?.report ?? null} />

      {selectedThreat && (
        <ThreatDetailPanel
          threat={selectedThreat}
          threats={threats}
          currentIndex={selectedThreatIndex!}
          onClose={() => setSelectedThreatIndex(null)}
          onNavigate={(index) => setSelectedThreatIndex(index)}
          onAction={handleAction}
        />
      )}
    </>
  );
}
