"use client";

import { useState } from "react";
import PageShell from "@/components/PageShell";
import PipelineFlowDiagram from "@/components/PipelineFlowDiagram";

interface Agent {
  name: string;
  model: string;
  role: string;
  status: "Ready" | "Beta";
  group: string;
}

const AGENTS: Agent[] = [
  // Cloud Scan Super Agent (runs first)
  { name: "Discovery", model: "\u2014", role: "Enumerates GCP assets across Compute, Storage, Firewall, SQL, and IAM", status: "Ready", group: "Cloud Scan Super Agent" },
  { name: "Router", model: "\u2014", role: "Inspects asset metadata to route public assets to active scan, private to log analysis", status: "Ready", group: "Cloud Scan Super Agent" },
  { name: "Active Scanner", model: "\u2014", role: "Runs compliance checks on public-facing assets for open ports, public buckets, default SAs", status: "Ready", group: "Cloud Scan Super Agent" },
  { name: "Log Analyzer", model: "\u2014", role: "Queries Cloud Logging for behavioral signals on private resources", status: "Ready", group: "Cloud Scan Super Agent" },
  { name: "Correlation Engine", model: "\u2014", role: "Cross-references scanner findings with log activity to surface active exploits", status: "Ready", group: "Cloud Scan Super Agent" },
  { name: "Remediation Generator", model: "\u2014", role: "Generates parameterized gcloud remediation scripts from scan findings", status: "Ready", group: "Cloud Scan Super Agent" },
  // Threat Pipeline (fed by Cloud Scan)
  { name: "Ingest", model: "Haiku 4.5", role: "Parses raw logs into structured entries with timestamp, source, and severity extraction", status: "Ready", group: "Threat Pipeline" },
  { name: "Detect", model: "Sonnet 4.5", role: "Rule-based pattern matching plus AI-powered novel threat detection across 5 categories", status: "Ready", group: "Threat Pipeline" },
  { name: "Validate", model: "Haiku 4.5", role: "Shadow validation on 5% sample of clean logs to catch false negatives", status: "Ready", group: "Threat Pipeline" },
  { name: "Classify", model: "Sonnet 4.5", role: "Risk scoring with MITRE ATT&CK mapping and correlation-aware severity escalation", status: "Ready", group: "Threat Pipeline" },
  { name: "HITL Gate", model: "\u2014", role: "Human-in-the-loop checkpoint for critical threats before report generation", status: "Ready", group: "Threat Pipeline" },
  { name: "Report", model: "Haiku 4.5", role: "Generates dual-audience incident reports with executive summary and action plans", status: "Ready", group: "Threat Pipeline" },
];

const GROUP_META: Record<string, { description: string; color: string }> = {
  "Threat Pipeline": {
    description: "6-agent LLM pipeline for log analysis and incident reporting",
    color: "#2563eb",
  },
  "Cloud Scan Super Agent": {
    description: "6-agent deterministic pipeline for GCP scanning and correlation",
    color: "#7c3aed",
  },
};

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const groupColor = GROUP_META[agent.group]?.color ?? "#2563eb";

  return (
    <div className="group bg-[#1c2128] rounded-2xl border border-[#30363d]/80 p-5 flex flex-col justify-between hover:shadow-md hover:border-[#30363d] transition-all duration-200 min-h-[170px]">
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-lg text-white text-xs font-bold flex items-center justify-center shrink-0"
              style={{ background: groupColor }}
            >
              {index}
            </span>
            <h3 className="font-semibold text-white text-[15px] leading-tight">{agent.name}</h3>
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
            agent.status === "Ready"
              ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
              : "bg-amber-50 text-amber-600 border border-amber-200"
          }`}>
            {agent.status}
          </span>
        </div>
        <p className="text-[13px] text-[#8b949e] leading-relaxed">{agent.role}</p>
      </div>
      <div className="mt-4 pt-3 border-t border-[#262c34] flex items-center justify-between">
        <span className="text-[11px] font-mono text-[#8b949e]">{agent.model}</span>
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: groupColor }}
        />
      </div>
    </div>
  );
}

function AgentGroup({
  group,
  agents,
  startIndex,
}: {
  group: string;
  agents: Agent[];
  startIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const meta = GROUP_META[group];

  return (
    <div className="rounded-2xl border border-[#30363d]/60 bg-[#1c2128]/50 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#21262d]/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span
            className="w-1.5 h-8 rounded-full"
            style={{ background: meta?.color ?? "#2563eb" }}
          />
          <div className="text-left">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8b949e]">
              {agents.length} Agents
            </span>
            <h2 className="text-base font-bold text-white -mt-0.5">{group}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {meta?.description && (
            <span className="text-xs text-[#8b949e] hidden md:block">{meta.description}</span>
          )}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[#8b949e] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Card grid */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-5 transition-all duration-300 ease-in-out ${
          open ? "pb-5 pt-1 opacity-100 max-h-[2000px]" : "max-h-0 opacity-0 overflow-hidden pb-0 pt-0"
        }`}
      >
        {agents.map((agent, i) => (
          <AgentCard key={agent.name} agent={agent} index={startIndex + i + 1} />
        ))}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const groups = [...new Set(AGENTS.map((a) => a.group))];
  let index = 0;

  return (
    <PageShell
      title="Agents"
      description={`${AGENTS.length} AI agents powering the security analysis pipeline`}
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        </svg>
      }
    >
      <div className="mt-6 space-y-5">
        <PipelineFlowDiagram />
        {groups.map((group) => {
          const groupAgents = AGENTS.filter((a) => a.group === group);
          const startIndex = index;
          index += groupAgents.length;
          return <AgentGroup key={group} group={group} agents={groupAgents} startIndex={startIndex} />;
        })}
      </div>
    </PageShell>
  );
}
