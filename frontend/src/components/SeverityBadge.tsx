import { SEVERITY_COLORS } from "@/lib/constants";

export default function SeverityBadge({ risk }: { risk: string }) {
  const color = SEVERITY_COLORS[risk] ?? "#6b7280";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      <span className="font-semibold text-[13px]" style={{ color }}>
        {risk.charAt(0).toUpperCase() + risk.slice(1)}
      </span>
    </span>
  );
}
