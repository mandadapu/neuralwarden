"use client";

import { useEffect } from "react";
import type { RepoScanStreamEvent } from "@/lib/types";

/* ── Pipeline node definitions ─────────────────────────── */

interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  type?: "start" | "end";
}

interface FlowEdge {
  from: string;
  to: string;
}

const PURPLE = "#7c3aed";
const TEAL = "#0d9488";
const ROSE = "#e11d48";
const BLUE = "#2563eb";
const SLATE = "#64748b";
const GREEN = "#00e68a";

const NODES: FlowNode[] = [
  { id: "r-github",  label: "GitHub",   x: 60,  y: 40, color: SLATE,  type: "start" },
  { id: "r-clone",   label: "Clone",    x: 200, y: 40, color: PURPLE },
  { id: "r-secrets", label: "Secrets",  x: 340, y: 40, color: ROSE },
  { id: "r-sca",     label: "SCA",      x: 480, y: 40, color: TEAL },
  { id: "r-sast",    label: "SAST",     x: 620, y: 40, color: BLUE },
  { id: "r-license", label: "License",  x: 760, y: 40, color: PURPLE },
  { id: "r-done",    label: "Complete", x: 900, y: 40, color: GREEN, type: "end" },
];

const EDGES: FlowEdge[] = [
  { from: "r-github",  to: "r-clone" },
  { from: "r-clone",   to: "r-secrets" },
  { from: "r-secrets", to: "r-sca" },
  { from: "r-sca",     to: "r-sast" },
  { from: "r-sast",    to: "r-license" },
  { from: "r-license", to: "r-done" },
];

/* ── Scanner stage → node state mapping ────────────────── */

type NodeStatus = "pending" | "active" | "completed" | "error";

// Maps scanner_stage value to the set of completed/active nodes
const STAGE_ORDER: { stage: string; completed: string[]; active: string[] }[] = [
  { stage: "cloning",  completed: ["r-github"],                                                     active: ["r-clone"] },
  { stage: "secrets",  completed: ["r-github", "r-clone"],                                          active: ["r-secrets"] },
  { stage: "sca",      completed: ["r-github", "r-clone", "r-secrets"],                             active: ["r-sca"] },
  { stage: "sast",     completed: ["r-github", "r-clone", "r-secrets", "r-sca"],                    active: ["r-sast"] },
  { stage: "license",  completed: ["r-github", "r-clone", "r-secrets", "r-sca", "r-sast"],         active: ["r-license"] },
];

function deriveRepoNodeStates(
  progress: RepoScanStreamEvent | null,
  scanning: boolean
): Record<string, NodeStatus> {
  const states: Record<string, NodeStatus> = {};
  for (const node of NODES) states[node.id] = "pending";

  if (!scanning && !progress) return states;

  const event = progress?.event ?? "";

  if (event === "error") {
    states["r-github"] = "completed";
    // Mark nodes up to the current stage as completed, current as error
    const stage = progress?.scanner_stage ?? "";
    const match = STAGE_ORDER.find((s) => s.stage === stage);
    if (match) {
      for (const id of match.completed) states[id] = "completed";
      for (const id of match.active) states[id] = "error";
    }
    return states;
  }

  if (event === "complete") {
    for (const node of NODES) states[node.id] = "completed";
    return states;
  }

  if (event === "scanning") {
    const stage = progress?.scanner_stage ?? "";
    const match = STAGE_ORDER.find((s) => s.stage === stage);
    if (match) {
      for (const id of match.completed) states[id] = "completed";
      for (const id of match.active) states[id] = "active";
      return states;
    }
    // No scanner_stage yet — just show GitHub as active
    states["r-github"] = "active";
    return states;
  }

  if (event === "starting") {
    states["r-github"] = "active";
    return states;
  }

  // Scan started but no event yet
  if (scanning) {
    states["r-github"] = "active";
  }

  return states;
}

/* ── SVG rendering ─────────────────────────────────────── */

const NODE_W = 110;
const NODE_H = 36;
const NODE_RX = 10;

