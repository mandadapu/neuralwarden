"use client";

import { useState, useEffect } from "react";
import { getScanLog } from "@/lib/api";
import type { ScanLog, ScanLogSummary, ScanLogEntry } from "@/lib/types";

interface Props {
  cloudId: string;
  logId: string;
  open: boolean;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  skipped: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

export default function ScanLogModal({ cloudId, logId, open, onClose }: Props) {
  const [log, setLog] = useState<ScanLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getScanLog(cloudId, logId)
      .then(setLog)
      .finally(() => setLoading(false));
  }, [open, cloudId, logId]);

  if (!open) return null;

  const summary: ScanLogSummary | null = log
    ? (() => { try { return JSON.parse(log.summary_json); } catch { return null; } })()
    : null;
  const entries: ScanLogEntry[] = log
    ? (() => { try { return JSON.parse(log.log_entries_json); } catch { return []; } })()
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">Scan Log</h2>
            {log && <StatusBadge status={log.status} />}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Summary section */}
            {summary && (
              <div className="px-6 py-4 border-b border-gray-100 space-y-3">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="font-medium">{summary.duration_seconds}s total</span>
                  <span>{summary.total_asset_count} assets</span>
                  <span>{summary.total_issue_count} issues</span>
                  {summary.active_exploits_detected > 0 && (
                    <span className="text-red-600 font-semibold">
                      {summary.active_exploits_detected} active exploits
                    </span>
                  )}
                </div>

                {/* Per-service breakdown */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Services
                  </h3>
                  {Object.entries(summary.service_details).map(([name, detail]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={detail.status} />
                        <span className="font-medium text-gray-900">{name}</span>
                      </div>
                      <span className="text-gray-500">
                        {detail.status === "success"
                          ? `${detail.asset_count} assets, ${detail.issue_count} issues (${detail.duration_seconds}s)`
                          : detail.status === "skipped"
                            ? detail.error
                            : `Failed: ${detail.error}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Log Entries
              </h3>
              <div className="font-mono text-xs space-y-0.5 bg-gray-900 rounded-lg p-4 text-gray-300">
                {entries.length === 0 ? (
                  <span className="text-gray-500">No log entries available</span>
                ) : (
                  entries.map((entry, i) => (
                    <div
                      key={i}
                      className={
                        entry.level === "error"
                          ? "text-red-400"
                          : entry.level === "warning"
                            ? "text-amber-400"
                            : "text-gray-300"
                      }
                    >
                      <span className="text-gray-500">
                        {new Date(entry.ts).toLocaleTimeString()}
                      </span>{" "}
                      <span
                        className={`font-semibold ${
                          entry.level === "error"
                            ? "text-red-400"
                            : entry.level === "warning"
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }`}
                      >
                        [{entry.level.toUpperCase()}]
                      </span>{" "}
                      {entry.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
