"use client";

export interface StageProgress {
  stage: string;
  status: "pending" | "running" | "complete";
  elapsed_s?: number;
  cost_usd?: number;
}

const STAGE_LABELS: Record<string, string> = {
  ingest: "Ingest",
  detect: "Detect",
  validate: "Validate",
  classify: "Classify",
  report: "Report",
};

export default function PipelineProgress({
  stages,
}: {
  stages: StageProgress[];
}) {
  if (!stages.length) return null;

  return (
    <div className="mx-7 mb-5 bg-white border border-gray-200 rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        {stages.map((s, i) => (
          <div key={s.stage} className="flex items-center flex-1 last:flex-none">
            {/* Stage node */}
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  s.status === "complete"
                    ? "bg-primary text-white"
                    : s.status === "running"
                    ? "bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 animate-pulse"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {s.status === "complete" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`mt-1.5 text-[11px] font-medium ${
                  s.status === "complete"
                    ? "text-primary"
                    : s.status === "running"
                    ? "text-primary"
                    : "text-gray-400"
                }`}
              >
                {STAGE_LABELS[s.stage] ?? s.stage}
              </span>
              {s.status === "complete" && s.elapsed_s !== undefined && (
                <span className="text-[10px] text-gray-400">
                  {s.elapsed_s.toFixed(1)}s
                  {s.cost_usd ? ` / $${s.cost_usd.toFixed(4)}` : ""}
                </span>
              )}
            </div>
            {/* Connector line */}
            {i < stages.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 transition-all duration-300 ${
                  s.status === "complete" ? "bg-primary" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