function NodeRect({ node, status }: { node: FlowNode; status: NodeStatus }) {
  const isSpecial = node.type === "start" || node.type === "end";

  const isCompleted = status === "completed";
  const isActive = status === "active";
  const isError = status === "error";

  const fillColor = isCompleted ? node.color : isActive ? node.color : "#1c2128";
  const fillOpacity = isCompleted ? 1 : isActive ? 0.2 : 1;
  const strokeColor = isCompleted || isActive ? node.color : "#30363d";
  const labelColor = isCompleted ? "white" : isActive ? node.color : isError ? "#f87171" : "#8b949e";

  return (
    <g>
      {/* Active pulse glow */}
      {isActive && (
        <rect
          x={node.x - NODE_W / 2 - 4}
          y={node.y - NODE_H / 2 - 4}
          width={NODE_W + 8}
          height={NODE_H + 8}
          rx={NODE_RX + 3}
          fill="none"
          stroke={node.color}
          strokeWidth="2"
          opacity="0.4"
        >
          <animate attributeName="opacity" values="0.4;0.15;0.4" dur="1.5s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Error glow */}
      {isError && (
        <rect
          x={node.x - NODE_W / 2 - 4}
          y={node.y - NODE_H / 2 - 4}
          width={NODE_W + 8}
          height={NODE_H + 8}
          rx={NODE_RX + 3}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          opacity="0.5"
        />
      )}

      {/* Node shape */}
      <rect
        x={node.x - NODE_W / 2}
        y={node.y - NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={isSpecial ? NODE_H / 2 : NODE_RX}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={isError ? "#ef4444" : strokeColor}
        strokeWidth={isActive || isCompleted ? 2 : 1.5}
      />

      {/* Completed checkmark */}
      {isCompleted && (
        <g transform={`translate(${node.x + NODE_W / 2 - 14}, ${node.y - NODE_H / 2 - 4})`}>
          <circle cx="6" cy="6" r="6" fill={GREEN} />
          <polyline points="3 6 5.5 8.5 9 4" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Active spinner */}
      {isActive && (
        <g transform={`translate(${node.x - NODE_W / 2 + 4}, ${node.y - NODE_H / 2 - 4})`}>
          <circle cx="6" cy="6" r="5" fill="#1c2128" stroke={node.color} strokeWidth="1.5" />
          <circle cx="6" cy="6" r="3" fill="none" stroke={node.color} strokeWidth="1.5" strokeDasharray="5 5" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 6 6" to="360 6 6" dur="1s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Label */}
      <text
        x={node.x}
        y={node.y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={labelColor}
        fontSize="11"
        fontWeight={isActive || isCompleted ? "700" : "600"}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        {node.label}
      </text>
    </g>
  );
}

function EdgeArrow({ edge, nodeStates }: { edge: FlowEdge; nodeStates: Record<string, NodeStatus> }) {
  const from = NODES.find((n) => n.id === edge.from)!;
  const to = NODES.find((n) => n.id === edge.to)!;

  const x1 = from.x + NODE_W / 2;
  const y1 = from.y;
  const x2 = to.x - NODE_W / 2;
  const y2 = to.y;

  const path = `M ${x1} ${y1} L ${x2} ${y2}`;

  const fromDone = nodeStates[edge.from] === "completed";
  const toDone = nodeStates[edge.to] === "completed" || nodeStates[edge.to] === "active";
  const edgeColor = fromDone && toDone ? GREEN : "#30363d";

  return (
    <path
      d={path}
      fill="none"
      stroke={edgeColor}
      strokeWidth="1.5"
      markerEnd={`url(#repo-arrow-${fromDone && toDone ? "green" : "gray"})`}
    />
  );
}

/* ── Status helpers ────────────────────────────────────── */

const STAGE_LABELS: Record<string, string> = {
  cloning: "Cloning repository...",
  secrets: "Scanning for secrets...",
  sca: "Running SCA analysis...",
  sast: "Running SAST analysis...",
  license: "Checking licenses...",
};

function getStatusDetail(progress: RepoScanStreamEvent | null, scanning: boolean): string | null {
  if (!progress && scanning) return "Initializing scan...";
  if (!progress) return null;

  switch (progress.event) {
    case "starting":
      return "Initializing scan...";
    case "scanning": {
      const stage = progress.scanner_stage ?? "";
      const stageLabel = STAGE_LABELS[stage] ?? "Processing...";
      const repo = progress.current_repo ?? "";
      const scanned = progress.repos_scanned ?? 0;
      const total = progress.total_repos ?? 0;
      return `${repo} (${scanned}/${total}) — ${stageLabel}`;
    }
    case "complete":
      return `${progress.repo_count ?? progress.total_repos ?? 0} repos scanned, ${progress.issue_count ?? 0} issues found`;
    case "error":
      return progress.message ?? "Scan failed";
    default:
      return null;
  }
}

/* ── Main overlay component ────────────────────────────── */

interface RepoScanProgressOverlayProps {
  open: boolean;
  onClose: () => void;
  progress: RepoScanStreamEvent | null;
  scanning: boolean;
}

export default function RepoScanProgressOverlay({ open, onClose, progress, scanning }: RepoScanProgressOverlayProps) {
  // Auto-close after scan completes (2s delay so user sees the result)
  useEffect(() => {
    if (!open) return;
    if (progress?.event === "complete") {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [open, progress?.event, onClose]);

  if (!open) return null;

  const nodeStates = deriveRepoNodeStates(progress, scanning);
  const detail = getStatusDetail(progress, scanning);
  const activeNodes = NODES.filter((n) => nodeStates[n.id] === "active");
  const isComplete = progress?.event === "complete";
  const isError = progress?.event === "error";

  // Progress bar
  const reposScanned = progress?.repos_scanned ?? 0;
  const totalRepos = progress?.total_repos ?? 0;
  const progressPct = totalRepos > 0 ? Math.min((reposScanned / totalRepos) * 100, 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-[#161b22] rounded-2xl shadow-2xl w-full max-w-4xl mx-4 border border-[#30363d]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262c34]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00e68a]/10 border border-[#00e68a]/20 flex items-center justify-center">
              {scanning && !isComplete && !isError ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2" className="animate-spin">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              ) : isComplete ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : isError ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isComplete ? "Scan Complete" : isError ? "Scan Failed" : "Repository Scan in Progress"}
              </h2>
              <p className="text-xs text-[#8b949e]">Code & Supply Chain Scanner Pipeline</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors cursor-pointer" title="Dismiss scan overlay">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pipeline SVG */}
        <div className="px-6 py-5 overflow-x-auto">
          <svg
            viewBox="0 0 960 80"
            width="100%"
            height={80}
            className="overflow-visible min-w-[700px]"
          >
            <defs>
              <marker id="repo-arrow-gray" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#30363d" />
              </marker>
              <marker id="repo-arrow-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={GREEN} />
              </marker>
            </defs>

            {/* Edges */}
            {EDGES.map((edge) => (
              <EdgeArrow key={`${edge.from}-${edge.to}`} edge={edge} nodeStates={nodeStates} />
            ))}

            {/* Nodes */}
            {NODES.map((node) => (
              <NodeRect key={node.id} node={node} status={nodeStates[node.id]} />
            ))}
          </svg>
        </div>

        {/* Progress bar */}
        {scanning && !isComplete && !isError && totalRepos > 0 && (
          <div className="px-6 pb-2">
            <div className="flex items-center justify-between text-xs text-[#8b949e] mb-1.5">
              <span>
                Repo {reposScanned + 1} of {totalRepos}: {progress?.current_repo ?? "..."}
              </span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00e68a] rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Active step indicator */}
        {activeNodes.length > 0 && !isComplete && !isError && (
          <div className="px-6 pb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00e68a] animate-pulse" />
            <span className="text-xs font-semibold text-[#00e68a]">
              Processing: {activeNodes.map((n) => n.label).join(" + ")}
            </span>
          </div>
        )}

        {/* Status detail bar */}
        <div className="px-6 pb-5">
          {detail && (
            <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-3 ${
              isError
                ? "bg-red-950/20 border border-red-500/30 text-red-400"
                : isComplete
                ? "bg-[#00e68a]/10 border border-[#00e68a]/30 text-[#00e68a]"
                : "bg-[#21262d] border border-[#30363d] text-[#c9d1d9]"
            }`}>
              {scanning && !isComplete && !isError && (
                <div className="w-4 h-4 shrink-0 border-2 border-[#00e68a]/30 border-t-[#00e68a] rounded-full animate-spin" />
              )}
              {isComplete && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2.5" className="shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {isError && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" className="shrink-0">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              )}
              <span>{detail}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#262c34] flex justify-end">
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              isError
                ? "bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d]"
                : isComplete
                ? "bg-primary text-white hover:bg-primary-hover"
                : "bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d]"
            }`}
          >
            {isComplete ? "Done" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}
