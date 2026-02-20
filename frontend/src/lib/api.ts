import type {
  AnalysisResponse,
  ReportSummary,
  SampleInfo,
  SampleContent,
  CloudAccount,
  CloudAsset,
  CloudIssue,
  CloudCheck,
  ScanResult,
  ScanStreamEvent,
  ScanLog,
  ScanLogListItem,
} from "./types";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000/api`
    : "/api");

// User email is set by AnalysisContext after session loads
let _userEmail = "";
export function setApiUserEmail(email: string) {
  _userEmail = email;
}
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (_userEmail) h["X-User-Email"] = _userEmail;
  return h;
}

export async function analyze(logs: string): Promise<AnalysisResponse> {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ logs }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${res.statusText}`);
  return res.json();
}

export async function resumeHitl(
  threadId: string,
  decision: "approve" | "reject",
  notes: string
): Promise<AnalysisResponse> {
  const res = await fetch(`${BASE}/hitl/${threadId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) throw new Error(`HITL resume failed: ${res.statusText}`);
  return res.json();
}

export async function listSamples(): Promise<SampleInfo[]> {
  const res = await fetch(`${BASE}/samples`);
  if (!res.ok) throw new Error(`Failed to list samples: ${res.statusText}`);
  const data = await res.json();
  return data.samples;
}

export async function getSample(id: string): Promise<SampleContent> {
  const res = await fetch(`${BASE}/samples/${id}`);
  if (!res.ok) throw new Error(`Failed to load sample: ${res.statusText}`);
  return res.json();
}

// --- Streaming analysis ---

export type StreamEvent = {
  event: string;
  stage?: string;
  agent_index?: number;
  total_agents?: number;
  elapsed_s?: number;
  cost_usd?: number;
  latency_ms?: number;
  response?: AnalysisResponse;
  error?: string;
};

export async function analyzeStream(
  logs: string,
  onEvent: (event: StreamEvent) => void,
  skipIngest = false
): Promise<void> {
  const res = await fetch(`${BASE}/analyze/stream`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ logs, skip_ingest: skipIngest }),
  });
  if (!res.ok) throw new Error(`Stream failed: ${res.statusText}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE data lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          onEvent(data);
        } catch {
          // skip unparseable lines
        }
      }
    }
  }
}

// --- Report history ---

export async function listReports(limit = 50): Promise<ReportSummary[]> {
  const res = await fetch(`${BASE}/reports?limit=${limit}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list reports: ${res.statusText}`);
  const data = await res.json();
  return data.reports;
}

export async function getReport(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/reports/${id}`);
  if (!res.ok) throw new Error(`Failed to load report: ${res.statusText}`);
  return res.json();
}

export async function getLatestReport(): Promise<AnalysisResponse | null> {
  const res = await fetch(`${BASE}/reports/latest`, { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.status) return null;
  return data as AnalysisResponse;
}

// --- Attack generator ---

export interface Scenario {
  id: string;
  name: string;
  description: string;
}

export async function listScenarios(): Promise<Scenario[]> {
  const res = await fetch(`${BASE}/scenarios`);
  if (!res.ok) throw new Error(`Failed to list scenarios: ${res.statusText}`);
  const data = await res.json();
  return data.scenarios;
}

export async function generateLogs(
  scenario: string,
  count = 50,
  noiseRatio = 0.3
): Promise<string> {
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario, count, noise_ratio: noiseRatio }),
  });
  if (!res.ok) throw new Error(`Failed to generate logs: ${res.statusText}`);
  const data = await res.json();
  return data.logs;
}

// --- GCP Cloud Logging ---

export interface GcpStatus {
  available: boolean;
  credentials_set: boolean;
  project_id: string | null;
}

export interface GcpFetchResult {
  logs: string;
  entry_count: number;
  project_id: string;
}

export async function getGcpStatus(): Promise<GcpStatus> {
  const res = await fetch(`${BASE}/gcp-logging/status`);
  if (!res.ok) throw new Error(`GCP status check failed: ${res.statusText}`);
  return res.json();
}

export async function fetchGcpLogs(
  projectId: string,
  logFilter: string,
  maxEntries: number,
  hoursBack: number
): Promise<GcpFetchResult> {
  const res = await fetch(`${BASE}/gcp-logging/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      log_filter: logFilter,
      max_entries: maxEntries,
      hours_back: hoursBack,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `GCP fetch failed: ${res.statusText}`);
  }
  return res.json();
}

