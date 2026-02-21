"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PageShell from "@/components/PageShell";
import { listRepoConnections, scanRepoConnectionStream, getRepoScanProgress, deleteRepoConnection, toggleRepoConnection, setApiUserEmail } from "@/lib/api";
import type { RepoConnection, RepoScanStreamEvent } from "@/lib/types";

function RepoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function GitHubBadge() {
  return (
    <div className="flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#8b949e"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      <span className="text-xs text-[#8b949e] font-medium uppercase">GitHub</span>
    </div>
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

export default function RepositoriesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [repos, setRepos] = useState<RepoConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<RepoScanStreamEvent | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent, connId: string) {
    e.stopPropagation();
    if (confirmDeleteId !== connId) {
      setConfirmDeleteId(connId);
      return;
    }
    try {
      await deleteRepoConnection(connId);
      setRepos((prev) => prev.filter((r) => String(r.id) !== connId));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handleToggle(e: React.MouseEvent, connId: string) {
    e.stopPropagation();
    try {
      const updated = await toggleRepoConnection(connId);
      setRepos((prev) => prev.map((r) => (String(r.id) === connId ? updated : r)));
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  }

  async function handleSync(e: React.MouseEvent, connId: string) {
    e.stopPropagation();
    setScanningId(connId);
    setScanProgress(null);

    // Poll for progress every 2s — reliable even when Cloud Run buffers SSE
    const pollInterval = setInterval(async () => {
      try {
        const progress = await getRepoScanProgress(connId);
        if (progress.event !== "idle") setScanProgress(progress);
      } catch { /* ignore */ }
    }, 2000);

    try {
      await scanRepoConnectionStream(connId, (event) => {
        // Only use SSE for terminal events — polling handles progress
        if (event.event === "complete" || event.event === "error") {
          setScanProgress(event);
        }
      });
      await loadRepos();
      window.dispatchEvent(new Event("repoScanCompleted"));
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      clearInterval(pollInterval);
      setScanningId(null);
    }
  }

  useEffect(() => {
    if (!session?.user?.email) return;
    setApiUserEmail(session.user.email);
    loadRepos();
  }, [session?.user?.email]);

  async function loadRepos() {
    try {
      setLoading(true);
      const data = await listRepoConnections();
      setRepos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.org_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageShell
      title="Repositories"
      description="Connected code repositories"
      icon={<RepoIcon />}
    >
      {/* Header row + Search */}
      {!loading && (
        <>
          <div className="flex items-center justify-between mt-4 mb-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#00e68a]/10 text-[#00e68a] text-xs font-semibold rounded-full border border-[#00e68a]/20">
                {repos.length} connection{repos.length !== 1 ? "s" : ""}
              </span>
            </div>
            {repos.length > 0 && (
              <Link
                href="/repositories/connect"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors"
              >
                <PlusIcon />
                Connect Repository
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
                placeholder="Search repositories..."
                className="w-full pl-10 pr-4 py-2 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
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
      {!loading && !error && repos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#262c34] flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No repositories connected yet</h3>
          <p className="text-sm text-[#8b949e] mb-5">Connect your first repository to start scanning.</p>
          <Link
            href="/repositories/connect"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors"
          >
            <PlusIcon />
            Connect Repository
          </Link>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Provider</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Org</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Repos</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Issues</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Last Scan</th>
                <th className="text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {filtered.map((repo) => {
                const isDisabled = repo.status === "disabled";
                return (
                <tr
                  key={repo.id}
                  onClick={() => router.push(`/repositories/${repo.id}`)}
                  className={`hover:bg-[#21262d] cursor-pointer transition-colors ${isDisabled ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <GitHubBadge />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{repo.name}</span>
                      {isDisabled && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#30363d] text-[#8b949e] uppercase">Disabled</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-[#8b949e] bg-[#262c34] px-2 py-0.5 rounded font-mono">{repo.org_name}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-[#c9d1d9]">{repo.asset_counts?.total ?? 0}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <IssueBadges counts={repo.issue_counts} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#8b949e]">{relativeTime(repo.last_scan_at)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => handleToggle(e, String(repo.id))}
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
                        onClick={(e) => handleSync(e, String(repo.id))}
                        disabled={scanningId === String(repo.id) || isDisabled}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00e68a]/30 text-[#00e68a] hover:bg-[#00e68a]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className={scanningId === String(repo.id) ? "animate-spin" : ""}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        {scanningId === String(repo.id) ? "Scanning..." : "Sync"}
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, String(repo.id))}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          confirmDeleteId === String(repo.id)
                            ? "border-red-500/50 text-red-400 bg-red-950/20 hover:bg-red-950/40"
                            : "border-[#30363d] text-[#8b949e] hover:text-red-400 hover:border-red-500/30 hover:bg-red-950/10"
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        {confirmDeleteId === String(repo.id) ? "Confirm" : "Delete"}
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
      {!loading && !error && repos.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-[#8b949e] text-sm">
          No repositories match your search.
        </div>
      )}
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
