"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCloud } from "@/lib/api";
import type { CloudAccount } from "@/lib/types";

const SERVICES = [
  { id: "cloud_logging", label: "Cloud Logging" },
  { id: "compute_engine", label: "Compute Engine" },
  { id: "cloud_storage", label: "Cloud Storage" },
  { id: "cloud_sql", label: "Cloud SQL" },
  { id: "iam", label: "IAM" },
  { id: "firewall_rules", label: "Firewall Rules" },
];

const PURPOSES = ["production", "staging", "development"];

type WizardData = {
  provider: string;
  projectId: string;
  credentialsJson: string;
  name: string;
  purpose: string;
  services: string[];
};

export default function ConnectCloudPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    provider: "",
    projectId: "",
    credentialsJson: "",
    name: "GCP Production",
    purpose: "production",
    services: SERVICES.map((s) => s.id),
  });
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdCloud, setCreatedCloud] = useState<CloudAccount | null>(null);

  function selectProvider(provider: string) {
    setData((d) => ({ ...d, provider }));
    setStep(2);
  }

  function validateCredentials(): boolean {
    setJsonError(null);
    if (!data.projectId.trim()) {
      setJsonError("Project ID is required.");
      return false;
    }
    if (!data.credentialsJson.trim()) {
      setJsonError("Service account key is required.");
      return false;
    }
    try {
      const parsed = JSON.parse(data.credentialsJson);
      if (parsed.type !== "service_account") {
        setJsonError('Invalid key: "type" must be "service_account".');
        return false;
      }
    } catch {
      setJsonError("Invalid JSON format. Please paste valid JSON.");
      return false;
    }
    return true;
  }

  function handleNext() {
    if (step === 2) {
      if (!validateCredentials()) return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const cloud = await createCloud({
        name: data.name,
        project_id: data.projectId,
        purpose: data.purpose,
        credentials_json: data.credentialsJson,
        services: data.services,
      });
      setCreatedCloud(cloud);
      setStep(5); // success step
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to create cloud");
    } finally {
      setSaving(false);
    }
  }

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setData((d) => ({ ...d, credentialsJson: text }));
      };
      reader.readAsText(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setData((d) => ({ ...d, credentialsJson: text }));
      };
      reader.readAsText(file);
    }
  }, []);

  function toggleService(id: string) {
    setData((d) => ({
      ...d,
      services: d.services.includes(id) ? d.services.filter((s) => s !== id) : [...d.services, id],
    }));
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="w-80 min-w-80 bg-[#0d1117] text-white flex flex-col justify-between p-8">
        <div>
          <Link href="/clouds" className="flex items-center gap-2 mb-10 text-[#8b949e] hover:text-white text-sm transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Clouds
          </Link>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00e68a]/20 to-[#009952]/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className="text-lg font-bold">NeuralWarden</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Connect your cloud</h2>
          <p className="text-sm text-[#8b949e] leading-relaxed">
            NeuralWarden will scan your cloud infrastructure for security misconfigurations, vulnerabilities, and compliance issues.
          </p>

          {/* Step indicators */}
          <div className="mt-10 space-y-4">
            {[
              { n: 1, label: "Choose Provider" },
              { n: 2, label: "Authentication" },
              { n: 3, label: "Configure" },
              { n: 4, label: "Save" },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step > n || step === 5
                      ? "bg-emerald-500 text-white"
                      : step === n
                        ? "bg-primary text-white"
                        : "bg-white/10 text-[#8b949e]"
                  }`}
                >
                  {step > n || step === 5 ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    n
                  )}
                </div>
                <span className={`text-sm ${step >= n ? "text-white" : "text-[#8b949e]"}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#c9d1d9]">Your credentials are encrypted and stored securely.</p>
      </div>

      {/* Right panel — content */}
      <div className="flex-1 bg-[#1c2128] flex items-start justify-center p-10 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Step 1: Choose Provider */}
          {step === 1 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Choose your cloud provider</h3>
              <p className="text-sm text-[#8b949e] mb-8">Select the cloud platform you want to connect.</p>
              <div className="space-y-3">
                <button
                  onClick={() => selectProvider("gcp")}
                  className="w-full flex items-center gap-4 p-5 border-2 border-[#30363d] rounded-xl hover:border-primary hover:bg-primary/5 transition-all text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#00e68a]/10 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#4285F4" opacity="0.2" stroke="#4285F4" strokeWidth="1.5" />
                      <path d="M12 8v8M8 12h8" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-white">Google Cloud Platform</div>
                    <div className="text-sm text-[#8b949e]">Connect your GCP project for security scanning</div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2" className="ml-auto">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                <div className="w-full flex items-center gap-4 p-5 border-2 border-[#262c34] rounded-xl bg-[#21262d] opacity-60 cursor-not-allowed">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#FF9900" opacity="0.2" stroke="#FF9900" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-[#8b949e]">Amazon Web Services</div>
                    <div className="text-sm text-[#8b949e]">Connect your AWS account</div>
                  </div>
                  <span className="ml-auto px-2.5 py-1 bg-[#30363d] text-[#8b949e] text-xs font-semibold rounded-full">Coming Soon</span>
                </div>

                <div className="w-full flex items-center gap-4 p-5 border-2 border-[#262c34] rounded-xl bg-[#21262d] opacity-60 cursor-not-allowed">
                  <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#0078D4" opacity="0.2" stroke="#0078D4" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-[#8b949e]">Microsoft Azure</div>
                    <div className="text-sm text-[#8b949e]">Connect your Azure subscription</div>
                  </div>
                  <span className="ml-auto px-2.5 py-1 bg-[#30363d] text-[#8b949e] text-xs font-semibold rounded-full">Coming Soon</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Authentication */}
          {step === 2 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Authentication</h3>
              <p className="text-sm text-[#8b949e] mb-8">Provide your GCP credentials for NeuralWarden to scan your infrastructure.</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">GCP Project ID</label>
                  <input
                    type="text"
                    value={data.projectId}
                    onChange={(e) => setData((d) => ({ ...d, projectId: e.target.value }))}
                    placeholder="my-project-123"
                    className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Service Account Key (JSON)</label>
                  <div
                    onDrop={handleFileDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-[#30363d] rounded-lg p-6 text-center hover:border-primary/40 transition-colors"
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5" className="mx-auto mb-2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    <p className="text-sm text-[#8b949e] mb-2">Drag and drop your JSON key file here</p>
                    <label className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#262c34] text-[#c9d1d9] text-sm font-medium rounded-lg cursor-pointer hover:bg-[#30363d] transition-colors">
                      Browse Files
                      <input type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
                    </label>
                  </div>
                  <div className="my-3 flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#30363d]" />
                    <span className="text-xs text-[#8b949e]">or paste JSON below</span>
                    <div className="flex-1 h-px bg-[#30363d]" />
                  </div>
                  <textarea
                    value={data.credentialsJson}
                    onChange={(e) => {
                      setData((d) => ({ ...d, credentialsJson: e.target.value }));
                      setJsonError(null);
                    }}
                    placeholder='{"type": "service_account", "project_id": "...", ...}'
                    rows={6}
                    className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm font-mono bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>

                {jsonError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M15 9l-6 6M9 9l6 6" />
                    </svg>
                    {jsonError}
                  </div>
                )}
              </div>

              <div className="flex justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="px-5 py-2.5 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configure */}
          {step === 3 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Configure</h3>
              <p className="text-sm text-[#8b949e] mb-8">Name your cloud and select which services to scan.</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Cloud Name</label>
                  <input
                    type="text"
                    value={data.name}
                    onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
                    placeholder="GCP Production"
                    className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm bg-[#21262d] text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-1.5">Purpose</label>
                  <select
                    value={data.purpose}
                    onChange={(e) => setData((d) => ({ ...d, purpose: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-[#30363d] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-[#21262d] text-white"
                  >
                    {PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#e6edf3] mb-3">Services to scan</label>
                  <div className="space-y-2.5">
                    {SERVICES.map((svc) => (
                      <label
                        key={svc.id}
                        className="flex items-center gap-3 p-3 border border-[#30363d] rounded-lg hover:bg-[#21262d] cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={data.services.includes(svc.id)}
                          onChange={() => toggleService(svc.id)}
                          className="w-4 h-4 text-primary border-[#30363d] rounded focus:ring-primary"
                        />
                        <span className="text-sm text-[#e6edf3]">{svc.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <button
                  onClick={handleBack}
                  className="px-5 py-2.5 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review & Save */}
          {step === 4 && (
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Review & Save</h3>
              <p className="text-sm text-[#8b949e] mb-8">Review your configuration and connect your cloud.</p>

              <div className="bg-[#21262d] rounded-xl p-5 space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Provider</span>
                  <span className="text-sm font-medium text-white uppercase">{data.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Project ID</span>
                  <code className="text-sm font-mono text-white">{data.projectId}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Name</span>
                  <span className="text-sm font-medium text-white">{data.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Purpose</span>
                  <span className="text-sm font-medium text-white capitalize">{data.purpose}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-[#8b949e]">Services</span>
                  <div className="flex flex-wrap gap-1.5 justify-end max-w-xs">
                    {data.services.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
                        {SERVICES.find((svc) => svc.id === s)?.label ?? s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#8b949e]">Credentials</span>
                  <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Provided
                  </span>
                </div>
              </div>

              {saveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                  {saveError}
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={handleBack}
                  className="px-5 py-2.5 text-sm font-medium text-[#c9d1d9] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {saving ? "Connecting..." : "Connect Cloud"}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && createdCloud && (
            <div className="text-center py-10">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Cloud Connected!</h3>
              <p className="text-[#8b949e] mb-2">
                <span className="font-medium text-white">{createdCloud.name}</span> has been successfully connected.
              </p>
              <p className="text-sm text-[#8b949e] mb-8">
                Run a scan to discover assets and check for security issues.
              </p>

              {/* Success animation dots */}
              <div className="flex items-center justify-center gap-2 mb-8">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-emerald-400"
                    style={{
                      animation: `bounce 0.6s ${i * 0.1}s ease-in-out infinite alternate`,
                    }}
                  />
                ))}
              </div>
              <style>{`@keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-8px); } }`}</style>

              <button
                onClick={() => router.push(`/clouds/${createdCloud.id}`)}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
              >
                Go to Cloud
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
