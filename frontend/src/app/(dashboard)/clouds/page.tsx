"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PageShell from "@/components/PageShell";
import { scanCloudStream, getScanProgress, deleteCloud, toggleCloud, setApiToken } from "@/lib/api";
import { useClouds } from "@/lib/swr";
import type { CloudAccount, ScanStreamEvent } from "@/lib/types";
import ScanProgressOverlay from "@/components/ScanProgressOverlay";

function CloudIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function GcpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#4285F4" opacity="0.15" stroke="#4285F4" strokeWidth="1.5" />
      <path d="M12 8v8M8 12h8" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
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

export default function CloudsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: clouds = [], error: swrError, isLoading: loading, mutate: mutateClouds } = useClouds();
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to list clouds") : null;
  const [search, setSearch] = useState("");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanStreamEvent | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent, cloudId: string) {
    e.stopPropagation();
    if (confirmDeleteId !== cloudId) {
      setConfirmDeleteId(cloudId);
      return;
    }
    try {
      await deleteCloud(cloudId);
      mutateClouds(clouds.filter((c) => String(c.id) !== cloudId), false);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handleToggle(e: React.MouseEvent, cloudId: string) {
    e.stopPropagation();
    try {
      const updated = await toggleCloud(cloudId);
      mutateClouds(clouds.map((c) => (String(c.id) === cloudId ? updated : c)), false);
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  }

  async function handleSync(e: React.MouseEvent, cloudId: string) {
    e.stopPropagation();
    setScanningId(cloudId);
    setScanProgress(null);
    setShowOverlay(true);

    // Poll for progress every 2s — reliable even when Cloud Run buffers SSE
    const pollInterval = setInterval(async () => {
      try {
        const progress = await getScanProgress(cloudId);
        if (progress.event !== "idle") setScanProgress(progress);
      } catch { /* ignore */ }
    }, 2000);

    try {
      await scanCloudStream(cloudId, (event) => {
        // Only use SSE for terminal events — polling handles progress
        if (event.event === "complete" || event.event === "error") {
          setScanProgress(event);
        }
      });
      await mutateClouds();
      window.dispatchEvent(new Event("scanCompleted"));
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      clearInterval(pollInterval);
      setScanningId(null);
    }
  }

  useEffect(() => {
    const token = session?.backendToken as string;
    if (!token) return;
    setApiToken(token);
  }, [session?.backendToken]);

  const filtered = clouds.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.project_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageShell
      title="Cloud Connections"
      description="Connected cloud accounts"
      icon={<CloudIcon />}
    >
      {/* Header row + Search */}
      {!loading && (
        <>
          <div className="flex items-center justify-between mt-4 mb-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#00e68a]/10 text-[#00e68a] text-xs font-semibold rounded-full border border-[#00e68a]/20">
                {clouds.length} connection{clouds.length !== 1 ? "s" : ""}
              </span>
            </div>
            {clouds.length > 0 && (
              <Link
                href="/clouds/connect"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors"
              >
                <PlusIcon />
                Connect Cloud
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#8b949e]">
                <SearchIcon />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search connections..."
                className="w-full pl-10 pr-4 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2 border border-[#30363d] rounded-lg text-sm font-medium text-[#c9d1d9] hover:bg-[#21262d] transition-colors">
              <SearchIcon />
              Search Cloud Assets
            </button>
          </div>
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-xl text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && clouds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No clouds connected yet</h3>
          <p className="text-sm text-[#8b949e] mb-5">Connect your first cloud to start scanning.</p>
          <Link
            href="/clouds/connect"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors"
          >
            <PlusIcon />
            Connect Cloud
          </Link>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Purpose</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Project ID</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Assets</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Issues</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Last Scan</th>
                <th className="text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {filtered.map((cloud) => {
                const isDisabled = cloud.status === "disabled";
                return (
                <tr
                  key={cloud.id}
                  onClick={() => router.push(`/clouds/${cloud.id}`)}
                  className={`hover:bg-[#21262d] cursor-pointer transition-colors ${isDisabled ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <GcpIcon />
                      <span className="text-xs text-[#8b949e] font-medium uppercase">{cloud.provider}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{cloud.name}</span>
                      {isDisabled && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#30363d] text-[#8b949e] uppercase">Disabled</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9] capitalize">{cloud.purpose || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-[#8b949e] bg-[#262c34] px-2 py-0.5 rounded font-mono">{cloud.project_id}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-[#c9d1d9]">{cloud.asset_counts?.total ?? 0}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <IssueBadges counts={cloud.issue_counts} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#8b949e]">{relativeTime(cloud.last_scan_at)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => handleToggle(e, String(cloud.id))}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          isDisabled
                            ? "border-[#00e68a]/30 text-[#00e68a] hover:bg-[#00e68a]/10"
                            : "border-yellow-500/30 text-yellow-400 hover:bg-yellow-950/20"
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {isDisabled ? (
                            <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>
                          ) : (
                            <><circle cx="12" cy="12" r="10" /><path d="M4.93 4.93l14.14 14.14" /></>
                          )}
                        </svg>
                        {isDisabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        onClick={(e) => handleSync(e, String(cloud.id))}
                        disabled={scanningId === String(cloud.id) || isDisabled}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00e68a]/30 text-[#00e68a] hover:bg-[#00e68a]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={scanningId === String(cloud.id) ? "animate-spin" : ""}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        {scanningId === String(cloud.id) ? "Scanning..." : "Sync"}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, String(cloud.id))}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          confirmDeleteId === String(cloud.id)
                            ? "border-red-500/50 text-red-400 bg-red-950/20 hover:bg-red-950/40"
                            : "border-[#30363d] text-[#8b949e] hover:text-red-400 hover:border-red-500/30 hover:bg-red-950/10"
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        {confirmDeleteId === String(cloud.id) ? "Confirm" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* No search results */}
      {!loading && !error && clouds.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-[#8b949e] text-sm">
          No clouds match your search.
        </div>
      )}
      <ScanProgressOverlay
        open={showOverlay}
        onClose={() => setShowOverlay(false)}
        progress={scanProgress}
        scanning={scanningId !== null}
      />
    </PageShell>
  );
}

function IssueBadges({ counts }: { counts?: { critical: number; high: number; medium: number; low: number } }) {
  if (!counts) return <span className="text-sm text-[#8b949e]">--</span>;
  const badges = [
    { key: "critical", value: counts.critical, bg: "bg-red-100 text-red-700" },
    { key: "high", value: counts.high, bg: "bg-orange-100 text-orange-700" },
    { key: "medium", value: counts.medium, bg: "bg-yellow-100 text-yellow-700" },
    { key: "low", value: counts.low, bg: "bg-blue-100 text-blue-700" },
  ];
  const hasCounts = badges.some((b) => b.value > 0);
  if (!hasCounts) return <span className="text-sm text-[#8b949e]">0</span>;
  return (
    <div className="flex items-center gap-1.5">
      {badges
        .filter((b) => b.value > 0)
        .map((b) => (
          <span key={b.key} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${b.bg}`}>
            {b.value}
          </span>
        ))}
    </div>
  );
}
