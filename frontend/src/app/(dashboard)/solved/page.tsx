"use client";

import { useAnalysisContext } from "@/context/AnalysisContext";
import PageShell from "@/components/PageShell";
import SeverityBadge from "@/components/SeverityBadge";
import ThreatTypeIcon from "@/components/ThreatTypeIcon";

export default function SolvedPage() {
  const { solvedThreats, restoreThreat } = useAnalysisContext();

  return (
    <PageShell
      title="Solved"
      description="Threats that have been resolved"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      }
    >
      <div className="mt-6">
        {solvedThreats.length === 0 ? (
          <div className="bg-[#081510] rounded-xl border border-[#122a1e] p-12 text-center">
            <p className="text-[#3a5548] text-sm">No solved findings yet. Resolve threats from the Feed to track them here.</p>
          </div>
        ) : (
          <div className="bg-[#081510] rounded-xl border border-[#122a1e] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[#122a1e]">
                  <th className="text-left px-4 py-3.5 font-semibold text-[#c0d0c8] w-[50px]">Type</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#c0d0c8]">Name</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#c0d0c8]">Severity</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#c0d0c8]">Source IP</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#c0d0c8] w-[100px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {solvedThreats.map((ct) => (
                  <tr key={ct.threat_id} className="border-b border-[#0e1e16] hover:bg-[#0a1a14] transition-colors">
                    <td className="px-4 py-3.5"><ThreatTypeIcon type={ct.type} /></td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-white text-[13px]">
                        {ct.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </div>
                      <div className="text-[#5a7068] text-xs mt-0.5">
                        {ct.description.length > 90 ? ct.description.slice(0, 90) + "..." : ct.description}
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><SeverityBadge risk={ct.risk} /></td>
                    <td className="px-4 py-3.5 text-[#8a9a90] text-[13px]">{ct.source_ip || "N/A"}</td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => restoreThreat(ct.threat_id, "solved")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors"
                      >
                        Reopen
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
