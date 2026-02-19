"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { listCloudIssues, updateIssueStatus } from "@/lib/api";
import type { CloudIssue } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-700",
};

const STATUS_STYLES: Record<string, string> = {
  todo: "border-blue-300 text-blue-600 bg-blue-50",
  in_progress: "border-yellow-300 text-yellow-700 bg-yellow-50",
  ignored: "border-gray-300 text-gray-500 bg-gray-50",
  solved: "border-emerald-300 text-emerald-600 bg-emerald-50",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  ignored: "Ignored",
  solved: "Solved",
};

const ALL_STATUSES = ["todo", "in_progress", "ignored", "solved"];

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

  const [issues, setIssues] = useState<CloudIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    loadIssues();
  }, [cloudId]);

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

  const filtered = issues.filter((issue) => {
    const matchesSearch =
      issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.description.toLowerCase().includes(search.toLowerCase()) ||
      issue.rule_code.toLowerCase().includes(search.toLowerCase());
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "config" && !issue.rule_code.startsWith("LOG_")) ||
      (typeFilter === "log" && issue.rule_code.startsWith("LOG_"));
    return matchesSearch && matchesType;
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All types</option>
          <option value="config">Config issues</option>
          <option value="log">Log issues</option>
        </select>
        <button className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
        <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600">
          <option>Actions</option>
          <option>Mark selected as Ignored</option>
          <option>Mark selected as Solved</option>
        </select>
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
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No issues found</h3>
          <p className="text-sm text-gray-500">Run a scan to check for security issues.</p>
        </div>
      )}

      {/* Issues table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 w-10">Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Issue</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Severity</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Fix Time</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((issue) => (
                <tr key={issue.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="text-gray-400">
                      {issue.rule_code.startsWith("LOG_") ? <DocIcon /> : <CloudConfigIcon />}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-gray-900">{issue.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{issue.description}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${SEVERITY_STYLES[issue.severity] ?? ""}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-gray-600">{issue.location || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-gray-600">{issue.fix_time || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5 relative" ref={statusDropdownId === issue.id ? dropdownRef : undefined}>
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
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                        {ALL_STATUSES.map((s) => (
                          <button
                            key={s}
                            onClick={() => changeStatus(issue.id, s)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                              issue.status === s ? "font-semibold text-primary" : "text-gray-700"
                            }`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
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
        <div className="text-center py-12 text-gray-500 text-sm">
          No issues match your filters.
        </div>
      )}
    </div>
  );
}
