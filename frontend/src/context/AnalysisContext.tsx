"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AnalysisResponse } from "@/lib/types";
import { analyze, resumeHitl } from "@/lib/api";

interface AnalysisContextType {
  isLoading: boolean;
  result: AnalysisResponse | null;
  error: string | null;
  logText: string;
  setLogText: (text: string) => void;
  runAnalysis: (logs: string) => Promise<void>;
  resume: (decision: "approve" | "reject", notes: string) => Promise<void>;
  updateThreat: (threatId: string, updates: { status?: string; risk?: string }) => void;
  removeThreat: (threatId: string) => void;
}

const AnalysisContext = createContext<AnalysisContextType | null>(null);

const STORAGE_KEY = "neuralwarden_analysis";

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logText, setLogText] = useState("");

  // Load persisted state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setResult(parsed.result ?? null);
        setLogText(parsed.logText ?? "");
      }
    } catch {}
  }, []);

  // Persist on change
  useEffect(() => {
    if (result) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ result, logText }));
      } catch {}
    }
  }, [result, logText]);

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

  const updateThreat = useCallback((threatId: string, updates: { status?: string; risk?: string }) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        classified_threats: prev.classified_threats.map((ct) =>
          ct.threat_id === threatId ? { ...ct, ...updates } : ct
        ),
      };
    });
  }, []);

  const removeThreat = useCallback((threatId: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        classified_threats: prev.classified_threats.filter((ct) => ct.threat_id !== threatId),
      };
    });
  }, []);

  return (
    <AnalysisContext.Provider
      value={{ isLoading, result, error, logText, setLogText, runAnalysis, resume, updateThreat, removeThreat }}
    >
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysisContext() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysisContext must be used within AnalysisProvider");
  return ctx;
}
