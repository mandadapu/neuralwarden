"use client";

import { useState, useEffect, createContext, useContext, useCallback } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import CloudConfigModal from "@/components/CloudConfigModal";
import ScanLogModal from "@/components/ScanLogModal";
import ScanProgressOverlay from "@/components/ScanProgressOverlay";
import { getCloud, scanCloudStream } from "@/lib/api";
import type { CloudAccount, ScanStreamEvent } from "@/lib/types";

interface CloudContextValue {
  cloud: CloudAccount | null;
  loading: boolean;
  refresh: () => void;
  /** Increments after each scan completes — child pages can watch this to refetch. */
  scanVersion: number;
}

const CloudContext = createContext<CloudContextValue>({
  cloud: null,
  loading: true,
  refresh: () => {},
  scanVersion: 0,
});

export function useCloudContext() {
  return useContext(CloudContext);
}

function GcpBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#00e68a]/10 text-[#00e68a] text-xs font-semibold rounded-full uppercase">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#4285F4" opacity="0.3" stroke="#4285F4" strokeWidth="1.5" />
      </svg>
      GCP
    </span>
  );
}

const TABS = [
  { label: "Issues", href: "" },
  { label: "Assets", href: "/assets" },
  { label: "Virtual Machines", href: "/virtual-machines" },
  { label: "Checks", href: "/checks" },
  { label: "Scan Logs", href: "/scan-logs" },
];

export default function CloudDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const id = params.id as string;

  const [cloud, setCloud] = useState<CloudAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanStreamEvent | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [lastScanLogId, setLastScanLogId] = useState<string | null>(null);
  const [showScanLog, setShowScanLog] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [scanVersion, setScanVersion] = useState(0);

  const loadCloud = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCloud(id);
      setCloud(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cloud");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCloud();
  }, [loadCloud]);

  async function handleScan() {
    setScanning(true);
    setScanProgress(null);
    setLastScanLogId(null);
    setError(null);
    setShowOverlay(true);
    try {
      await scanCloudStream(id, (event) => {
        setScanProgress(event);
        if (event.event === "complete" && event.scan_log_id) {
          setLastScanLogId(event.scan_log_id);
        }
      });
      await loadCloud();
      setScanVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function handleConfigSave(updated: CloudAccount) {
    setCloud(updated);
    setConfigOpen(false);
  }

  function handleConfigDelete() {
    setConfigOpen(false);
    router.push("/clouds");
  }

  const basePath = `/clouds/${id}`;
  const totalIssues = cloud?.issue_counts?.total ?? 0;

  function progressMessage(): string {
    if (!scanProgress) return "Starting scan...";
    const evt = scanProgress.event;
    if (evt === "starting") return "Initializing scan...";
    if (evt === "discovered") return `Discovered ${scanProgress.total_assets ?? 0} assets`;
    if (evt === "routing") return `Routing ${scanProgress.total_assets ?? 0} assets (${scanProgress.public_count ?? 0} public, ${scanProgress.private_count ?? 0} private)`;
    if (evt === "scanned") return `Scanned ${scanProgress.assets_scanned ?? 0} assets — running threat analysis...`;
    if (evt === "complete") {
      const exploits = scanProgress.active_exploits_detected ?? 0;
      const base = `Scan complete: ${scanProgress.asset_count ?? 0} assets, ${scanProgress.issue_count ?? 0} issues found`;
      return exploits > 0 ? `${base} — ${exploits} active exploit${exploits !== 1 ? "s" : ""} detected!` : base;
    }
    if (evt === "error") return `Error: ${scanProgress.message ?? "Unknown error"}`;
    return `${evt}...`;
  }

  const isComplete = scanProgress?.event === "complete";
  const isError = scanProgress?.event === "error";

  return (
    <CloudContext.Provider value={{ cloud, loading, refresh: loadCloud, scanVersion }}>
      <div className="px-7 py-6">
        {/* Loading */}
        {loading && !cloud && (
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

        {cloud && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Link href="/clouds" className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-white">{cloud.name}</h1>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full">
                      {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
                    </span>
                    <GcpBadge />
                  </div>
                  <p className="text-sm text-[#8b949e]">
                    {cloud.project_id} &middot; {cloud.purpose}
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
                  disabled={scanning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
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

            {/* Scan progress panel */}
            {(scanning || scanProgress) && (
              <div className={`mb-4 p-4 rounded-xl border text-sm flex items-center justify-between ${
                isError
                  ? "bg-red-50 border-red-200 text-red-700"
                  : isComplete
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-[#00e68a]/10 border-[#00e68a]/30 text-[#00e68a]"
              }`}>
                <div className="flex items-center gap-3">
                  {scanning && !isComplete && !isError && (
                    <div className="w-4 h-4 border-2 border-[#00e68a]/30 border-t-[#00e68a] rounded-full animate-spin" />
                  )}
                  {isComplete && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  <span>{progressMessage()}</span>
                  {isComplete && lastScanLogId && (
                    <button
                      onClick={() => setShowScanLog(true)}
                      className="ml-2 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 transition-colors"
                    >
                      View Scan Log
                    </button>
                  )}
                  {scanProgress && !isComplete && !isError && scanProgress.public_count !== undefined && (
                    <span className="ml-2 text-xs opacity-70">
                      ({scanProgress.public_count} public, {scanProgress.private_count} private)
                    </span>
                  )}
                </div>
                {(isComplete || isError) && (
                  <button onClick={() => setScanProgress(null)} className="opacity-60 hover:opacity-100">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
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

      {/* Config modal */}
      {cloud && (
        <CloudConfigModal
          cloud={cloud}
          open={configOpen}
          onClose={() => setConfigOpen(false)}
          onSave={handleConfigSave}
          onDelete={handleConfigDelete}
        />
      )}

      {/* Scan log modal */}
      {lastScanLogId && (
        <ScanLogModal
          cloudId={id}
          logId={lastScanLogId}
          open={showScanLog}
          onClose={() => setShowScanLog(false)}
        />
      )}

      {/* Scan progress overlay */}
      <ScanProgressOverlay
        open={showOverlay}
        onClose={() => setShowOverlay(false)}
        progress={scanProgress}
        scanning={scanning}
      />
    </CloudContext.Provider>
  );
}
