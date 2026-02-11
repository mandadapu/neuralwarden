import type { Summary } from "@/lib/types";
import { SEVERITY_COLORS } from "@/lib/constants";

export default function SummaryCards({ summary }: { summary: Summary | null }) {
  const s = summary ?? {
    total_threats: 0,
    severity_counts: { critical: 0, high: 0, medium: 0, low: 0 },
    auto_ignored: 0,
    total_logs: 0,
    logs_cleared: 0,
  };

  const total = s.total_threats;
  const barSegments = Object.entries(s.severity_counts).filter(([, v]) => v > 0);

  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-7 py-5">
      {/* Open Issues */}
      <div className="bg-white rounded-xl p-5 border border-gray-200">
        {/* Severity bar */}
        <div className="flex h-2 rounded overflow-hidden bg-gray-100 mb-3.5">
          {total > 0 &&
            barSegments.map(([level, count]) => (
              <div
                key={level}
                style={{
                  width: `${(count / total) * 100}%`,
                  background: SEVERITY_COLORS[level],
                }}
              />
            ))}
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold text-[#1a1a2e]">{total}</span>
          <span className="text-sm text-gray-500">Open Issues</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {barSegments.map(([level, count]) => (
            <span key={level} className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: SEVERITY_COLORS[level] }}
              />
              <span className="text-xs text-gray-500">{count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Auto Ignored */}
      <StatCard
        dotColor="#f59e0b"
        label="Auto Ignored"
        value={s.auto_ignored}
        sub={`${s.logs_cleared} logs cleared`}
      />

      {/* New */}
      <StatCard
        dotColor="#3b82f6"
        label="New"
        value={total}
        sub="detected this session"
      />

      {/* Solved */}
      <StatCard
        dotColor="#22c55e"
        label="Solved"
        value={0}
        sub="in last 7 days"
      />
    </div>
  );
}

function StatCard({
  dotColor,
  label,
  value,
  sub,
}: {
  dotColor: string;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
          style={{ background: dotColor + "22" }}
        >
          <div className="w-[9px] h-[9px] rounded-full" style={{ background: dotColor }} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-3xl font-bold text-[#1a1a2e]">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{sub}</div>
    </div>
  );
}
