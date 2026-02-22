"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import type { ReportSummary } from "@/lib/types";
import { listReports, BASE } from "@/lib/api";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch((err) => console.error("Failed to load reports:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell
      title="Reports"
      description="Generated incident reports from past analyses"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      }
    >
      {loading ? (
        <div className="mt-6 bg-[#1c2128] rounded-xl border border-[#30363d] p-12 text-center">
          <p className="text-[#8b949e] text-sm">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-6 bg-[#1c2128] rounded-xl border border-[#30363d] p-12 text-center">
          <p className="text-[#8b949e] text-sm">
            No saved reports yet. Run an analysis from the Feed to generate your first report.
          </p>
        </div>
      ) : (
        <div className="mt-6 bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#30363d]">
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Date</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Logs</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Threats</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Critical</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Time</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#e6edf3]">Cost</th>
                <th className="text-center px-5 py-3.5 font-semibold text-[#e6edf3]">PDF</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[#262c34] hover:bg-[#21262d] transition-colors cursor-pointer"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="px-5 py-3.5 text-[#e6edf3]">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                        r.status === "completed"
                          ? "bg-[#21262d] text-green-700 border border-green-200"
                          : r.status === "error"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">{r.log_count}</td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">{r.threat_count}</td>
                  <td className="px-5 py-3.5">
                    {r.critical_count > 0 ? (
                      <span className="text-red-600 font-bold">{r.critical_count}</span>
                    ) : (
                      <span className="text-[#8b949e]">0</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">{(r.pipeline_time ?? 0).toFixed(1)}s</td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">
                    ${(r.pipeline_cost ?? 0).toFixed(4)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      title="Download PDF report"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#262c34] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`${BASE}/reports/${r.id}/pdf`, "_blank");
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
