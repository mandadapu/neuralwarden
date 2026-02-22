"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import RepoConfigModal from "@/components/RepoConfigModal";
import RepoScanProgressOverlay from "@/components/RepoScanProgressOverlay";
import { getRepoConnection, scanRepoConnectionStream, getRepoScanProgress } from "@/lib/api";
import type { RepoConnection, RepoScanStreamEvent } from "@/lib/types";

interface RepoContextValue {
  connection: RepoConnection | null;
  loading: boolean;
  refresh: () => void;
  /** Increments after each scan completes — child pages can watch this to refetch. */
  scanVersion: number;
  /** True when the repo connection is disabled — child pages should be read-only. */
  isDisabled: boolean;
}

const RepoContext = createContext<RepoContextValue>({
  connection: null,
  loading: true,
  refresh: () => {},
  scanVersion: 0,
  isDisabled: false,
});

export function useRepoContext() {
  return useContext(RepoContext);
}

function GitHubBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#00e68a]/10 text-[#00e68a] text-xs font-semibold rounded-full uppercase">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
      GitHub
    </span>
  );
}

const TABS = [
  { label: "Issues", href: "" },
  { label: "Repositories", href: "/repos" },
  { label: "Scan Logs", href: "/scan-logs" },
];

export default function RepoDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.id as string;

  const [connection, setConnection] = useState<RepoConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<RepoScanStreamEvent | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [lastScanLogId, setLastScanLogId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [scanVersion, setScanVersion] = useState(0);

  const loadConnection = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRepoConnection(id);
      setConnection(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repository connection");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  async function handleScan() {
    setScanning(true);
    setScanProgress(null);
    setLastScanLogId(null);
    setError(null);
    setShowOverlay(true);

    // Poll for progress every 2s — reliable even when Cloud Run buffers SSE
    const pollInterval = setInterval(async () => {
      try {
        const progress = await getRepoScanProgress(id);
        if (progress.event === "idle") return;
        setScanProgress(progress);
      } catch { /* ignore poll errors */ }
    }, 2000);

    try {
      await scanRepoConnectionStream(id, (event) => {
        // Only use SSE for terminal events — intermediate progress comes
        // from polling. Buffered SSE events would replay stages otherwise.
        if (event.event === "complete" || event.event === "error") {
          setScanProgress(event);
          if (event.event === "complete" && event.scan_log_id) {
            setLastScanLogId(event.scan_log_id);
          }
        }
      });
      await loadConnection();
      setScanVersion((v) => v + 1);
      window.dispatchEvent(new Event("repoScanCompleted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      clearInterval(pollInterval);
      setScanning(false);
    }
  }

  function handleConfigSave(updated: RepoConnection) {
    setConnection(updated);
    setConfigOpen(false);
  }

  function handleConfigDelete() {
    setConfigOpen(false);
    router.push("/repositories");
  }

  const basePath = `/repositories/${id}`;
  const totalIssues = connection?.issue_counts?.total ?? 0;
  const isDisabled = connection?.status === "disabled";

  return (
    <RepoContext.Provider value={{ connection, loading, refresh: loadConnection, scanVersion, isDisabled: isDisabled ?? false }}>
      <div className="px-7 py-6">
        {/* Loading */}
        {loading && !connection && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {connection && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Link href="/repositories" className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-white">{connection.name}</h1>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full">
                      {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
                    </span>
                    <GitHubBadge />
                  </div>
                  <p className="text-sm text-[#8b949e]">
                    {connection.org_name} &middot; {connection.purpose}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setConfigOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors text-[#8b949e] hover:text-[#e6edf3] text-sm font-medium"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Configure
                </button>
                <button
                  onClick={handleScan}
                  disabled={scanning || isDisabled}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanning ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  )}
                  {scanning ? "Scanning..." : "Start Scan"}
                </button>
              </div>
            </div>

            {/* Disabled banner */}
            {isDisabled && (
              <div className="mb-4 p-3 rounded-xl border border-yellow-500/30 bg-yellow-950/20 text-yellow-400 text-sm flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M4.93 4.93l14.14 14.14" />
                </svg>
                This repository connection is disabled. Re-enable it from Repository Connections to scan.
              </div>
            )}

            {/* Success banner — shown after overlay closes */}
            {!scanning && scanProgress?.event === "complete" && !showOverlay && (
              <div className="mb-4 p-4 rounded-xl border border-[#00e68a]/30 bg-[#00e68a]/10 text-[#00e68a] text-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2.5" className="shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>
                    Scan complete: {scanProgress.repo_count ?? scanProgress.total_repos ?? 0} repos scanned, {scanProgress.issue_count ?? 0} issues found
                  </span>
                  {lastScanLogId && (
                    <Link href={`/repositories/${id}/scan-logs`} className="underline ml-2 hover:text-white transition-colors">
                      View scan log
                    </Link>
                  )}
                </div>
                <button onClick={() => setScanProgress(null)} className="opacity-60 hover:opacity-100 cursor-pointer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Error banner — shown after overlay closes */}
            {!scanning && scanProgress?.event === "error" && !showOverlay && (
              <div className="mb-4 p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-400 text-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" className="shrink-0">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  <span>Scan failed: {scanProgress.message ?? "Unknown error"}</span>
                </div>
                <button onClick={() => setScanProgress(null)} className="opacity-60 hover:opacity-100 cursor-pointer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Tab navigation */}
            <div className="border-b border-[#30363d] mb-6">
              <nav className="flex gap-0 -mb-px">
                {TABS.map((tab) => {
                  const tabHref = `${basePath}${tab.href}`;
                  const isActive =
                    tab.href === ""
                      ? pathname === basePath
                      : pathname === tabHref || pathname.startsWith(tabHref + "/");
                  return (
                    <Link
                      key={tab.href}
                      href={tabHref}
                      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-[#8b949e] hover:text-[#e6edf3] hover:border-[#30363d]"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Tab content */}
            {children}
          </>
        )}
      </div>

      {/* Repo scan overlay */}
      <RepoScanProgressOverlay
        open={showOverlay}
        onClose={() => setShowOverlay(false)}
        progress={scanProgress}
        scanning={scanning}
      />

      {/* Config modal */}
      {connection && (
        <RepoConfigModal
          connection={connection}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onSave={handleConfigSave}
          onDelete={handleConfigDelete}
        />
      )}
    </RepoContext.Provider>
  );
}
