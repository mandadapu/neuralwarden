"use client";

import { useState, useEffect } from "react";
import { updateRepoConnection, deleteRepoConnection, toggleRepoConnection } from "@/lib/api";
import type { RepoConnection } from "@/lib/types";

const PURPOSES = ["production", "staging", "development"];

const SCAN_TYPES = [
  { id: "secrets_detection", label: "Secrets Detection" },
  { id: "dependency_scanning", label: "Dependency Scanning" },
  { id: "code_patterns", label: "Code Patterns" },
];

interface ScanConfig {
  secrets_detection?: boolean;
  dependency_scanning?: boolean;
  code_patterns?: boolean;
  [key: string]: boolean | undefined;
}

function parseScanConfig(json: string): ScanConfig {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

interface RepoConfigModalProps {
  connection: RepoConnection;
  open: boolean;
  onClose: () => void;
  onSave: (updated: RepoConnection) => void;
  onDelete: () => void;
}

export default function RepoConfigModal({ connection, open, onClose, onSave, onDelete }: RepoConfigModalProps) {
  const [name, setName] = useState(connection.name);
  const [purpose, setPurpose] = useState(connection.purpose);
  const [scanConfig, setScanConfig] = useState<ScanConfig>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const isDisabled = connection.status === "disabled";

  // Reset form when connection changes or modal opens
  useEffect(() => {
    if (open) {
      setName(connection.name);
      setPurpose(connection.purpose);
      setScanConfig(parseScanConfig(connection.scan_config));
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, connection]);

  if (!open) return null;

  function toggleScanType(id: string) {
    setScanConfig((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updates = {
        name,
        purpose,
        scan_config: JSON.stringify(scanConfig),
      };
      const updated = await updateRepoConnection(connection.id, updates);
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteRepoConnection(connection.id);
      onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete connection");
    } finally {
      setDeleting(false);
    }
  }

  async function handleEnable() {
    setEnabling(true);
    setError(null);
    try {
      const updated = await toggleRepoConnection(connection.id);
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable connection");
    } finally {
      setEnabling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#1c2128] rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#262c34]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Configure Connection</h2>
              <p className="text-sm text-[#8b949e] mt-0.5">Update scan settings and connection configuration.</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] rounded-lg hover:bg-[#262c34] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {isDisabled && (
            <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-950/20 text-yellow-400 text-sm flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M4.93 4.93l14.14 14.14" />
              </svg>
              This connection is disabled. Enable it to make changes.
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Connection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isDisabled}
              className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Organization */}
          <div>
            <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Organization</label>
            <div className="flex items-center gap-2 p-3 bg-[#21262d] rounded-lg">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-[#c9d1d9]">Connected &middot; {connection.org_name}</span>
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Purpose</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              disabled={isDisabled}
              className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#1c2128] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Scan Types */}
          <div>
            <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Scan Types</label>
            <p className="text-xs text-[#8b949e] mb-2">Select which scan types to run when scanning repositories.</p>
            <div className="space-y-2">
              {SCAN_TYPES.map((st) => {
                const checked = !!scanConfig[st.id];
                return (
                  <label
                    key={st.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    } ${
                      checked
                        ? "border-primary/30 bg-primary/5"
                        : "border-[#30363d] hover:bg-[#21262d]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isDisabled}
                      onChange={() => toggleScanType(st.id)}
                      className="w-4 h-4 text-primary rounded border-[#30363d] focus:ring-primary/20"
                    />
                    <span className="text-sm text-[#e6edf3]">{st.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#262c34] flex items-center justify-between">
          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              confirmDelete
                ? "bg-red-600 text-white hover:bg-red-700"
                : "text-red-400 border border-red-500/30 hover:bg-red-950/30"
            } disabled:opacity-50`}
          >
            {deleting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            )}
            {confirmDelete ? "Confirm Delete" : "Delete Connection"}
          </button>

          {/* Cancel + Save / Enable */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
            >
              Cancel
            </button>
            {isDisabled ? (
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {enabling && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {enabling ? "Enabling..." : "Enable Connection"}
              </button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
