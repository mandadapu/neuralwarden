"use client";

import { useState } from "react";
import type { PendingThreat } from "@/lib/types";

export default function HitlReviewPanel({
  threats,
  onResume,
  isLoading,
}: {
  threats: PendingThreat[];
  onResume: (decision: "approve" | "reject", notes: string) => void;
  isLoading: boolean;
}) {
  const [notes, setNotes] = useState("");

  if (threats.length === 0) return null;

  return (
    <div className="mx-7 my-4 p-5 bg-red-50 border-2 border-red-600 rounded-xl">
      <div className="flex items-center gap-2 text-red-600 font-bold text-base mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        CRITICAL: {threats.length} threats require human review
      </div>

      <div className="space-y-2 mb-4">
        {threats.map((pt) => (
          <div
            key={pt.threat_id}
            className="p-3 bg-white rounded-lg border border-red-300"
          >
            <div className="font-semibold text-red-900">
              {pt.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
            <div className="text-sm text-gray-700 mt-1">{pt.description}</div>
            <div className="text-xs text-gray-500 mt-1">
              IP: {pt.source_ip || "N/A"} | MITRE: {pt.mitre_technique || "N/A"} | Score:{" "}
              {pt.risk_score.toFixed(1)}/10
            </div>
            <div className="text-xs text-emerald-600 mt-1">
              Suggested: {pt.suggested_action}
            </div>
          </div>
        ))}
      </div>

      <textarea
        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 mb-3"
        rows={2}
        placeholder="Optional reviewer notes..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="flex gap-3">
        <button
          onClick={() => onResume("approve", notes)}
          disabled={isLoading}
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-colors"
        >
          Approve All
        </button>
        <button
          onClick={() => onResume("reject", notes)}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2 text-sm transition-colors"
        >
          Reject All
        </button>
      </div>
    </div>
  );
}
