"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import PageShell from "@/components/PageShell";
import RemediationModal from "@/components/RemediationModal";
import { listClouds, listCloudIssues } from "@/lib/api";
import type { CloudIssue } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-700",
};

export default function AutoFixPage() {
  const { data: session } = useSession();
  const [issues, setIssues] = useState<(CloudIssue & { account_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixIssue, setFixIssue] = useState<CloudIssue | null>(null);

  useEffect(() => {
    const token = session?.backendToken as string;
    if (!token) return;
    loadAllIssues();
  }, [session?.backendToken]);

  async function loadAllIssues() {
    try {
      setLoading(true);
      const accounts = await listClouds();
      const allIssues: (CloudIssue & { account_name?: string })[] = [];
      for (const account of accounts) {
        const accountIssues = await listCloudIssues(account.id);
        for (const issue of accountIssues) {
          allIssues.push({ ...issue, account_name: account.name });
        }
      }
      setIssues(allIssues);
    } catch {
      // silently handle — page still shows zero state
    } finally {
      setLoading(false);
    }
  }

  const fixable = issues.filter((i) => i.remediation_script);
  const applied = fixable.filter((i) => i.status === "resolved");
  const skipped = fixable.filter((i) => i.status === "ignored");
  const available = fixable.filter((i) => i.status === "todo" || i.status === "in_progress");

  return (
    <PageShell
      title="AutoFix"
      description="Automated remediation for common security issues"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      }
    >
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] p-5">
          <div className="text-2xl font-bold text-white">{loading ? "—" : available.length}</div>
          <div className="text-sm text-[#8b949e]">Available fixes</div>
        </div>
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] p-5">
          <div className="text-2xl font-bold text-green-600">{loading ? "—" : applied.length}</div>
          <div className="text-sm text-[#8b949e]">Applied</div>
        </div>
        <div className="bg-[#1c2128] rounded-xl border border-[#30363d] p-5">
          <div className="text-2xl font-bold text-[#8b949e]">{loading ? "—" : skipped.length}</div>
          <div className="text-sm text-[#8b949e]">Skipped</div>
        </div>
      </div>

      {loading && (
        <div className="mt-6 flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && fixable.length === 0 && (
        <div className="mt-4 bg-[#1c2128] rounded-xl border border-[#30363d] p-12 text-center">
          <p className="text-[#8b949e] text-sm">Run a cloud scan to discover auto-fixable issues.</p>
        </div>
      )}

      {!loading && available.length > 0 && (
        <div className="mt-4 bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#21262d] border-b border-[#30363d]">
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Issue</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Severity</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Account</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Location</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3">Fix Time</th>
                <th className="text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262c34]">
              {available.map((issue) => (
                <tr key={issue.id} className="hover:bg-[#21262d] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="text-sm font-medium text-white">{issue.title}</div>
                    <div className="text-xs text-[#8b949e] mt-0.5">{issue.rule_code}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${SEVERITY_STYLES[issue.severity] ?? ""}`}>
                      {issue.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9]">{issue.account_name ?? "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9]">{issue.location || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-[#c9d1d9]">{issue.fix_time || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setFixIssue(issue)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-hover transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                      </svg>
                      View Fix
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fixIssue && (
        <RemediationModal
          issue={fixIssue}
          open={!!fixIssue}
          onClose={() => setFixIssue(null)}
        />
      )}
    </PageShell>
  );
}
