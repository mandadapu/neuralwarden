import type { AgentMetrics } from "@/lib/types";

export default function CostBreakdown({
  agentMetrics,
  pipelineTime,
}: {
  agentMetrics: Record<string, AgentMetrics>;
  pipelineTime: number;
}) {
  const entries = Object.entries(agentMetrics);
  if (entries.length === 0) return null;

  const totalCost = entries.reduce((sum, [, m]) => sum + m.cost_usd, 0);

  return (
    <div className="mx-7 my-4 p-5 bg-white rounded-xl border border-gray-200 text-[13px]">
      <div className="flex items-center gap-1.5 font-semibold text-green-800 mb-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        Cost Breakdown
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
        {entries.map(([name, m]) => (
          <div key={name} className="p-2.5 bg-green-50 rounded-lg">
            <div className="font-semibold text-gray-700 text-xs">{name}</div>
            <div className="text-green-800 font-bold">${m.cost_usd.toFixed(4)}</div>
            <div className="text-gray-400 text-[11px]">{m.latency_ms.toFixed(0)}ms</div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 font-bold text-green-800">
        Total: ${totalCost.toFixed(4)} in {pipelineTime.toFixed(1)}s
      </div>
    </div>
  );
}
