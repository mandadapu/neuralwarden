"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { ClassifiedThreat } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import ThreatTypeIcon from "./ThreatTypeIcon";
import { THREAT_TAXONOMY, getTypeLabel, TYPE_TO_CATEGORY } from "@/lib/taxonomy";

export default function ThreatsTable({
  threats,
  onThreatClick,
}: {
  threats: ClassifiedThreat[];
  onThreatClick?: (threat: ClassifiedThreat, index: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "ai">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typesOpen, setTypesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const typesRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (typesRef.current && !typesRef.current.contains(e.target as Node)) {
        setTypesOpen(false);
      }
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Build category-grouped types from current threats
  const activeTypes = useMemo(() => {
    const typeIds = new Set(threats.map((t) => t.type));
    return THREAT_TAXONOMY.map((cat) => ({
      ...cat,
      types: cat.types.filter((t) => typeIds.has(t.id)),
    })).filter((cat) => cat.types.length > 0);
  }, [threats]);

  // Also include any types not in taxonomy
  const unmappedTypes = useMemo(() => {
    const knownIds = new Set(THREAT_TAXONOMY.flatMap((c) => c.types.map((t) => t.id)));
    return Array.from(new Set(threats.map((t) => t.type))).filter((id) => !knownIds.has(id)).sort();
  }, [threats]);

  const filtered = useMemo(
    () =>
      threats.filter((t) => {
        if (sourceFilter === "ai" && t.method === "rule_based") return false;
        if (typeFilter !== "all" && t.type !== typeFilter) return false;
        if (severityFilter !== "all" && t.risk !== severityFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            ![t.type, t.description, t.affected_systems[0] ?? "", t.mitre_technique].some((f) =>
              f.toLowerCase().includes(q),
            )
          )
            return false;
        }
        return true;
      }),
    [threats, search, sourceFilter, typeFilter, severityFilter],
  );

  const severityOptions = ["all", "critical", "high", "medium", "low", "informational"] as const;

  return (
    <div className="mx-7 mb-5">
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 bg-[#1c2128] border border-[#30363d] rounded-lg px-3.5 py-2 w-[200px]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-[#e6edf3] text-[13px] outline-none w-full placeholder-[#8b949e]"
            />
          </div>

          {/* Source toggle */}
          <div className="flex border border-[#30363d] rounded-lg overflow-hidden">
            <button
              onClick={() => setSourceFilter("all")}
              className={`px-4 py-2 text-[13px] font-medium cursor-pointer ${
                sourceFilter === "all"
                  ? "bg-[#00e68a] text-[#0d1117]"
                  : "bg-[#1c2128] text-[#8b949e]"
              }`}
            >
              All findings
            </button>
            <button
              onClick={() => setSourceFilter("ai")}
              className={`px-4 py-2 text-[13px] font-medium border-l border-[#30363d] cursor-pointer ${
                sourceFilter === "ai"
                  ? "bg-[#00e68a] text-[#0d1117]"
                  : "bg-[#1c2128] text-[#8b949e]"
              }`}
            >
              AI refined
            </button>
          </div>

          {/* Types dropdown */}
          <div className="relative" ref={typesRef}>
            <button
              onClick={() => setTypesOpen(!typesOpen)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1c2128] border border-[#30363d] rounded-lg cursor-pointer"
            >
              <span className="text-[13px] text-[#e6edf3]">
                {typeFilter === "all" ? "All types" : getTypeLabel(typeFilter)}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {typesOpen && (
              <div className="absolute top-full left-0 mt-1 bg-[#1c2128] border border-[#30363d] rounded-lg shadow-lg z-20 min-w-[220px] py-1 max-h-[320px] overflow-y-auto">
                <button
                  onClick={() => { setTypeFilter("all"); setTypesOpen(false); }}
                  className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-[#21262d] cursor-pointer ${
                    typeFilter === "all" ? "text-[#00e68a]" : "text-[#e6edf3]"
                  }`}
                >
                  All types
                </button>
                {activeTypes.map((cat) => (
                  <div key={cat.id}>
                    <div className="px-3.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8b949e]">
                      {cat.label}
                    </div>
                    {cat.types.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => { setTypeFilter(t.id); setTypesOpen(false); }}
                        className={`w-full text-left px-5 py-1.5 text-[13px] hover:bg-[#21262d] cursor-pointer ${
                          typeFilter === t.id ? "text-[#00e68a]" : "text-[#e6edf3]"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                ))}
                {unmappedTypes.map((id) => (
                  <button
                    key={id}
                    onClick={() => { setTypeFilter(id); setTypesOpen(false); }}
                    className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-[#21262d] cursor-pointer ${
                      typeFilter === id ? "text-[#00e68a]" : "text-[#e6edf3]"
                    }`}
                  >
                    {getTypeLabel(id)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Severity filter */}
          <div className="relative" ref={filtersRef}>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="p-2.5 bg-[#1c2128] border border-[#30363d] rounded-lg cursor-pointer flex items-center gap-1"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {severityFilter !== "all" && (
                <span className="w-2 h-2 rounded-full bg-[#00e68a]" />
              )}
            </button>
            {filtersOpen && (
              <div className="absolute top-full right-0 mt-1 bg-[#1c2128] border border-[#30363d] rounded-lg shadow-lg z-20 min-w-[140px] py-1">
                {severityOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setSeverityFilter(opt); setFiltersOpen(false); }}
                    className={`w-full text-left px-3.5 py-2 text-[13px] hover:bg-[#21262d] cursor-pointer capitalize ${
                      severityFilter === opt ? "text-[#00e68a]" : "text-[#e6edf3]"
                    }`}
                  >
                    {opt === "all" ? "All" : opt}
                  </button>
                ))}
              </div>
            )}
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
                  No findings yet. Connect a cloud and run a scan.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#8b949e] text-sm">
                  No findings match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((ct, index) => (
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
          {getTypeLabel(ct.type)}
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
