"use client";

import { useState } from "react";
import { useAnalysis } from "@/hooks/useAnalysis";
import Topbar from "@/components/Topbar";
import SummaryCards from "@/components/SummaryCards";
import LogInput from "@/components/LogInput";
import ThreatsTable from "@/components/ThreatsTable";
import HitlReviewPanel from "@/components/HitlReviewPanel";
import CostBreakdown from "@/components/CostBreakdown";
import IncidentReport from "@/components/IncidentReport";

export default function DashboardPage() {
  const [logText, setLogText] = useState("");
  const { isLoading, result, error, runAnalysis, resume } = useAnalysis();

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

      <ThreatsTable threats={result?.classified_threats ?? []} />

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
    </>
  );
}
