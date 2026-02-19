"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listCloudChecks, listCloudIssues } from "@/lib/api";
import type { CloudCheck, CloudIssue } from "@/lib/types";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "standard", label: "Standard" },
  { key: "advanced", label: "Advanced" },
  { key: "custom", label: "Custom" },
];

export default function ChecksTab() {
  const params = useParams();
  const cloudId = params.id as string;

  const [checks, setChecks] = useState<CloudCheck[]>([]);
  const [issues, setIssues] = useState<CloudIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    loadData();
  }, [cloudId]);

  async function loadData() {
    try {
      setLoading(true);
      const [checksData, issuesData] = await Promise.all([
        listCloudChecks(),
        listCloudIssues(cloudId),
      ]);
      setChecks(checksData);
      setIssues(issuesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checks");
    } finally {
      setLoading(false);
    }
  }

  // Build a set of rule_codes that have active issues
  const violatedRuleCodes = new Set(
    issues
      .filter((i) => i.status !== "solved")
      .map((i) => i.rule_code)
  );

  const filtered = checks.filter((check) => {
    const matchesSearch =
      check.title.toLowerCase().includes(search.toLowerCase()) ||
      check.description.toLowerCase().includes(search.toLowerCase()) ||
      check.rule_code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || check.category.toLowerCase() === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      {/* Category pills */}
      <div className="flex items-center gap-2 mb-5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              categoryFilter === cat.key
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search checks..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
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
      {!loading && !error && checks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No checks available</h3>
          <p className="text-sm text-gray-500">Security checks will appear here when configured.</p>
        </div>
      )}

      {/* Checks table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Rule Code</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Title</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Description</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((check) => {
                const isViolated = violatedRuleCodes.has(check.rule_code);
                return (
                  <tr key={check.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <code className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded font-mono">
                        {check.rule_code}
                      </code>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium text-gray-900">{check.title}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-gray-500 line-clamp-2">{check.description}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isViolated ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-700 text-xs font-semibold rounded-full">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <path d="M12 9v4M12 17h.01" />
                          </svg>
                          Non-compliant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Compliant
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* No filter results */}
      {!loading && !error && checks.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No checks match your filters.
        </div>
      )}
    </div>
  );
}
