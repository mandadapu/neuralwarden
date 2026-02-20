"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AnalysisResponse, ClassifiedThreat } from "@/lib/types";
import type { StageProgress } from "@/components/PipelineProgress";
import { useSession } from "next-auth/react";
import { analyzeStream, type StreamEvent, getLatestReport, resumeHitl, setApiUserEmail } from "@/lib/api";

interface AnalysisContextType {
  isLoading: boolean;
  result: AnalysisResponse | null;
  error: string | null;
  logText: string;
  skipIngest: boolean;
  autoAnalyze: boolean;
  pipelineProgress: StageProgress[];
  snoozedThreats: ClassifiedThreat[];
  ignoredThreats: ClassifiedThreat[];
  solvedThreats: ClassifiedThreat[];
  setLogText: (text: string) => void;
  setSkipIngest: (skip: boolean) => void;
  setAutoAnalyze: (auto: boolean) => void;
  runAnalysis: (logs: string) => Promise<void>;
  resume: (decision: "approve" | "reject", notes: string) => Promise<void>;
  updateThreat: (threatId: string, updates: { status?: string; risk?: string }) => void;
  snoozeThreat: (threatId: string) => void;
  ignoreThreat: (threatId: string) => void;
  solveThreat: (threatId: string) => void;
  /** Add an external threat (e.g. cloud issue) directly to a destination list. */
  addThreatTo: (threat: ClassifiedThreat, destination: "snoozed" | "ignored" | "solved") => void;
  restoreThreat: (threatId: string, from: "snoozed" | "ignored" | "solved") => void;
  loadLatestReport: () => Promise<void>;
}

const AnalysisContext = createContext<AnalysisContextType | null>(null);

const STORAGE_KEY = "neuralwarden_analysis";

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [skipIngest, setSkipIngest] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<StageProgress[]>([]);
  const [snoozedThreats, setSnoozedThreats] = useState<ClassifiedThreat[]>([]);
  const [ignoredThreats, setIgnoredThreats] = useState<ClassifiedThreat[]>([]);
  const [solvedThreats, setSolvedThreats] = useState<ClassifiedThreat[]>([]);

  // Set API user email whenever session changes
  useEffect(() => {
    setApiUserEmail(session?.user?.email ?? "");
  }, [session?.user?.email]);

  // Restore local-only state (snoozed/ignored/solved lists) from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSnoozedThreats(parsed.snoozedThreats ?? []);
        setIgnoredThreats(parsed.ignoredThreats ?? []);
        setSolvedThreats(parsed.solvedThreats ?? []);
      }
    } catch {}
  }, []);

  // Load latest analysis from server
  const loadLatestReport = useCallback(async () => {
    try {
      const data = await getLatestReport();
      if (data) setResult(data);
    } catch {}
  }, []);

  // Load latest analysis from server once user session is available
  useEffect(() => {
    if (!session?.user?.email) return;
    setApiUserEmail(session.user.email);
    loadLatestReport();
  }, [session?.user?.email, loadLatestReport]);

  // Persist local-only state (result loads from server, logText no longer needed)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ snoozedThreats, ignoredThreats, solvedThreats })
      );
    } catch {}
  }, [snoozedThreats, ignoredThreats, solvedThreats]);

  const STAGES = ["ingest", "detect", "validate", "classify", "report"];

  const runAnalysis = useCallback(async (logs: string) => {
    setIsLoading(true);
    setError(null);
    setSnoozedThreats([]);
    setIgnoredThreats([]);
    setSolvedThreats([]);
    setPipelineProgress(STAGES.map((s) => ({ stage: s, status: "pending" as const })));
    try {
      await analyzeStream(logs, (event: StreamEvent) => {
        if (event.event === "agent_start") {
          setPipelineProgress((prev) =>
            prev.map((s) =>
              s.stage === event.stage ? { ...s, status: "running" } : s
            )
          );
        } else if (event.event === "agent_complete") {
          setPipelineProgress((prev) =>
            prev.map((s) =>
              s.stage === event.stage
                ? { ...s, status: "complete", elapsed_s: event.elapsed_s, cost_usd: event.cost_usd }
                : s
            )
          );
        } else if (event.event === "complete" || event.event === "hitl_required") {
          const data = event.response as AnalysisResponse;
          if (data.status === "error") {
            setError(data.error ?? "Unknown error");
          }
          setResult(data);
          // Mark all stages complete
          setPipelineProgress((prev) =>
            prev.map((s) => (s.status !== "complete" ? { ...s, status: "complete" as const } : s))
          );
        } else if (event.event === "error") {
          setError(event.error ?? "Pipeline error");
        }
      }, skipIngest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setSkipIngest(false);
    }
  }, [skipIngest]);

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
          ct.threat_id === threatId ? { ...ct, ...updates } as typeof ct : ct
        ),
      };
    });
  }, []);

  const moveThreat = useCallback(
    (threatId: string, destination: "snoozed" | "ignored" | "solved") => {
      const setter =
        destination === "snoozed" ? setSnoozedThreats :
        destination === "ignored" ? setIgnoredThreats : setSolvedThreats;

      setResult((prev) => {
        if (!prev) return prev;
        const threat = prev.classified_threats.find((ct) => ct.threat_id === threatId);
        if (!threat) return prev;
        // Use functional update with dedup check, separate from setResult
        setter((list) =>
          list.some((ct) => ct.threat_id === threatId) ? list : [...list, threat]
        );
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

  const addThreatTo = useCallback((threat: ClassifiedThreat, destination: "snoozed" | "ignored" | "solved") => {
    const setter =
      destination === "snoozed" ? setSnoozedThreats :
      destination === "ignored" ? setIgnoredThreats : setSolvedThreats;
    setter((list) =>
      list.some((ct) => ct.threat_id === threat.threat_id) ? list : [...list, threat]
    );
  }, []);

  const restoreThreat = useCallback((threatId: string, from: "snoozed" | "ignored" | "solved") => {
    const setter =
      from === "snoozed" ? setSnoozedThreats :
      from === "ignored" ? setIgnoredThreats : setSolvedThreats;

    setter((list) => {
      const threat = list.find((ct) => ct.threat_id === threatId);
      if (threat) {
        setResult((prev) => {
          if (!prev) return prev;
          if (prev.classified_threats.some((ct) => ct.threat_id === threatId)) return prev;
          return { ...prev, classified_threats: [...prev.classified_threats, threat] };
        });
      }
      return list.filter((ct) => ct.threat_id !== threatId);
    });
  }, []);

  return (
    <AnalysisContext.Provider
      value={{
        isLoading, result, error, logText, skipIngest, autoAnalyze, pipelineProgress, snoozedThreats, ignoredThreats, solvedThreats,
        setLogText, setSkipIngest, setAutoAnalyze, runAnalysis, resume, updateThreat, snoozeThreat, ignoreThreat, solveThreat, addThreatTo, restoreThreat, loadLatestReport,
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
