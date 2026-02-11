"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ClassifiedThreat } from "@/lib/types";
import { SEVERITY_COLORS } from "@/lib/constants";
import SeverityBadge from "./SeverityBadge";
import SeverityGauge from "./SeverityGauge";
import ThreatTypeIcon from "./ThreatTypeIcon";
import { getRemediation } from "@/lib/remediation";

interface ThreatDetailPanelProps {
  threat: ClassifiedThreat;
  threats: ClassifiedThreat[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onAction?: (threatId: string, action: string) => void;
}

type Tab = "overview" | "activity" | "tasks";

export default function ThreatDetailPanel({
  threat,
  threats,
  currentIndex,
  onClose,
  onNavigate,
  onAction,
}: ThreatDetailPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [severityOpen, setSeverityOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsVisible(true));
    });
  }, []);

  // Reset tab on threat change
  useEffect(() => {
    setActiveTab("overview");
    setActionsOpen(false);
    setSeverityOpen(false);
  }, [threat.threat_id]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
        setSeverityOpen(false);
      }
    };
    if (actionsOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionsOpen]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (actionsOpen) {
          setActionsOpen(false);
          setSeverityOpen(false);
        } else {
          handleClose();
        }
      }
      if (e.key === "ArrowLeft" && currentIndex > 0 && !actionsOpen) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < threats.length - 1 && !actionsOpen) onNavigate(currentIndex + 1);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, threats.length, handleClose, onNavigate, actionsOpen]);

  const ct = threat;
  const typeName = ct.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const methodLabel = ct.method === "rule_based" ? "Rule Based" : ct.method === "ai_detected" ? "AI Detected" : "Validator";
  const remediation = getRemediation(ct.type, ct.risk);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Threat detail: ${typeName}`}
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)] border-l border-gray-200 z-50 flex flex-col transition-transform duration-300 ease-in-out ${isVisible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              aria-label="Close panel"
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="cursor-pointer">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </div>

          {/* Actions dropdown */}
          <div className="relative" ref={actionsRef}>
            <button
              onClick={() => { setActionsOpen(!actionsOpen); setSeverityOpen(false); }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0f172a] text-white text-[13px] font-medium rounded-lg hover:bg-[#1e293b] transition-colors"
            >
              Actions
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {actionsOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-60 py-1 overflow-hidden">
                <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  Actions
                </div>
                <ActionItem
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  }
                  label="Scan again"
                  onClick={() => { setActionsOpen(false); }}
                />
                <ActionItem
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                  }
                  label="Snooze"
                  onClick={() => { onAction?.(ct.threat_id, "snooze"); setActionsOpen(false); }}
                />
                <ActionItem
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  }
                  label="Ignore"
                  onClick={() => { onAction?.(ct.threat_id, "ignore"); setActionsOpen(false); }}
                />
                <div className="relative">
                  <ActionItem
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    }
                    label="Adjust severity"
                    hasSubmenu
                    onClick={() => setSeverityOpen(!severityOpen)}
                  />
                  {severityOpen && (
                    <div className="absolute left-full top-0 ml-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                      {(["critical", "high", "medium", "low"] as const).map((level) => (
                        <button
                          key={level}
                          onClick={() => {
                            onAction?.(ct.threat_id, `adjust_${level}`);
                            setActionsOpen(false);
                            setSeverityOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors ${ct.risk === level ? "font-semibold" : ""}`}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: SEVERITY_COLORS[level] }}
                          />
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                          {ct.risk === level && <span className="text-xs text-gray-400 ml-auto">current</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Threat identity */}
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <ThreatTypeIcon type={ct.type} />
                <h2 className="text-base font-bold text-[#1a1a2e]">{typeName}</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge risk={ct.risk} />
                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  {methodLabel}
                </span>
                {ct.mitre_technique && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    {ct.mitre_technique}
                  </span>
                )}
              </div>
            </div>
            <SeverityGauge score={ct.risk_score} risk={ct.risk} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5">
          {(["overview", "activity", "tasks"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-[13px] font-medium transition-colors relative ${
                activeTab === tab
                  ? "text-primary font-semibold"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "overview" ? (
            <div className="px-5">
              {/* TL;DR */}
              <div className="py-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">TL;DR</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{ct.description}</p>
              </div>

              {/* Business Impact */}
              <div className="py-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Business Impact</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {ct.business_impact || <span className="italic text-gray-400">No business impact assessment available</span>}
                </p>
              </div>

              {/* MITRE ATT&CK */}
              {(ct.mitre_technique || ct.mitre_tactic) && (
                <div className="py-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">MITRE ATT&CK</h3>
                  <div className="space-y-1.5">
                    {ct.mitre_technique && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Technique:</span>
                        <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{ct.mitre_technique}</span>
                      </div>
                    )}
                    {ct.mitre_tactic && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Tactic:</span>
                        <span className="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">{ct.mitre_tactic}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* How do I fix it? */}
              <div className="py-4 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">How do I fix it?</h3>
                <ol className="space-y-2.5">
                  {remediation.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Affected Systems */}
              {ct.affected_systems.length > 0 && (
                <div className="py-4 border-b border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Affected Systems</h3>
                  <div className="flex flex-wrap gap-2">
                    {ct.affected_systems.map((sys, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg text-xs text-gray-700 border border-gray-200"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="8" rx="2" />
                          <rect x="2" y="14" width="20" height="8" rx="2" />
                        </svg>
                        {sys}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Details */}
              <div className="py-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Source Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <DetailItem label="Source IP" value={ct.source_ip || "N/A"} />
                  <DetailItem label="Detection" value={methodLabel} />
                  <DetailItem label="Confidence" value={`${Math.round(ct.confidence * 100)}%`} />
                  <DetailItem label="Priority" value={`#${ct.remediation_priority}`} />
                </div>
                {ct.source_log_indices.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs text-gray-500">Log lines: </span>
                    <span className="font-mono text-xs text-gray-600">
                      {ct.source_log_indices.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-sm">Coming soon</span>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="border-t border-gray-200 bg-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              aria-label="Previous threat"
              className={`p-1.5 rounded-md border border-gray-200 transition-colors ${currentIndex === 0 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={currentIndex === threats.length - 1}
              aria-label="Next threat"
              className={`p-1.5 rounded-md border border-gray-200 transition-colors ${currentIndex === threats.length - 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
          <span className="text-xs text-gray-500">
            Threat {currentIndex + 1} of {threats.length}
          </span>
        </div>
      </div>
    </>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
  hasSubmenu,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  hasSubmenu?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
    >
      <span className="text-gray-400">{icon}</span>
      {label}
      {hasSubmenu && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="ml-auto">
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm text-gray-700 font-medium">{value}</div>
    </div>
  );
}
