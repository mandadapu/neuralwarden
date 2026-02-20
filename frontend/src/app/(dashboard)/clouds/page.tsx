"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import PageShell from "@/components/PageShell";
import { listClouds, setApiUserEmail } from "@/lib/api";
import type { CloudAccount } from "@/lib/types";

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
  const [clouds, setClouds] = useState<CloudAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session?.user?.email) return;
    setApiUserEmail(session.user.email);
    loadClouds();
  }, [session?.user?.email]);

  async function loadClouds() {
    try {
      setLoading(true);
      const data = await listClouds();
      setClouds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clouds");
    } finally {
      setLoading(false);
    }
  }

  const filtered = clouds.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.project_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageShell
      title="Clouds"
      description="Connected cloud accounts"
      icon={<CloudIcon />}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mt-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full">
            {clouds.length} connected cloud{clouds.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Link
          href="/clouds/connect"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover transition-colors"
        >
          <PlusIcon />
          Connect Cloud
        </Link>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#3a5548]">
            <SearchIcon />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clouds..."
            className="w-full pl-10 pr-4 py-2 border border-[#122a1e] rounded-lg text-sm bg-[#0a1a14] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-[#122a1e] rounded-lg text-sm font-medium text-[#8a9a90] hover:bg-[#0a1a14] transition-colors">
          <SearchIcon />
          Search Cloud Assets
        </button>
      </div>

      {/* Loading */}
      {loading && (
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

      {/* Empty state */}
      {!loading && !error && clouds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0c1e18] flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3a5548" strokeWidth="1.5">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">No clouds connected yet</h3>
          <p className="text-sm text-[#5a7068] mb-5">Connect your first cloud to start scanning.</p>
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
        <div className="bg-[#081510] rounded-xl border border-[#122a1e] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#0a1a14] border-b border-[#122a1e]">
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Purpose</th>
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Project ID</th>
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Issues</th>
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Ignored</th>
                <th className="text-left text-xs font-semibold text-[#5a7068] uppercase tracking-wider px-5 py-3">Last Scan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0e1e16]">
              {filtered.map((cloud) => (
                <tr
                  key={cloud.id}
                  onClick={() => router.push(`/clouds/${cloud.id}`)}
                  className="hover:bg-[#0a1a14] cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <GcpIcon />
                      <span className="text-xs text-[#5a7068] font-medium uppercase">{cloud.provider}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-white">{cloud.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#8a9a90] capitalize">{cloud.purpose || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs text-[#5a7068] bg-[#0c1e18] px-2 py-0.5 rounded font-mono">{cloud.project_id}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    <IssueBadges counts={cloud.issue_counts} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#5a7068]">0</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#5a7068]">{relativeTime(cloud.last_scan_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No search results */}
      {!loading && !error && clouds.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-[#5a7068] text-sm">
          No clouds match your search.
        </div>
      )}
    </PageShell>
  );
}

function IssueBadges({ counts }: { counts?: { critical: number; high: number; medium: number; low: number } }) {
  if (!counts) return <span className="text-sm text-[#3a5548]">--</span>;
  const badges = [
    { key: "critical", value: counts.critical, bg: "bg-red-100 text-red-700" },
    { key: "high", value: counts.high, bg: "bg-orange-100 text-orange-700" },
    { key: "medium", value: counts.medium, bg: "bg-yellow-100 text-yellow-700" },
    { key: "low", value: counts.low, bg: "bg-blue-100 text-blue-700" },
  ];
  const hasCounts = badges.some((b) => b.value > 0);
  if (!hasCounts) return <span className="text-sm text-[#3a5548]">0</span>;
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
