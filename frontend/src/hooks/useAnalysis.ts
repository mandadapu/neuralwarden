"use client";

import { useState, useCallback } from "react";
import type { AnalysisResponse } from "@/lib/types";
import { analyze, resumeHitl } from "@/lib/api";

export function useAnalysis() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async (logs: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await analyze(logs);
      if (data.status === "error") {
        setError(data.error ?? "Unknown error");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resume = useCallback(
    async (decision: "approve" | "reject", notes: string) => {
      if (!result?.thread_id) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await resumeHitl(result.thread_id, decision, notes);
        if (data.status === "error") {
          setError(data.error ?? "Unknown error");
        }
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [result?.thread_id]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { isLoading, result, error, runAnalysis, resume, reset };
}
