"use client";

import { useAnalysisContext } from "@/context/AnalysisContext";
import PageShell from "@/components/PageShell";
import SeverityBadge from "@/components/SeverityBadge";
import ThreatTypeIcon from "@/components/ThreatTypeIcon";

export default function IgnoredPage() {
  const { ignoredThreats, restoreThreat } = useAnalysisContext();

  return (
    <PageShell
      title="Ignored"
      description="Findings marked as false positives or accepted risk"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      }
    >
      <div className="mt-6">
        {ignoredThreats.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">No ignored findings. Mark threats as ignored from the Feed to manage noise.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-700 w-[50px]">Type</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-700">Severity</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-700">Source IP</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-700 w-[100px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {ignoredThreats.map((ct) => (
                  <tr key={ct.threat_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5"><ThreatTypeIcon type={ct.type} /></td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-[#1a1a2e] text-[13px]">
                        {ct.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">
                        {ct.description.length > 90 ? ct.description.slice(0, 90) + "..." : ct.description}
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><SeverityBadge risk={ct.risk} /></td>
                    <td className="px-4 py-3.5 text-gray-600 text-[13px]">{ct.source_ip || "N/A"}</td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => restoreThreat(ct.threat_id, "ignored")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
