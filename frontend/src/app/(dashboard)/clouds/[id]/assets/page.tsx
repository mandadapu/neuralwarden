"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listCloudAssets } from "@/lib/api";
import type { CloudAsset } from "@/lib/types";

const ASSET_TYPES = [
  { key: "all", label: "All" },
  { key: "compute_instance", label: "Compute Instance" },
  { key: "gcs_bucket", label: "GCS Bucket" },
  { key: "firewall_rule", label: "Firewall Rule" },
  { key: "cloud_sql", label: "Cloud SQL" },
  { key: "cloud_run", label: "Cloud Run" },
];

const ASSET_ICONS: Record<string, React.ReactNode> = {
  compute_instance: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <circle cx="6" cy="6" r="1" fill="#6366f1" />
      <circle cx="6" cy="18" r="1" fill="#6366f1" />
    </svg>
  ),
  gcs_bucket: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
      <path d="M2 7l10 5 10-5M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  firewall_rule: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  cloud_sql: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  cloud_run: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
};

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

function truncateMetadata(jsonStr: string): string {
  try {
    const obj = JSON.parse(jsonStr);
    const keys = Object.keys(obj).slice(0, 3);
    const parts = keys.map((k) => {
      const val = obj[k];
      const display = typeof val === "string" ? val : JSON.stringify(val);
      return `${k}: ${display.length > 30 ? display.slice(0, 30) + "..." : display}`;
    });
    return parts.join(", ");
  } catch {
    return jsonStr.slice(0, 80);
  }
}

export default function AssetsTab() {
  const params = useParams();
  const cloudId = params.id as string;

  const [assets, setAssets] = useState<CloudAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    loadAssets();
  }, [cloudId]);

  async function loadAssets() {
    try {
      setLoading(true);
      const data = await listCloudAssets(cloudId);
      setAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }

  const filtered = assets.filter((asset) => {
    const matchesSearch =
      asset.name.toLowerCase().includes(search.toLowerCase()) ||
      asset.region.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || asset.asset_type === typeFilter;
    return matchesSearch && matchesType;
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
            placeholder="Search assets..."
            className="w-full pl-10 pr-4 py-2 border border-[#30363d] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-5">
        {ASSET_TYPES.map((at) => (
          <button
            key={at.key}
            onClick={() => setTypeFilter(at.key)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              typeFilter === at.key
                ? "bg-primary text-white border-primary"
                : "bg-[#1c2128] text-[#c9d1d9] border-[#30363d] hover:bg-[#21262d]"
            }`}
          >
            {at.label}
          </button>
        ))}
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
      {!loading && !error && assets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No assets discovered</h3>
          <p className="text-sm text-[#8b949e]">Run a scan to discover cloud resources.</p>
        </div>
      )}

      {/* Assets table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3 w-10">Type</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Region</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Metadata</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Discovered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {filtered.map((asset) => (
                <tr key={asset.id} className="hover:bg-[#21262d] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="text-[#8b949e]">
                      {ASSET_ICONS[asset.asset_type] ?? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                        </svg>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-white">{asset.name}</div>
                    <div className="text-xs text-[#8b949e] mt-0.5">{asset.asset_type.replace(/_/g, " ")}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9]">{asset.region || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-[#8b949e] font-mono">{truncateMetadata(asset.metadata_json)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#8b949e]">{relativeTime(asset.discovered_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No filter results */}
      {!loading && !error && assets.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-[#8b949e] text-sm">
          No assets match your filters.
        </div>
      )}
    </div>
  );
}
