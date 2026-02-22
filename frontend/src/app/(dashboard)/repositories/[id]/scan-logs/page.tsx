"use client";

import { Fragment, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listRepoScanLogs, getRepoScanLog } from "@/lib/api";
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

interface PerRepoDetail {
  repo: string;
  issues: number;
  secrets: number;
  sca: number;
  sast: number;
  license: number;
  status: string;
  error?: string;
}

interface RepoScanSummary {
  repos_scanned?: number;
  total_repos_scanned?: number;
  issues_found?: number;
  total_issue_count?: number;
  duration_seconds?: number;
  by_type?: Record<string, number>;
  per_repo?: PerRepoDetail[];
}

interface LogEntry {
  ts: string;
  level: string;
  repo?: string;
  scanner?: string;
  issues_found?: number;
  message: string;
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

const LEVEL_STYLES: Record<string, string> = {
  info: "text-blue-400",
  error: "text-red-400",
  warning: "text-amber-400",
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

/* ── Expanded detail panel ─────────────────────────────── */

function ScanLogDetail({ connectionId, logId }: { connectionId: string; logId: string }) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRepoScanLog(connectionId, logId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [connectionId, logId]);

  if (loading) {
    return (
      <div className="px-5 py-4 flex items-center gap-2 text-[#8b949e] text-sm">
        <div className="w-4 h-4 border-2 border-[#8b949e]/30 border-t-[#8b949e] rounded-full animate-spin" />
        Loading details...
      </div>
    );
  }

  if (!detail) {
    return <div className="px-5 py-4 text-[#8b949e] text-sm">Failed to load scan log detail.</div>;
  }

  const summary = parseSummary((detail.summary_json as string) || "{}");
  const logEntries: LogEntry[] = (() => {
    try {
      return JSON.parse((detail.log_entries_json as string) || "[]");
    } catch {
      return [];
    }
  })();

  const byType = summary?.by_type ?? {};
  const perRepo = summary?.per_repo ?? [];

  return (
    <div className="bg-[#161b22] border-t border-[#262c34]">
      {/* Scanner summary bar */}
      {Object.keys(byType).length > 0 && (
        <div className="px-5 py-3 border-b border-[#262c34] flex flex-wrap gap-4 text-xs">
          <span className="text-[#8b949e] font-semibold uppercase tracking-wider">Scanner Breakdown:</span>
          {byType.secrets !== undefined && (
            <span className="text-[#c9d1d9]">
              <span className="text-rose-400 font-semibold">Secrets:</span> {byType.secrets}
            </span>
          )}
          {byType.sca !== undefined && (
            <span className="text-[#c9d1d9]">
              <span className="text-teal-400 font-semibold">SCA:</span> {byType.sca}
            </span>
          )}
          {byType.sast !== undefined && (
            <span className="text-[#c9d1d9]">
              <span className="text-blue-400 font-semibold">SAST:</span> {byType.sast}
            </span>
          )}
          {byType.license !== undefined && (
            <span className="text-[#c9d1d9]">
              <span className="text-purple-400 font-semibold">License:</span> {byType.license}
            </span>
          )}
        </div>
      )}

      {/* Per-repo breakdown */}
      {perRepo.length > 0 && (
        <div className="px-5 py-3 border-b border-[#262c34]">
          <div className="text-xs text-[#8b949e] font-semibold uppercase tracking-wider mb-2">Per Repository</div>
          <div className="space-y-1">
            {perRepo.map((r) => (
              <div
                key={r.repo}
                className="flex items-center gap-3 text-xs py-1.5 px-3 rounded-lg hover:bg-[#21262d]/50"
              >
                <span className="flex-1 text-[#c9d1d9] font-medium truncate">{r.repo}</span>
                {r.status === "error" ? (
                  <span className="text-red-400">{r.error || "error"}</span>
                ) : (
                  <>
                    <span className="text-rose-400" title="Secrets">S:{r.secrets ?? 0}</span>
                    <span className="text-teal-400" title="SCA">SCA:{r.sca ?? 0}</span>
                    <span className="text-blue-400" title="SAST">SAST:{r.sast ?? 0}</span>
                    <span className="text-purple-400" title="License">L:{r.license ?? 0}</span>
                    <span className={`font-semibold ${r.issues > 0 ? "text-amber-400" : "text-[#8b949e]"}`}>
                      {r.issues} total
                    </span>
                  </>
                )}
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log entries */}
      {logEntries.length > 0 && (
        <div className="px-5 py-3">
          <div className="text-xs text-[#8b949e] font-semibold uppercase tracking-wider mb-2">Log Entries</div>
          <div className="bg-[#0d1117] rounded-lg border border-[#262c34] max-h-64 overflow-y-auto font-mono text-xs">
            {logEntries.map((entry, i) => (
              <div key={i} className="flex gap-3 px-3 py-1.5 border-b border-[#262c34]/50 last:border-b-0">
                <span className="text-[#484f58] shrink-0 w-16">{formatTime(entry.ts)}</span>
                <span className={`shrink-0 w-12 uppercase font-semibold ${LEVEL_STYLES[entry.level] ?? "text-[#8b949e]"}`}>
                  {entry.level}
                </span>
                <span className="text-[#c9d1d9]">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {logEntries.length === 0 && perRepo.length === 0 && (
        <div className="px-5 py-4 text-[#8b949e] text-sm">No detailed log entries available for this scan.</div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────── */

export default function RepoScanLogsPage() {
  const params = useParams();
  const connectionId = params.id as string;

  const [logs, setLogs] = useState<ScanLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
            <th className="px-5 py-3 w-8"></th>
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
            const isExpanded = expandedId === log.id;
            const reposScanned = summary?.repos_scanned ?? summary?.total_repos_scanned ?? "--";
            const issuesFound = summary?.issues_found ?? summary?.total_issue_count ?? "--";
            return (
              <Fragment key={log.id}>
                <tr
                  className="hover:bg-[#21262d]/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <td className="px-5 py-3.5 w-8">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#8b949e"
                      strokeWidth="2"
                      className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </td>
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
                    {reposScanned}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-sm font-medium ${
                      (typeof issuesFound === "number" && issuesFound > 0)
                        ? "text-amber-400"
                        : "text-[#c9d1d9]"
                    }`}>
                      {issuesFound}
                    </span>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <ScanLogDetail connectionId={connectionId} logId={log.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
