"use client";

import { useState, useEffect } from "react";
import { updateFinding } from "@/lib/api";
import type { PentestFinding } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const STATUSES = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In Progress" },
  { id: "resolved", label: "Resolved" },
  { id: "accepted_risk", label: "Accepted Risk" },
  { id: "false_positive", label: "False Positive" },
];

const SEVERITIES = ["critical", "high", "medium", "low"];

interface FindingDetailModalProps {
  finding: PentestFinding;
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: PentestFinding) => void;
}

export default function FindingDetailModal({
  finding,
  open,
  onClose,
  onUpdate,
}: FindingDetailModalProps) {
  const [status, setStatus] = useState(finding.status);
  const [severity, setSeverity] = useState(finding.severity);
  const [remediationNotes, setRemediationNotes] = useState(finding.remediation_notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(finding.status);
      setSeverity(finding.severity);
      setRemediationNotes(finding.remediation_notes);
      setError(null);
    }
  }, [open, finding]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updates: Record<string, unknown> = {};
      if (status !== finding.status) updates.status = status;
      if (severity !== finding.severity) updates.severity = severity;
      if (remediationNotes !== finding.remediation_notes) updates.remediation_notes = remediationNotes;

      if (Object.keys(updates).length > 0) {
        const updated = await updateFinding(finding.id, updates as Parameters<typeof updateFinding>[1]);
        onUpdate(updated);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  const sevStyle = SEVERITY_STYLES[finding.severity] ?? "bg-gray-500/10 text-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-[#1c2128] rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#262c34]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1">
                <h2 className="text-lg font-bold text-white truncate">{finding.title}</h2>
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${sevStyle}`}>
                  {finding.severity}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                {finding.cvss_score !== null && (
                  <span className="font-mono">CVSS {finding.cvss_score}</span>
                )}
                {finding.category && <span>{finding.category}</span>}
                <span>Discovered {new Date(finding.discovered_at).toLocaleDateString()}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 text-[#8b949e] hover:text-[#c9d1d9] rounded-lg hover:bg-[#262c34] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Description */}
          {finding.description && (
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Description</label>
              <p className="text-sm text-[#c9d1d9] leading-relaxed">{finding.description}</p>
            </div>
          )}

          {/* Affected URL */}
          {finding.affected_url && (
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Affected URL</label>
              <code className="text-sm text-[#c9d1d9] bg-[#21262d] px-3 py-1.5 rounded-lg font-mono block break-all">
                {finding.affected_url}
              </code>
            </div>
          )}

          {/* Evidence */}
          {finding.evidence && (
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Evidence</label>
              <pre className="text-xs text-[#c9d1d9] bg-[#21262d] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
                {finding.evidence}
              </pre>
            </div>
          )}

          {/* Status + Severity controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PentestFinding["status"])}
                className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#1c2128] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as PentestFinding["severity"])}
                className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#1c2128] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Remediation Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5">Remediation Notes</label>
            <textarea
              value={remediationNotes}
              onChange={(e) => setRemediationNotes(e.target.value)}
              placeholder="Steps taken or planned for remediation..."
              rows={3}
              className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#1c2128] text-white placeholder:text-[#484f58] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          {/* Resolved info */}
          {finding.resolved_at && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Resolved {new Date(finding.resolved_at).toLocaleDateString()}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#262c34] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
