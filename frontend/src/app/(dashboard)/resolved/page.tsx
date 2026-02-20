"use client";

import { useAnalysisContext } from "@/context/AnalysisContext";
import PageShell from "@/components/PageShell";
import SeverityBadge from "@/components/SeverityBadge";
import ThreatTypeIcon from "@/components/ThreatTypeIcon";

export default function ResolvedPage() {
  const { resolvedThreats, restoreThreat } = useAnalysisContext();

  return (
    <PageShell
      title="Resolved"
      description="Threats that have been resolved"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      }
    >
      <div className="mt-6">
        {resolvedThreats.length === 0 ? (
          <div className="bg-[#1c2128] rounded-xl border border-[#30363d] p-12 text-center">
            <p className="text-[#8b949e] text-sm">No resolved findings yet. Resolve threats from the Feed to track them here.</p>
          </div>
        ) : (
          <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[#30363d]">
                  <th className="text-left px-4 py-3.5 font-semibold text-[#e6edf3] w-[50px]">Type</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#e6edf3]">Name</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#e6edf3]">Severity</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#e6edf3]">Source IP</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-[#e6edf3] w-[100px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {resolvedThreats.map((ct) => (
                  <tr key={ct.threat_id} className="border-b border-[#262c34] hover:bg-[#21262d] transition-colors">
                    <td className="px-4 py-3.5"><ThreatTypeIcon type={ct.type} /></td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-white text-[13px]">
                        {ct.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </div>
                      <div className="text-[#8b949e] text-xs mt-0.5">
                        {ct.description.length > 90 ? ct.description.slice(0, 90) + "..." : ct.description}
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><SeverityBadge risk={ct.risk} /></td>
                    <td className="px-4 py-3.5 text-[#c9d1d9] text-[13px]">{ct.source_ip || "N/A"}</td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => restoreThreat(ct.threat_id, "resolved")}
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
