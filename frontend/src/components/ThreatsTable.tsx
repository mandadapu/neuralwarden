import type { ClassifiedThreat } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import ThreatTypeIcon from "./ThreatTypeIcon";

export default function ThreatsTable({
  threats,
  onThreatClick,
}: {
  threats: ClassifiedThreat[];
  onThreatClick?: (threat: ClassifiedThreat, index: number) => void;
}) {
  return (
    <div className="mx-7 mb-5">
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1c2128] border border-[#30363d] rounded-lg px-3.5 py-2 w-[200px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className="text-[#8b949e] text-[13px]">Search</span>
          </div>
          <div className="flex border border-[#30363d] rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-[#00e68a] text-[#0d1117] text-[13px] font-medium cursor-pointer">
              All findings
            </div>
            <div className="px-4 py-2 bg-[#1c2128] text-[#8b949e] text-[13px] font-medium border-l border-[#30363d] cursor-pointer">
              AI refined
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1c2128] border border-[#30363d] rounded-lg cursor-pointer">
            <span className="text-[13px] text-[#e6edf3]">All types</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <div className="p-2.5 bg-[#1c2128] border border-[#30363d] rounded-lg cursor-pointer flex">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1c2128] border border-[#30363d] rounded-lg cursor-pointer">
          <span className="text-[13px] text-[#e6edf3]">Actions</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1c2128] rounded-xl border border-[#30363d] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-[#30363d]">
              <th className="text-left px-4 py-3.5 font-semibold text-[#8b949e] text-[13px] w-[50px]">Type</th>
              <th className="text-left px-4 py-3.5 font-semibold text-[#8b949e] text-[13px]">Name</th>
              <th className="text-left px-4 py-3.5 font-semibold text-[#8b949e] text-[13px]">Severity</th>
              <th className="text-left px-4 py-3.5 font-semibold text-[#8b949e] text-[13px]">Location</th>
              <th className="text-left px-4 py-3.5 font-semibold text-[#8b949e] text-[13px]">Confidence</th>
              <th className="text-left px-4 py-3.5 font-semibold text-[#8b949e] text-[13px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {threats.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#8b949e] text-sm">
                  No findings yet. Paste logs and click <strong className="text-[#00e68a]">Analyze Threats</strong> to start.
                </td>
              </tr>
            ) : (
              threats.map((ct, index) => (
                <ThreatRow key={ct.threat_id} threat={ct} onClick={() => onThreatClick?.(ct, index)} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThreatRow({ threat: ct, onClick }: { threat: ClassifiedThreat; onClick?: () => void }) {
  const desc =
    ct.description.length > 90
      ? ct.description.slice(0, 90) + "..."
      : ct.description;

  const location = ct.affected_systems[0] || ct.source_ip || "N/A";
  const isValidator = ct.method === "validator_detected";

  return (
    <tr className="border-b border-[#262c34] hover:bg-[#21262d] transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3.5">
        <ThreatTypeIcon type={ct.type} />
      </td>
      <td className="px-4 py-3.5">
        <div className="font-medium text-white text-[13px]">
          {ct.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          {ct.mitre_technique && (
            <span className="text-[#8b949e] text-[11px] ml-1">({ct.mitre_technique})</span>
          )}
        </div>
        <div className="text-[#8b949e] text-xs mt-0.5">{desc}</div>
      </td>
      <td className="px-4 py-3.5">
        <SeverityBadge risk={ct.risk} />
      </td>
      <td className="px-4 py-3.5">
        {ct.affected_systems[0] ? (
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
            </svg>
            <span className="text-[#e6edf3] text-[13px]">{location}</span>
          </div>
        ) : (
          <span className="text-[#e6edf3] text-[13px]">{location}</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-[13px] text-[#e6edf3]">
        {Math.round(ct.confidence * 100)}%
      </td>
      <td className="px-4 py-3.5">
        {isValidator ? (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 border border-blue-300 bg-blue-50">
            Validator
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 border border-blue-300 bg-blue-50">
            New
          </span>
        )}
      </td>
    </tr>
  );
}
