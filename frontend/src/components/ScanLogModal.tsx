"use client";

import { useState, useEffect, useMemo } from "react";
import { getScanLog } from "@/lib/api";
import type { ScanLog, ScanLogSummary, ScanLogEntry, ThreatLogEntry, AgentMetrics } from "@/lib/types";

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
  skipped: "bg-[#262c34] text-[#c9d1d9]",
  running: "bg-blue-100 text-blue-800",
};

const AGENT_COLORS: Record<string, string> = {
  ingest: "bg-blue-500/15 text-blue-400",
  detect: "bg-amber-500/15 text-amber-400",
  validate: "bg-teal-500/15 text-teal-400",
  classify: "bg-violet-500/15 text-violet-400",
  report: "bg-emerald-500/15 text-emerald-400",
};

const SOURCE_COLORS: Record<string, string> = {
  compute: "bg-sky-500/15 text-sky-400",
  cloud_logging: "bg-purple-500/15 text-purple-400",
  iam: "bg-orange-500/15 text-orange-400",
  storage: "bg-cyan-500/15 text-cyan-400",
  network: "bg-rose-500/15 text-rose-400",
};

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-500/15 text-blue-400",
  warning: "bg-amber-500/15 text-amber-400",
  error: "bg-red-500/15 text-red-400",
};

