"use client";

import { useState, useEffect } from "react";
import PageShell from "@/components/PageShell";
import { getThreatIntelStats, listThreatIntelEntries, searchThreatIntel } from "@/lib/api";
import type { ThreatIntelStats, ThreatIntelEntry, ThreatIntelSearchResult } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200",
  high: "bg-orange-100 text-orange-700 border border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  low: "bg-blue-100 text-blue-700 border border-blue-200",
};

const CATEGORIES = [
  { key: null, label: "All" },
  { key: "cve", label: "CVEs" },
  { key: "threat_pattern", label: "Threat Patterns" },
  { key: "owasp_agentic", label: "OWASP Agentic" },
] as const;

export default function ThreatIntelPage() {
  const [stats, setStats] = useState<ThreatIntelStats | null>(null);
  const [entries, setEntries] = useState<ThreatIntelEntry[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ThreatIntelSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    getThreatIntelStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    listThreatIntelEntries(category ?? undefined)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [category]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const data = await searchThreatIntel(searchQuery.trim(), 5);
      setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <PageShell
      title="Threat Intel"
      description="Knowledge base with semantic search over CVEs, threat patterns, and OWASP Agentic Top 10"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      }
    >
      {/* Stats Bar */}
      <div className="mt-6 flex items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-gray-200">
          <span className={`w-2.5 h-2.5 rounded-full ${stats?.connected ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`} />
          <span className="text-sm font-medium text-gray-700">
            Pinecone {stats?.connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        {stats && (
          <div className="px-4 py-2.5 bg-white rounded-xl border border-gray-200">
            <span className="text-sm text-gray-500">Vectors: </span>
            <span className="text-sm font-semibold text-[#1a1a2e]">
              {stats.total_vectors.toLocaleString()}
            </span>
          </div>
        )}
        <div className="px-4 py-2.5 bg-white rounded-xl border border-gray-200">
          <span className="text-sm text-gray-500">Local Entries: </span>
          <span className="text-sm font-semibold text-[#1a1a2e]">{entries.length}</span>
        </div>
      </div>

      {/* Semantic Search */}
      <div className="mt-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Semantic search — e.g. 'prompt injection agent hijack' or 'SSH brute force lateral movement'"
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-[#1a1a2e] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="px-6 py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
      </div>

      {/* Search Results */}
      {hasSearched && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Search Results {searchResults.length > 0 && `(${searchResults.length})`}
            </h2>
            <button
              onClick={() => { setHasSearched(false); setSearchResults([]); setSearchQuery(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Clear
            </button>
          </div>
          {searchResults.length === 0 ? (
            <div className="p-6 bg-white rounded-xl border border-gray-200 text-center text-sm text-gray-500">
              {searching ? "Searching Pinecone..." : "No results found. Make sure Pinecone is connected and seeded."}
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map((r) => (
                <div key={r.id} className="p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-mono font-semibold text-primary">{r.id}</span>
                        {r.metadata?.severity && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${SEVERITY_STYLES[r.metadata.severity as string] ?? "bg-gray-100 text-gray-600"}`}>
                            {r.metadata.severity as string}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
                      {(r.metadata?.technique || r.metadata?.tactic) && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                          {r.metadata.technique && <span className="font-mono">{r.metadata.technique as string}</span>}
                          {r.metadata.tactic && <span>{r.metadata.tactic as string}</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-[#1a1a2e]">{Math.round(r.score * 100)}%</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide">relevance</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Knowledge Base Table */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Knowledge Base</h2>

        {/* Category Tabs */}
        <div className="flex gap-1 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => setCategory(c.key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                category === c.key
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 bg-white rounded-xl border border-gray-200 text-center text-sm text-gray-400">
            Loading entries...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-gray-200 text-center text-sm text-gray-500">
            No entries found for this category.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-700 w-[140px]">ID</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Description</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-700 w-[90px]">Severity</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-700 w-[70px]">CVSS</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-700 w-[110px]">MITRE</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-700 w-[140px]">Tactic</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const meta = entry.metadata;
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-primary align-top">{entry.id}</td>
                      <td className="px-5 py-3.5 text-gray-700 align-top">
                        <p className={isExpanded ? "" : "line-clamp-2"}>{entry.text}</p>
                        {meta.affected_software && (
                          <span className="inline-block mt-1 text-[10px] text-gray-400">
                            Software: {meta.affected_software}
                          </span>
                        )}
                        {meta.framework && (
                          <span className="inline-block mt-1 ml-2 text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded border border-violet-200 font-semibold">
                            {meta.control_id}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {meta.severity && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${SEVERITY_STYLES[meta.severity] ?? "bg-gray-100 text-gray-600"}`}>
                            {meta.severity}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 font-mono text-xs align-top">
                        {meta.cvss ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500 align-top">
                        {meta.technique ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs align-top">
                        {meta.tactic ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
