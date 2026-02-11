import type { ClassifiedThreat } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import ThreatTypeIcon from "./ThreatTypeIcon";

export default function ThreatsTable({
  threats,
}: {
  threats: ClassifiedThreat[];
}) {
  return (
    <div className="mx-7 mb-5">
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3.5 py-2 w-[200px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <span className="text-gray-400 text-[13px]">Search</span>
          </div>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-[#1a1a2e] text-white text-[13px] font-medium cursor-pointer">
              All findings
            </div>
            <div className="px-4 py-2 bg-white text-gray-500 text-[13px] font-medium border-l border-gray-200 cursor-pointer">
              AI refined
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer">
            <span className="text-[13px] text-gray-700">All types</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <div className="p-2.5 bg-white border border-gray-200 rounded-lg cursor-pointer flex">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer">
          <span className="text-[13px] text-gray-700">Actions</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left px-4 py-3.5 font-semibold text-gray-700 text-[13px] w-[50px]">Type</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-700 text-[13px]">Name</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-700 text-[13px]">Severity</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-700 text-[13px]">Location</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-700 text-[13px]">Confidence</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-700 text-[13px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {threats.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                  No findings yet. Paste logs and click <strong>Analyze Threats</strong> to start.
                </td>
              </tr>
            ) : (
              threats.map((ct) => <ThreatRow key={ct.threat_id} threat={ct} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThreatRow({ threat: ct }: { threat: ClassifiedThreat }) {
  const desc =
    ct.description.length > 90
      ? ct.description.slice(0, 90) + "..."
      : ct.description;

  const location = ct.affected_systems[0] || ct.source_ip || "N/A";
  const isValidator = ct.method === "validator_detected";

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3.5">
        <ThreatTypeIcon type={ct.type} />
      </td>
      <td className="px-4 py-3.5">
        <div className="font-medium text-[#1a1a2e] text-[13px]">
          {ct.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          {ct.mitre_technique && (
            <span className="text-gray-400 text-[11px] ml-1">({ct.mitre_technique})</span>
          )}
        </div>
        <div className="text-gray-500 text-xs mt-0.5">{desc}</div>
      </td>
      <td className="px-4 py-3.5">
        <SeverityBadge risk={ct.risk} />
      </td>
      <td className="px-4 py-3.5">
        {ct.affected_systems[0] ? (
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
            </svg>
            <span className="text-gray-700 text-[13px]">{location}</span>
          </div>
        ) : (
          <span className="text-gray-700 text-[13px]">{location}</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-[13px] text-gray-700">
        {Math.round(ct.confidence * 100)}%
      </td>
      <td className="px-4 py-3.5">
        {isValidator ? (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold text-purple-600 border border-purple-300 bg-purple-50">
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
