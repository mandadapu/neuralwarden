"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AnalysisResponse, ClassifiedThreat } from "@/lib/types";
import { analyze, resumeHitl } from "@/lib/api";

interface AnalysisContextType {
  isLoading: boolean;
  result: AnalysisResponse | null;
  error: string | null;
  logText: string;
  snoozedThreats: ClassifiedThreat[];
  ignoredThreats: ClassifiedThreat[];
  solvedThreats: ClassifiedThreat[];
  setLogText: (text: string) => void;
  runAnalysis: (logs: string) => Promise<void>;
  resume: (decision: "approve" | "reject", notes: string) => Promise<void>;
  updateThreat: (threatId: string, updates: { status?: string; risk?: string }) => void;
  snoozeThreat: (threatId: string) => void;
  ignoreThreat: (threatId: string) => void;
  solveThreat: (threatId: string) => void;
  restoreThreat: (threatId: string, from: "snoozed" | "ignored" | "solved") => void;
}

const AnalysisContext = createContext<AnalysisContextType | null>(null);

const STORAGE_KEY = "neuralwarden_analysis";

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [snoozedThreats, setSnoozedThreats] = useState<ClassifiedThreat[]>([]);
  const [ignoredThreats, setIgnoredThreats] = useState<ClassifiedThreat[]>([]);
  const [solvedThreats, setSolvedThreats] = useState<ClassifiedThreat[]>([]);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setResult(parsed.result ?? null);
        setLogText(parsed.logText ?? "");
        setSnoozedThreats(parsed.snoozedThreats ?? []);
        setIgnoredThreats(parsed.ignoredThreats ?? []);
        setSolvedThreats(parsed.solvedThreats ?? []);
      }
    } catch {}
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ result, logText, snoozedThreats, ignoredThreats, solvedThreats })
      );
    } catch {}
  }, [result, logText, snoozedThreats, ignoredThreats, solvedThreats]);

  const runAnalysis = useCallback(async (logs: string) => {
    setIsLoading(true);
    setError(null);
    setSnoozedThreats([]);
    setIgnoredThreats([]);
    setSolvedThreats([]);
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

  const moveThreat = useCallback(
    (threatId: string, destination: "snoozed" | "ignored" | "solved") => {
      setResult((prev) => {
        if (!prev) return prev;
        const threat = prev.classified_threats.find((ct) => ct.threat_id === threatId);
        if (!threat) return prev;
        const setter =
          destination === "snoozed" ? setSnoozedThreats :
          destination === "ignored" ? setIgnoredThreats : setSolvedThreats;
        setter((list) => [...list, threat]);
        return {
          ...prev,
          classified_threats: prev.classified_threats.filter((ct) => ct.threat_id !== threatId),
        };
      });
    },
    []
  );

  const snoozeThreat = useCallback((threatId: string) => moveThreat(threatId, "snoozed"), [moveThreat]);
  const ignoreThreat = useCallback((threatId: string) => moveThreat(threatId, "ignored"), [moveThreat]);
  const solveThreat = useCallback((threatId: string) => moveThreat(threatId, "solved"), [moveThreat]);

  const restoreThreat = useCallback((threatId: string, from: "snoozed" | "ignored" | "solved") => {
    const setter =
      from === "snoozed" ? setSnoozedThreats :
      from === "ignored" ? setIgnoredThreats : setSolvedThreats;
    let threat: ClassifiedThreat | undefined;
    setter((list) => {
      threat = list.find((ct) => ct.threat_id === threatId);
      return list.filter((ct) => ct.threat_id !== threatId);
    });
    if (threat) {
      const t = threat;
      setResult((prev) => {
        if (!prev) return prev;
        return { ...prev, classified_threats: [...prev.classified_threats, t] };
      });
    }
  }, []);

  return (
    <AnalysisContext.Provider
      value={{
        isLoading, result, error, logText, snoozedThreats, ignoredThreats, solvedThreats,
        setLogText, runAnalysis, resume, updateThreat, snoozeThreat, ignoreThreat, solveThreat, restoreThreat,
      }}
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