type LogLevel = "all" | "info" | "warning" | "error";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-[#262c34] text-[#c9d1d9]"}`}
    >
      {status}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function LevelFilterBar({
  counts,
  active,
  onChange,
}: {
  counts: Record<string, number>;
  active: LogLevel;
  onChange: (level: LogLevel) => void;
}) {
  const levels: { key: LogLevel; label: string }[] = [
    { key: "all", label: "All" },
    { key: "info", label: "Info" },
    { key: "warning", label: "Warning" },
    { key: "error", label: "Error" },
  ];

  return (
    <div className="flex items-center gap-1.5 mb-3">
      {levels.map(({ key, label }) => {
        const count = key === "all"
          ? Object.values(counts).reduce((a, b) => a + b, 0)
          : counts[key] ?? 0;
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              isActive
                ? "bg-[#388bfd]/20 text-[#58a6ff]"
                : "bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}

function parseSource(message: string): { source: string | null; cleanMessage: string } {
  const prefixMatch = message.match(/^\[(\w+)\]\s*/);
  if (prefixMatch) {
    return { source: prefixMatch[1], cleanMessage: message.slice(prefixMatch[0].length) };
  }
  return { source: null, cleanMessage: message };
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

function levelCounts(entries: { level: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.level] = (counts[e.level] ?? 0) + 1;
  }
  return counts;
}

export default function ScanLogModal({ cloudId, logId, open, onClose }: Props) {
  const [log, setLog] = useState<ScanLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [threatLogsOpen, setThreatLogsOpen] = useState(true);
  const [scanLogsOpen, setScanLogsOpen] = useState(true);
  const [threatLevelFilter, setThreatLevelFilter] = useState<LogLevel>("all");
  const [scanLevelFilter, setScanLevelFilter] = useState<LogLevel>("all");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setThreatLevelFilter("all");
    setScanLevelFilter("all");
    getScanLog(cloudId, logId)
      .then(setLog)
      .finally(() => setLoading(false));
  }, [open, cloudId, logId]);

  const summary: ScanLogSummary | null = log
    ? (() => { try { return JSON.parse(log.summary_json); } catch { return null; } })()
    : null;
  const entries: ScanLogEntry[] = log
    ? (() => { try { return JSON.parse(log.log_entries_json); } catch { return []; } })()
    : [];
  const threatMetrics: Record<string, AgentMetrics> = log?.threat_metrics_json
    ? (() => { try { return JSON.parse(log.threat_metrics_json); } catch { return {}; } })()
    : {};
  const threatEntries: ThreatLogEntry[] = log?.threat_log_entries_json
    ? (() => { try { return JSON.parse(log.threat_log_entries_json); } catch { return []; } })()
    : [];
  const hasThreatData = Object.keys(threatMetrics).length > 0 || threatEntries.length > 0;
  const STAGE_ORDER = ["ingest", "detect", "validate", "classify", "report"];
  const stageMetrics = STAGE_ORDER.filter((s) => threatMetrics[s]).map((s) => ({ stage: s, ...threatMetrics[s] }));
  const totalThreatCost = stageMetrics.reduce((sum, m) => sum + (m.cost_usd ?? 0), 0);
  const totalThreatTokens = stageMetrics.reduce((sum, m) => sum + (m.input_tokens ?? 0) + (m.output_tokens ?? 0), 0);

  const threatLevelCounts = useMemo(() => levelCounts(threatEntries), [threatEntries]);
  const scanLevelCounts = useMemo(() => levelCounts(entries), [entries]);

  const filteredThreatEntries = useMemo(
    () => threatLevelFilter === "all" ? threatEntries : threatEntries.filter((e) => e.level === threatLevelFilter),
    [threatEntries, threatLevelFilter],
  );
  const filteredScanEntries = useMemo(
    () => scanLevelFilter === "all" ? entries : entries.filter((e) => e.level === scanLevelFilter),
    [entries, scanLevelFilter],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[#1c2128] rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262c34]">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">Scan Log</h2>
            {log && <StatusBadge status={log.status} />}
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
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
          <div className="flex-1 overflow-y-auto">
            {/* Summary section */}
            {summary && (
              <div className="px-6 py-4 border-b border-[#262c34] space-y-3">
                <div className="flex items-center gap-4 text-sm text-[#c9d1d9]">
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
                  <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                    Services
                  </h3>
                  {Object.entries(summary.service_details).map(([name, detail]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-[#21262d]"
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={detail.status} />
                        <span className="font-medium text-white">{name}</span>
                      </div>
                      <span className="text-[#8b949e]">
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

            {/* Threat Pipeline metrics */}
            {hasThreatData && (
              <div className="px-6 py-4 border-b border-[#262c34] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                    Threat Pipeline
                  </h3>
                  {stageMetrics.length > 0 && (
                    <span className="text-xs text-[#8b949e]">
                      {totalThreatTokens.toLocaleString()} tokens &middot; ${totalThreatCost.toFixed(4)}
                    </span>
                  )}
                </div>
                {stageMetrics.length > 0 && (
                  <div className="space-y-1.5">
                    {stageMetrics.map((m) => (
                      <div
                        key={m.stage}
                        className="flex items-center justify-between text-sm py-1.5 px-3 rounded-lg bg-[#21262d]"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${AGENT_COLORS[m.stage] ?? "bg-violet-500/15 text-violet-400"}`}>
                            {m.stage}
                          </span>
                        </div>
                        <span className="text-[#8b949e] text-xs tabular-nums">
                          {((m.latency_ms ?? 0) / 1000).toFixed(1)}s &middot;{" "}
                          {((m.input_tokens ?? 0) + (m.output_tokens ?? 0)).toLocaleString()} tokens &middot;{" "}
                          ${(m.cost_usd ?? 0).toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Threat Pipeline Logs — collapsible */}
            {threatEntries.length > 0 && (
              <div className="px-6 py-4 border-b border-[#262c34]">
                <button
                  onClick={() => setThreatLogsOpen(!threatLogsOpen)}
                  className="flex items-center gap-2 w-full text-left mb-2 group"
                >
                  <ChevronIcon open={threatLogsOpen} />
                  <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider group-hover:text-[#c9d1d9] transition-colors">
                    Threat Pipeline Logs ({threatEntries.length})
                  </h3>
                </button>

                {threatLogsOpen && (
                  <>
                    <LevelFilterBar
                      counts={threatLevelCounts}
                      active={threatLevelFilter}
                      onChange={setThreatLevelFilter}
                    />
                    <div className="rounded-lg border border-[#30363d] overflow-hidden">
                      <div className="max-h-64 overflow-y-auto divide-y divide-[#21262d]">
                        {filteredThreatEntries.map((entry, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-3 px-3 py-2 text-sm ${
                              entry.level === "error"
                                ? "bg-red-500/5"
                                : entry.level === "warning"
                                  ? "bg-amber-500/5"
                                  : ""
                            }`}
                          >
                            <span className="text-[#6e7681] text-xs tabular-nums whitespace-nowrap pt-0.5 w-[72px] shrink-0">
                              {formatTime(entry.ts)}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${AGENT_COLORS[entry.agent] ?? "bg-gray-500/15 text-gray-400"}`}>
                              {entry.agent}
                            </span>
                            <span className={`text-sm leading-relaxed ${
                              entry.level === "error"
                                ? "text-red-400"
                                : entry.level === "warning"
                                  ? "text-amber-300"
                                  : "text-[#c9d1d9]"
                            }`}>
                              {entry.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Scan Log Entries — collapsible */}
            <div className="px-6 py-4">
              <button
                onClick={() => setScanLogsOpen(!scanLogsOpen)}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                <ChevronIcon open={scanLogsOpen} />
                <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider group-hover:text-[#c9d1d9] transition-colors">
                  Log Entries ({entries.length})
                </h3>
              </button>

              {scanLogsOpen && (
                <>
                  <LevelFilterBar
                    counts={scanLevelCounts}
                    active={scanLevelFilter}
                    onChange={setScanLevelFilter}
                  />
                  <div className="rounded-lg border border-[#30363d] overflow-hidden">
                    {filteredScanEntries.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-[#8b949e]">
                        {entries.length === 0 ? "No log entries available" : "No entries match this filter"}
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto divide-y divide-[#21262d]">
                        {filteredScanEntries.map((entry, i) => {
                          const { source, cleanMessage } = parseSource(entry.message);
                          return (
                            <div
                              key={i}
                              className={`flex items-start gap-3 px-3 py-2 text-sm ${
                                entry.level === "error"
                                  ? "bg-red-500/5"
                                  : entry.level === "warning"
                                    ? "bg-amber-500/5"
                                    : ""
                              }`}
                            >
                              <span className="text-[#6e7681] text-xs tabular-nums whitespace-nowrap pt-0.5 w-[72px] shrink-0">
                                {formatTime(entry.ts)}
                              </span>
                              {source ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${SOURCE_COLORS[source] ?? "bg-gray-500/15 text-gray-400"}`}>
                                  {source}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${LEVEL_COLORS[entry.level] ?? "bg-gray-500/15 text-gray-400"}`}>
                                  {entry.level.toUpperCase()}
                                </span>
                              )}
                              <span className={`text-sm leading-relaxed ${
                                entry.level === "error"
                                  ? "text-red-400"
                                  : entry.level === "warning"
                                    ? "text-amber-300"
                                    : "text-[#c9d1d9]"
                              }`}>
                                {cleanMessage}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
