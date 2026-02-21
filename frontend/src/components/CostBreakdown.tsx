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

  const totalCost = entries.reduce((sum, [, m]) => sum + (m.cost_usd ?? 0), 0);

  return (
    <div className="mx-7 my-4 p-5 bg-[#1c2128] rounded-xl border border-[#30363d] text-[13px]">
      <div className="flex items-center gap-1.5 font-semibold text-[#00e68a] mb-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        Cost Breakdown
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
        {entries.map(([name, m]) => (
          <div key={name} className="p-2.5 bg-[#21262d] rounded-lg">
            <div className="font-semibold text-[#e6edf3] text-xs">{name}</div>
            <div className="text-[#00e68a] font-bold">${(m.cost_usd ?? 0).toFixed(4)}</div>
            <div className="text-[#8b949e] text-[11px]">{(m.latency_ms ?? 0).toFixed(0)}ms</div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-[#30363d] font-bold text-[#00e68a]">
        Total: ${totalCost.toFixed(4)} in {(pipelineTime ?? 0).toFixed(1)}s
      </div>
    </div>
  );
}