// --- Cloud Monitoring ---

export async function listClouds(): Promise<CloudAccount[]> {
  const res = await fetch(`${BASE}/clouds`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to list clouds: ${res.statusText}`);
  return res.json();
}

export async function createCloud(cloud: {
  name: string;
  project_id: string;
  purpose?: string;
  credentials_json?: string;
  services?: string[];
}): Promise<CloudAccount> {
  const res = await fetch(`${BASE}/clouds`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(cloud),
  });
  if (!res.ok) throw new Error(`Failed to create cloud: ${res.statusText}`);
  return res.json();
}

export async function getCloud(id: string): Promise<CloudAccount> {
  const res = await fetch(`${BASE}/clouds/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to get cloud: ${res.statusText}`);
  return res.json();
}

export async function updateCloud(
  id: string,
  updates: Partial<Pick<CloudAccount, "name" | "purpose" | "services">> & { credentials_json?: string }
): Promise<CloudAccount> {
  const res = await fetch(`${BASE}/clouds/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update cloud: ${res.statusText}`);
  return res.json();
}

export async function deleteCloud(id: string): Promise<void> {
  const res = await fetch(`${BASE}/clouds/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete cloud: ${res.statusText}`);
}

export interface ProbeResult {
  services: Record<string, { accessible: boolean; detail: string }>;
  accessible: string[];
  error?: string;
}

export async function probeCloudAccess(id: string): Promise<ProbeResult> {
  const res = await fetch(`${BASE}/clouds/${id}/probe`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Probe failed: ${res.statusText}`);
  return res.json();
}

export async function scanCloud(id: string): Promise<ScanResult> {
  const res = await fetch(`${BASE}/clouds/${id}/scan`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Scan failed: ${res.statusText}`);
  return res.json();
}

export async function scanCloudStream(
  cloudId: string,
  onEvent: (event: ScanStreamEvent) => void
): Promise<void> {
  const res = await fetch(`${BASE}/clouds/${cloudId}/scan`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Scan failed: ${res.statusText}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          onEvent(data);
        } catch {
          // skip unparseable lines
        }
      }
    }
  }
}

export async function listAllCloudIssues(
  status?: string,
  severity?: string
): Promise<CloudIssue[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  const res = await fetch(`${BASE}/clouds/all-issues?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list all issues: ${res.statusText}`);
  return res.json();
}

export async function listCloudIssues(
  cloudId: string,
  status?: string,
  severity?: string
): Promise<CloudIssue[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  const res = await fetch(`${BASE}/clouds/${cloudId}/issues?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list issues: ${res.statusText}`);
  return res.json();
}

export async function updateIssueStatus(
  issueId: string,
  status: string
): Promise<void> {
  const res = await fetch(`${BASE}/clouds/issues/${issueId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update issue: ${res.statusText}`);
}

export async function listCloudAssets(
  cloudId: string,
  assetType?: string
): Promise<CloudAsset[]> {
  const params = new URLSearchParams();
  if (assetType) params.set("asset_type", assetType);
  const res = await fetch(`${BASE}/clouds/${cloudId}/assets?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list assets: ${res.statusText}`);
  return res.json();
}

export async function listCloudChecks(
  category?: string
): Promise<CloudCheck[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const res = await fetch(`${BASE}/clouds/checks?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list checks: ${res.statusText}`);
  return res.json();
}

// --- Scan Logs ---

export async function listScanLogs(
  cloudId: string,
  limit = 20
): Promise<ScanLogListItem[]> {
  const res = await fetch(`${BASE}/clouds/${cloudId}/scan-logs?limit=${limit}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list scan logs: ${res.statusText}`);
  return res.json();
}

export async function getScanLog(
  cloudId: string,
  logId: string
): Promise<ScanLog> {
  const res = await fetch(`${BASE}/clouds/${cloudId}/scan-logs/${logId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get scan log: ${res.statusText}`);
  return res.json();
}
