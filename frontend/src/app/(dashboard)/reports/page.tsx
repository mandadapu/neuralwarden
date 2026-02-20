"use client";

import { useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import type { ReportSummary } from "@/lib/types";
import { listReports } from "@/lib/api";

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch(() => {})
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
        <div className="mt-6 bg-[#081510] rounded-xl border border-[#122a1e] p-12 text-center">
          <p className="text-[#3a5548] text-sm">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-6 bg-[#081510] rounded-xl border border-[#122a1e] p-12 text-center">
          <p className="text-[#3a5548] text-sm">
            No saved reports yet. Run an analysis from the Feed to generate your first report.
          </p>
        </div>
      ) : (
        <div className="mt-6 bg-[#081510] rounded-xl border border-[#122a1e] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#122a1e]">
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Date</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Logs</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Threats</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Critical</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Time</th>
                <th className="text-left px-5 py-3.5 font-semibold text-[#c0d0c8]">Cost</th>
                <th className="text-center px-5 py-3.5 font-semibold text-[#c0d0c8]">PDF</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[#0e1e16] hover:bg-[#0a1a14] transition-colors cursor-pointer"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <td className="px-5 py-3.5 text-[#c0d0c8]">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                        r.status === "completed"
                          ? "bg-[#0a1a14] text-green-700 border border-green-200"
                          : r.status === "error"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#8a9a90]">{r.log_count}</td>
                  <td className="px-5 py-3.5 text-[#8a9a90]">{r.threat_count}</td>
                  <td className="px-5 py-3.5">
                    {r.critical_count > 0 ? (
                      <span className="text-red-600 font-bold">{r.critical_count}</span>
                    ) : (
                      <span className="text-[#3a5548]">0</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[#8a9a90]">{r.pipeline_time.toFixed(1)}s</td>
                  <td className="px-5 py-3.5 text-[#8a9a90]">
                    ${r.pipeline_cost.toFixed(4)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button
                      title="Download PDF report"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#0c1e18] text-[#5a7068] hover:text-[#c0d0c8] transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        const base = `${window.location.protocol}//${window.location.hostname}:8000/api`;
                        window.open(`${base}/reports/${r.id}/pdf`, "_blank");
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
