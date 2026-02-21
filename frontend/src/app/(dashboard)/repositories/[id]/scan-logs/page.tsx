"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listRepoScanLogs } from "@/lib/api";
import type { ScanLogListItem } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  partial: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  error: "bg-red-500/15 text-red-400 border border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        STATUS_STYLES[status] ?? "bg-[#262c34] text-[#c9d1d9] border border-[#30363d]"
      }`}
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
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface RepoScanSummary {
  total_repos_scanned?: number;
  total_issue_count?: number;
  duration_seconds?: number;
  scan_type?: string;
  repos_succeeded?: string[];
  repos_failed?: string[];
}

function parseSummary(json: string): RepoScanSummary | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return "--";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function RepoScanLogsPage() {
  const params = useParams();
  const connectionId = params.id as string;

  const [logs, setLogs] = useState<ScanLogListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRepoScanLogs(connectionId)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [connectionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">No scan logs yet</h3>
        <p className="text-sm text-[#8b949e]">Run a scan to generate execution logs.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#21262d] border-b border-[#30363d] text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Duration</th>
            <th className="px-5 py-3">Repos Scanned</th>
            <th className="px-5 py-3">Issues Found</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#262c34]">
          {logs.map((log) => {
            const summary = parseSummary(log.summary_json);
            return (
              <tr
                key={log.id}
                className="hover:bg-[#21262d]/50 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <StatusBadge status={log.status} />
                </td>
                <td className="px-5 py-3.5 text-[#c9d1d9]">
                  <div>
                    <span>{timeAgo(log.started_at)}</span>
                    <div className="text-xs text-[#8b949e] mt-0.5">
                      {new Date(log.started_at).toLocaleString()}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[#c9d1d9]">
                  {formatDuration(summary?.duration_seconds)}
                </td>
                <td className="px-5 py-3.5 text-[#c9d1d9]">
                  {summary?.total_repos_scanned ?? "--"}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-sm font-medium ${
                    (summary?.total_issue_count ?? 0) > 0
                      ? "text-amber-400"
                      : "text-[#c9d1d9]"
                  }`}>
                    {summary?.total_issue_count ?? "--"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
