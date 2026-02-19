"use client";

import { useState, useEffect } from "react";
import { updateCloud, deleteCloud } from "@/lib/api";
import type { CloudAccount } from "@/lib/types";

const PURPOSES = ["production", "staging", "development"];
const AVAILABLE_SERVICES = [
  { id: "cloud_logging", label: "Cloud Logging" },
  { id: "compute", label: "Compute Engine" },
  { id: "firewall", label: "Firewall Rules" },
  { id: "storage", label: "Cloud Storage" },
  { id: "resource_manager", label: "Resource Manager" },
];

interface CloudConfigModalProps {
  cloud: CloudAccount;
  open: boolean;
  onClose: () => void;
  onSave: (updated: CloudAccount) => void;
  onDelete: () => void;
}

export default function CloudConfigModal({ cloud, open, onClose, onSave, onDelete }: CloudConfigModalProps) {
  const [name, setName] = useState(cloud.name);
  const [purpose, setPurpose] = useState(cloud.purpose);
  const [credentials, setCredentials] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [showCredentials, setShowCredentials] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when cloud changes or modal opens
  useEffect(() => {
    if (open) {
      setName(cloud.name);
      setPurpose(cloud.purpose);
      setCredentials("");
      setShowCredentials(false);
      setError(null);
      setConfirmDelete(false);
      // Parse services
      const svc = typeof cloud.services === "string"
        ? JSON.parse(cloud.services)
        : cloud.services;
      setServices(Array.isArray(svc) ? svc : ["cloud_logging"]);
    }
  }, [open, cloud]);

  if (!open) return null;

  function toggleService(id: string) {
    if (id === "cloud_logging") return; // always enabled
    setServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updates: Record<string, unknown> = { name, purpose, services };
      if (credentials.trim()) {
        // Validate JSON
        try {
          JSON.parse(credentials);
        } catch {
          setError("Invalid JSON in credentials field");
          setSaving(false);
          return;
        }
        updates.credentials_json = credentials.trim();
      }
      const updated = await updateCloud(cloud.id, updates as Parameters<typeof updateCloud>[1]);
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
      await deleteCloud(cloud.id);
      onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cloud");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Configure Cloud</h2>
              <p className="text-sm text-gray-500 mt-0.5">Update credentials, services, and cloud settings.</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cloud Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Purpose</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Service Account Credentials */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Account Credentials</label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-gray-600">Connected &middot; {cloud.project_id}</span>
            </div>
            {!showCredentials ? (
              <button
                onClick={() => setShowCredentials(true)}
                className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Update credentials
              </button>
            ) : (
              <div>
                <textarea
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                  placeholder="Paste new service account JSON key..."
                  rows={6}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Leave empty to keep existing credentials.</p>
              </div>
            )}
          </div>

          {/* Services */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Scan Services</label>
            <p className="text-xs text-gray-400 mb-2">Select which GCP services to scan. Cloud Logging is always enabled.</p>
            <div className="space-y-2">
              {AVAILABLE_SERVICES.map((svc) => {
                const checked = services.includes(svc.id);
                const isRequired = svc.id === "cloud_logging";
                return (
                  <label
                    key={svc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "border-primary/30 bg-primary/5"
                        : "border-gray-200 hover:bg-gray-50"
                    } ${isRequired ? "opacity-80" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isRequired}
                      onChange={() => toggleService(svc.id)}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary/20"
                    />
                    <span className="text-sm text-gray-700">{svc.label}</span>
                    {isRequired && (
                      <span className="text-[10px] text-gray-400 font-medium uppercase">Required</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              confirmDelete
                ? "bg-red-600 text-white hover:bg-red-700"
                : "text-red-600 border border-red-200 hover:bg-red-50"
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
            {confirmDelete ? "Confirm Delete" : "Delete Cloud"}
          </button>

          {/* Cancel + Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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
    </div>
  );
}
