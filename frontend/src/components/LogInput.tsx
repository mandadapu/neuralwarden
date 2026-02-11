"use client";

import { useEffect, useState } from "react";
import type { SampleInfo } from "@/lib/types";
import { listSamples, getSample } from "@/lib/api";

export default function LogInput({
  value,
  onChange,
  onAnalyze,
  isLoading,
}: {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  isLoading: boolean;
}) {
  const [samples, setSamples] = useState<SampleInfo[]>([]);

  useEffect(() => {
    listSamples()
      .then(setSamples)
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

  return (
    <div className="mx-7 mb-5 bg-white border border-gray-200 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Paste Security Logs
      </label>
      <textarea
        className="w-full border border-gray-200 rounded-lg p-3 text-[13px] font-mono text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        rows={6}
        placeholder="Paste security logs here or load a sample scenario..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-center gap-3 mt-3">
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
      </div>
    </div>
  );
}
