"use client";

import { useEffect, useState } from "react";
import type { SampleInfo } from "@/lib/types";
import { listSamples, getSample, listScenarios, generateLogs, type Scenario } from "@/lib/api";

export default function LogInput({
  value,
  onChange,
  onAnalyze,
  isLoading,
  skipIngest = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  skipIngest?: boolean;
}) {
  const [samples, setSamples] = useState<SampleInfo[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    listSamples()
      .then(setSamples)
      .catch(() => {});
    listScenarios()
      .then(setScenarios)
      .catch(() => {});
  }, []);

  const handleSampleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    try {
      const sample = await getSample(id);
      onChange(sample.content);
    } catch {
      /* ignore */
    }
  };

  const handleGenerate = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scenario = e.target.value;
    if (!scenario) return;
    e.target.value = "";
    setGenerating(true);
    try {
      const logs = await generateLogs(scenario, 50, 0.3);
      onChange(logs);
    } catch {
      /* ignore */
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-7 mb-5 bg-white border border-gray-200 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Paste Security Logs
      </label>
      <textarea
        className="w-full border border-gray-200 rounded-lg p-3 text-[13px] font-mono text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        rows={6}
        placeholder={"Paste security logs here, load a sample, or fetch from GCP Cloud Logging (Log Sources page)...\n\nExample:\n2026-02-19T04:14:58Z WARNING cloud_run_revision/archcelerate: GET /wp-admin/setup-config.php status=404 src=172.71.184.229"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <select
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          defaultValue=""
          onChange={handleSampleChange}
        >
          <option value="">Load Sample...</option>
          {samples.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {scenarios.length > 0 && (
          <select
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            defaultValue=""
            onChange={handleGenerate}
            disabled={generating}
          >
            <option value="">{generating ? "Generating..." : "Generate Attack..."}</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={onAnalyze}
          disabled={isLoading || !value.trim()}
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-7 py-2.5 text-sm transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing...
            </span>
          ) : (
            "Analyze Threats"
          )}
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-green-600 ml-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          PII auto-redacted
        </span>
        {skipIngest && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600 ml-1 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 font-medium">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
            GCP Pre-parsed (no ingest tokens)
          </span>
        )}
      </div>
    </div>
  );
}
