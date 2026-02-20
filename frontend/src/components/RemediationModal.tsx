"use client";

import { useState } from "react";
import type { CloudIssue } from "@/lib/types";

interface Props {
  issue: CloudIssue;
  open: boolean;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

export default function RemediationModal({ issue, open, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  function handleCopy() {
    navigator.clipboard.writeText(issue.remediation_script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([issue.remediation_script], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fix-${issue.rule_code}-${issue.location.split(":").pop()?.trim().replace(/\s+/g, "-") ?? "script"}.sh`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Remediation Script</h2>
              <p className="text-xs text-gray-500">{issue.rule_code} &middot; {issue.location}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Issue info */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_STYLES[issue.severity] ?? "bg-gray-100 text-gray-600"}`}>
            {issue.severity}
          </span>
          <span className="text-sm text-gray-700 font-medium">{issue.title}</span>
          <span className="text-xs text-gray-400 ml-auto">{issue.fix_time}</span>
        </div>

        {/* Script */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <pre className="font-mono text-xs leading-relaxed bg-gray-900 text-gray-200 rounded-xl p-5 overflow-x-auto whitespace-pre-wrap">
            {issue.remediation_script}
          </pre>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400 max-w-md">
            Review this script carefully before running. Replace placeholder values (YOUR_OFFICE_IP, PROJECT_ID, etc.) with actual values.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-600"
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-semibold"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download .sh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
