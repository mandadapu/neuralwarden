"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAnalysisContext } from "@/context/AnalysisContext";
import { useClouds, useRepoConnections, SWR_KEYS } from "@/lib/swr";
import { mutate } from "swr";

export default function Sidebar() {
  const pathname = usePathname();
  const { result, snoozedThreats, ignoredThreats, resolvedThreats } = useAnalysisContext();
  const pipelineThreatCount = result?.classified_threats?.length ?? 0;
  const snoozedCount = snoozedThreats.length;
  const ignoredCount = ignoredThreats.length;
  const resolvedCount = resolvedThreats.length;
  const { data: clouds = [] } = useClouds();
  const { data: repos = [] } = useRepoConnections();

  const cloudCount = clouds.length;
  const cloudIssueCount = clouds.reduce((sum, c) => sum + (c.issue_counts?.total ?? 0), 0);
  const repoCount = repos.length;
  const repoIssueCount = repos.reduce((sum, c) => sum + (c.issue_counts?.total ?? 0), 0);

  // Listen for scan completion events — revalidate SWR caches
  useEffect(() => {
    const handler = () => {
      mutate(SWR_KEYS.clouds);
      mutate(SWR_KEYS.repos);
    };
    window.addEventListener("scanCompleted", handler);
    window.addEventListener("repoScanCompleted", handler);
    return () => {
      window.removeEventListener("scanCompleted", handler);
      window.removeEventListener("repoScanCompleted", handler);
    };
  }, []);

  const feedCount = pipelineThreatCount + cloudIssueCount + repoIssueCount;

  return (
    <aside className="w-[250px] min-w-[250px] h-full overflow-y-auto bg-sidebar text-gray-400 text-sm flex flex-col">
      {/* Account selector */}
      <div className="mx-3 mt-4 mb-4 px-3 py-2.5 bg-[#00e68a]/5 border border-[#30363d] rounded-lg flex items-center gap-2.5 cursor-pointer">
        <img src="/logo.svg" alt="" className="w-6 h-6 rounded" />
        <span className="text-[#8b949e] text-[13px] font-medium">Security Pipeline v2</span>
      </div>

      {/* Primary nav */}
      <nav className="px-2 space-y-0.5">
        <NavItem href="/feed" icon={<GridIcon />} label="Feed" active={pathname === "/feed"} count={feedCount > 0 ? String(feedCount) : undefined} />
        <NavItem href="/snoozed" icon={<ClockIcon />} label="Snoozed" active={pathname === "/snoozed"} count={snoozedCount > 0 ? String(snoozedCount) : undefined} />
        <NavItem href="/ignored" icon={<XIcon />} label="Ignored" active={pathname === "/ignored"} badge={String(ignoredCount)} />
        <NavItem href="/resolved" icon={<CheckIcon />} label="Resolved" active={pathname === "/resolved"} count={resolvedCount > 0 ? String(resolvedCount) : undefined} />
      </nav>

      <Divider />

      <nav className="px-2">
        <NavItem href="/autofix" icon={<WrenchIcon />} label="AutoFix" active={pathname === "/autofix"} />
      </nav>

      <Divider />

      {/* Resources */}
      <nav className="px-2 space-y-0.5">
        <NavItem href="/clouds" icon={<CloudIcon />} label="Cloud Connections" active={pathname.startsWith("/clouds")} badge={cloudIssueCount > 0 ? String(cloudIssueCount) : undefined} count={cloudCount > 0 ? String(cloudCount) : undefined} />
        <NavItem href="/repositories" icon={<GitHubIcon />} label="Repositories" active={pathname.startsWith("/repositories")} badge={repoIssueCount > 0 ? String(repoIssueCount) : undefined} count={repoCount > 0 ? String(repoCount) : undefined} />
        <NavItem href="/agents" icon={<ServerIcon />} label="Agents" count="16" active={pathname === "/agents"} />
        <NavItem href="/mitre" icon={<SunIcon />} label="MITRE ATT&CK" count="1" active={pathname === "/mitre"} />
        <NavItem href="/threat-intel" icon={<ShieldIcon />} label="Threat Intel" count="1" active={pathname === "/threat-intel"} />
      </nav>

      <Divider />

      {/* Bottom nav */}
      <nav className="px-2 pb-5 space-y-0.5">
        <NavItem href="/reports" icon={<FileIcon />} label="Reports" active={pathname === "/reports"} />
        <NavItem href="/pentests" icon={<SearchIcon />} label="Pentests" active={pathname === "/pentests"} />
        <NavItem href="/integrations" icon={<LayoutIcon />} label="Integrations" active={pathname === "/integrations"} />
      </nav>
    </aside>
  );
}

function NavItem({
  href,
  icon,
  label,
  active,
  badge,
  count,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
  count?: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-colors ${
        active ? "bg-primary/[.18] text-white font-semibold" : "text-[#8b949e] hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        {label}
      </div>
      {badge !== undefined && (
        <span className="bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{badge}</span>
      )}
      {count !== undefined && (
        <span className="bg-white/10 text-[#8b949e] text-[11px] font-semibold px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </Link>
  );
}

function Divider() {
  return <div className="h-px bg-white/[.08] mx-3 my-3.5" />;
}

/* Mini SVG icons */
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}
function ServerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
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
function LayoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}
function CloudIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
