import type { AnalysisResponse, ReportSummary, SampleInfo, SampleContent } from "./types";

const BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000/api`
    : "/api";

export async function analyze(logs: string): Promise<AnalysisResponse> {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const res = await fetch(`${BASE}/analyze/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ logs }),
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
  const res = await fetch(`${BASE}/reports?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to list reports: ${res.statusText}`);
  const data = await res.json();
  return data.reports;
}

export async function getReport(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/reports/${id}`);
  if (!res.ok) throw new Error(`Failed to load report: ${res.statusText}`);
  return res.json();
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
