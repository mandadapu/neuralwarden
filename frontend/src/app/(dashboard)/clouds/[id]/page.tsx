"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { listCloudIssues, updateIssueStatus } from "@/lib/api";
import type { CloudIssue } from "@/lib/types";
import RemediationModal from "@/components/RemediationModal";
import { useCloudContext } from "./layout";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-700",
};

const STATUS_STYLES: Record<string, string> = {
  todo: "border-[#00e68a]/30 text-[#00e68a] bg-[#00e68a]/10",
  in_progress: "border-yellow-300 text-yellow-700 bg-yellow-50",
  ignored: "border-[#30363d] text-[#8b949e] bg-[#21262d]",
  resolved: "border-emerald-300 text-emerald-600 bg-emerald-50",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  ignored: "Ignored",
  resolved: "Resolved",
};

const ALL_STATUSES = ["todo", "in_progress", "ignored", "resolved"];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function CloudConfigIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function IssuesTab() {
  const params = useParams();
  const cloudId = params.id as string;
  const { scanVersion, isDisabled } = useCloudContext();

  const [issues, setIssues] = useState<CloudIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [fixIssue, setFixIssue] = useState<CloudIssue | null>(null);
  const dropdownRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    loadIssues();
  }, [cloudId, scanVersion]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function loadIssues() {
    try {
      setLoading(true);
      const data = await listCloudIssues(cloudId);
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(issueId: string, newStatus: string) {
    try {
      await updateIssueStatus(issueId, newStatus);
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId ? { ...issue, status: newStatus as CloudIssue["status"] } : issue
        )
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    }
    setStatusDropdownId(null);
  }

  async function bulkChangeStatus(newStatus: string) {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => updateIssueStatus(id, newStatus))
      );
      setIssues((prev) =>
        prev.map((issue) =>
          selectedIds.has(issue.id) ? { ...issue, status: newStatus as CloudIssue["status"] } : issue
        )
      );
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed to bulk update status:", err);
    }
  }

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, typeFilter, severityFilter, statusFilter]);

  const filtered = issues.filter((issue) => {
    const matchesSearch =
      issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.description.toLowerCase().includes(search.toLowerCase()) ||
      issue.rule_code.toLowerCase().includes(search.toLowerCase());
    const ruleCodeLower = issue.rule_code.toLowerCase();
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "config" && !ruleCodeLower.startsWith("log_")) ||
      (typeFilter === "log" && ruleCodeLower.startsWith("log_"));
    const matchesSeverity =
      severityFilter === "all" || issue.severity === severityFilter;
    const matchesStatus =
      statusFilter === "all" || issue.status === statusFilter;
    return matchesSearch && matchesType && matchesSeverity && matchesStatus;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((issue) => selectedIds.has(issue.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((issue) => issue.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#8b949e]">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues..."
            className="w-full pl-10 pr-4 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All types</option>
          <option value="config">Config issues</option>
          <option value="log">Log issues</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {!isDisabled && (
          <select
            value=""
            disabled={selectedIds.size === 0}
            onChange={(e) => {
              if (e.target.value) bulkChangeStatus(e.target.value);
            }}
            className="px-3 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-[#c9d1d9] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">
              {selectedIds.size > 0 ? `Actions (${selectedIds.size})` : "Actions"}
            </option>
            <option value="ignored">Mark as Ignored</option>
            <option value="resolved">Mark as Resolved</option>
            <option value="in_progress">Mark as In Progress</option>
            <option value="todo">Mark as To Do</option>
          </select>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No issues found</h3>
          <p className="text-sm text-[#8b949e]">Run a scan to check for security issues.</p>
        </div>
      )}

      {/* Issues table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-visible">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                {!isDisabled && (
                  <th className="px-5 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-[#30363d] bg-[#21262d] text-primary focus:ring-primary/20 cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3 w-10">Type</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Issue</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Severity</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Fix Time</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Fix</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {filtered.map((issue) => (
                <tr key={issue.id} className={`hover:bg-[#21262d] transition-colors ${selectedIds.has(issue.id) ? "bg-[#21262d]/50" : ""}`}>
                  {!isDisabled && (
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(issue.id)}
                        onChange={() => toggleSelect(issue.id)}
                        className="rounded border-[#30363d] bg-[#21262d] text-primary focus:ring-primary/20 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-5 py-3.5">
                    <div className="text-[#8b949e]">
                      {issue.rule_code.toLowerCase().startsWith("log_") ? <DocIcon /> : <CloudConfigIcon />}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-white">{issue.title}</div>
                    <div className="text-xs text-[#8b949e] mt-0.5 line-clamp-1">{issue.description}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${SEVERITY_STYLES[issue.severity] ?? ""}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9]">{issue.location || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9]">{issue.fix_time || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {issue.remediation_script && !isDisabled ? (
                      <button
                        onClick={() => setFixIssue(issue)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        Fix
                      </button>
                    ) : (
                      <span className="text-xs text-[#8b949e]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 relative" ref={statusDropdownId === issue.id ? dropdownRef : undefined}>
                    {isDisabled ? (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[issue.status] ?? ""}`}>
                        {STATUS_LABELS[issue.status] ?? issue.status}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => setStatusDropdownId(statusDropdownId === issue.id ? null : issue.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${STATUS_STYLES[issue.status] ?? ""}`}
                        >
                          {STATUS_LABELS[issue.status] ?? issue.status}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>

                        {statusDropdownId === issue.id && (
                          <div className="absolute right-0 bottom-full mb-1 w-36 bg-[#1c2128] border border-[#30363d] rounded-lg shadow-lg z-20 py-1">
                            {ALL_STATUSES.map((s) => (
                              <button
                                key={s}
                                onClick={() => changeStatus(issue.id, s)}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#21262d] transition-colors ${
                                  issue.status === s ? "font-semibold text-primary" : "text-[#e6edf3]"
                                }`}
                              >
                                {STATUS_LABELS[s]}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No search results */}
      {!loading && !error && issues.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-[#8b949e] text-sm">
          No issues match your filters.
        </div>
      )}

      {fixIssue && (
        <RemediationModal
          issue={fixIssue}
          open={!!fixIssue}
          onClose={() => setFixIssue(null)}
        />
      )}
    </div>
  );
}
