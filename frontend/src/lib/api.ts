import type { AnalysisResponse, SampleInfo, SampleContent } from "./types";

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
