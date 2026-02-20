"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listScanLogs } from "@/lib/api";
import ScanLogModal from "@/components/ScanLogModal";
import type { ScanLogListItem, ScanLogSummary } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-[#262c34] text-[#c9d1d9]"}`}
    >
      {status}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function parseSummary(json: string): ScanLogSummary | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function ScanLogsPage() {
  const params = useParams();
  const cloudId = params.id as string;

  const [logs, setLogs] = useState<ScanLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  useEffect(() => {
    listScanLogs(cloudId)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [cloudId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-20 text-[#8b949e]">
        <p className="text-lg font-medium">No scan logs yet</p>
        <p className="text-sm mt-1">Run a scan to generate execution logs</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#262c34] text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Duration</th>
              <th className="px-5 py-3">Services</th>
              <th className="px-5 py-3">Assets</th>
              <th className="px-5 py-3">Issues</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const summary = parseSummary(log.summary_json);
              return (
                <tr
                  key={log.id}
                  className="border-b border-gray-50 hover:bg-[#21262d]/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedLogId(log.id)}
                >
                  <td className="px-5 py-3.5">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">
                    {timeAgo(log.started_at)}
                  </td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">
                    {summary?.duration_seconds ? `${summary.duration_seconds}s` : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {summary ? (
                      <div className="flex items-center gap-1.5">
                        {summary.services_succeeded.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                            {s}
                          </span>
                        ))}
                        {summary.services_failed.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">
                    {summary?.total_asset_count ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[#c9d1d9]">
                    {summary?.total_issue_count ?? "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-primary text-xs font-medium hover:underline">
                      View
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedLogId && (
        <ScanLogModal
          cloudId={cloudId}
          logId={selectedLogId}
          open={!!selectedLogId}
          onClose={() => setSelectedLogId(null)}
        />
      )}
    </>
  );
}
