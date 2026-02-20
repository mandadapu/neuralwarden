"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { listCloudAssets, listCloudIssues } from "@/lib/api";
import type { CloudAsset, CloudIssue } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-700",
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface VmRow {
  asset: CloudAsset;
  zone: string;
  openIssues: number;
  ignoredIssues: number;
  highestSeverity: string | null;
  purpose: string;
  lastScan: string | null;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
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

function getZone(asset: CloudAsset): string {
  try {
    const meta = JSON.parse(asset.metadata_json);
    return meta.zone || asset.region || "—";
  } catch {
    return asset.region || "—";
  }
}

function getPurpose(asset: CloudAsset): string {
  try {
    const meta = JSON.parse(asset.metadata_json);
    return meta.purpose || meta.labels?.purpose || meta.labels?.env || "General";
  } catch {
    return "General";
  }
}

export default function VirtualMachinesTab() {
  const params = useParams();
  const cloudId = params.id as string;

  const [vmRows, setVmRows] = useState<VmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [cloudId]);

  async function loadData() {
    try {
      setLoading(true);
      const [assets, issues] = await Promise.all([
        listCloudAssets(cloudId, "compute_instance"),
        listCloudIssues(cloudId),
      ]);

      // Build VM rows with issue cross-references
      const rows: VmRow[] = assets.map((asset) => {
        const assetIssues = issues.filter((i) => i.asset_id === asset.id);
        const openIssues = assetIssues.filter((i) => i.status !== "ignored" && i.status !== "resolved").length;
        const ignoredIssues = assetIssues.filter((i) => i.status === "ignored").length;

        const activeSeverities = assetIssues
          .filter((i) => i.status !== "ignored" && i.status !== "resolved")
          .map((i) => i.severity);
        const highestSeverity = activeSeverities.length > 0
          ? activeSeverities.sort((a, b) => (SEVERITY_ORDER[a] ?? 4) - (SEVERITY_ORDER[b] ?? 4))[0]
          : null;

        return {
          asset,
          zone: getZone(asset),
          openIssues,
          ignoredIssues,
          highestSeverity,
          purpose: getPurpose(asset),
          lastScan: asset.discovered_at,
        };
      });

      setVmRows(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load VMs");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center gap-3 mb-5">
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Scan VMs
        </button>
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-[#30363d] text-sm font-medium text-[#c9d1d9] rounded-lg hover:bg-[#21262d] transition-colors">
          Disconnect VMs
        </button>
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
      {!loading && !error && vmRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No virtual machines found</h3>
          <p className="text-sm text-[#8b949e]">Run a scan to discover compute instances.</p>
        </div>
      )}

      {/* VM table */}
      {!loading && !error && vmRows.length > 0 && (
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Open Issues</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Ignored</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Severity</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Purpose</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Last Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {vmRows.map((row) => (
                <tr key={row.asset.id} className="hover:bg-[#21262d] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{row.asset.name}</div>
                        <div className="text-xs text-[#8b949e]">{row.zone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-sm font-medium ${row.openIssues > 0 ? "text-red-600" : "text-[#8b949e]"}`}>
                      {row.openIssues}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#8b949e]">{row.ignoredIssues}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {row.highestSeverity ? (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${SEVERITY_STYLES[row.highestSeverity] ?? ""}`}>
                        {row.highestSeverity}
                      </span>
                    ) : (
                      <span className="text-sm text-[#8b949e]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9] capitalize">{row.purpose}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#8b949e]">{relativeTime(row.lastScan)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
