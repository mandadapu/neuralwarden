"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listRepoAssets } from "@/lib/api";
import type { RepoAsset } from "@/lib/types";

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  JavaScript: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Python: "bg-green-500/15 text-green-400 border-green-500/30",
  Go: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Java: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Rust: "bg-red-500/15 text-red-400 border-red-500/30",
  Ruby: "bg-red-400/15 text-red-300 border-red-400/30",
  Shell: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  C: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "C++": "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "C#": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  PHP: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  Swift: "bg-orange-400/15 text-orange-300 border-orange-400/30",
  Kotlin: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  Dart: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  HTML: "bg-orange-600/15 text-orange-400 border-orange-600/30",
  CSS: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  Dockerfile: "bg-blue-600/15 text-blue-400 border-blue-600/30",
};

const DEFAULT_LANGUAGE_STYLE = "bg-[#262c34] text-[#c9d1d9] border-[#30363d]";

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function parseMetadata(jsonStr: string): { stars?: number; forks?: number } {
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

export default function ReposTab() {
  const params = useParams();
  const connectionId = params.id as string;

  const [assets, setAssets] = useState<RepoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("all");

  useEffect(() => {
    loadAssets();
  }, [connectionId]);

  async function loadAssets() {
    try {
      setLoading(true);
      const data = await listRepoAssets(connectionId);
      setAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }

  // Derive language tabs from actual data
  const languageCounts = assets.reduce<Record<string, number>>((acc, asset) => {
    const lang = asset.language || "Unknown";
    acc[lang] = (acc[lang] || 0) + 1;
    return acc;
  }, {});

  const languageTabs = [
    { key: "all", label: "All", count: assets.length },
    ...Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => ({ key: lang, label: lang, count })),
  ];

  const filtered = assets.filter((asset) => {
    const matchesSearch =
      asset.repo_full_name.toLowerCase().includes(search.toLowerCase()) ||
      asset.repo_name.toLowerCase().includes(search.toLowerCase());
    const matchesLang =
      langFilter === "all" ||
      (asset.language || "Unknown") === langFilter;
    return matchesSearch && matchesLang;
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#8b949e]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="w-full pl-10 pr-4 py-2 border border-[#30363d] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* Language filter tabs */}
      {!loading && assets.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {languageTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setLangFilter(tab.key)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                langFilter === tab.key
                  ? "bg-primary text-white border-primary"
                  : "bg-[#1c2128] text-[#c9d1d9] border-[#30363d] hover:bg-[#21262d]"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

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
      {!loading && !error && assets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No repositories discovered</h3>
          <p className="text-sm text-[#8b949e]">Run a scan to discover repositories.</p>
        </div>
      )}

      {/* Repos table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Language</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Branch</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Visibility</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Discovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {filtered.map((asset) => {
                const meta = parseMetadata(asset.metadata_json);
                const langStyle = LANGUAGE_COLORS[asset.language] || DEFAULT_LANGUAGE_STYLE;
                const isPrivate = asset.is_private === true || asset.is_private === 1;
                return (
                  <tr key={asset.id} className="hover:bg-[#21262d] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="text-[#8b949e]">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{asset.repo_full_name}</div>
                          <div className="text-xs text-[#8b949e] mt-0.5 flex items-center gap-3">
                            <span>{asset.repo_name}</span>
                            {meta.stars !== undefined && (
                              <span className="inline-flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                                {meta.stars}
                              </span>
                            )}
                            {meta.forks !== undefined && (
                              <span className="inline-flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="18" r="3" />
                                  <circle cx="6" cy="6" r="3" />
                                  <circle cx="18" cy="6" r="3" />
                                  <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
                                  <path d="M12 12v3" />
                                </svg>
                                {meta.forks}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {asset.language ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${langStyle}`}>
                          {asset.language}
                        </span>
                      ) : (
                        <span className="text-sm text-[#8b949e]">--</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-[#c9d1d9] font-mono">{asset.default_branch}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isPrivate ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Private
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                          Public
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-[#8b949e]">{relativeTime(asset.discovered_at)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* No filter results */}
      {!loading && !error && assets.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-[#8b949e] text-sm">
          No repositories match your filters.
        </div>
      )}
    </div>
  );
}
