"use client";

import type { ScanStreamEvent } from "@/lib/types";

/* ── Pipeline node definitions ─────────────────────────── */

interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  type?: "start" | "end" | "decision" | "parallel";
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

const PURPLE = "#7c3aed";
const TEAL = "#0d9488";
const ROSE = "#e11d48";
const BLUE = "#2563eb";
const SLATE = "#64748b";
const GREEN = "#00e68a";

const NODES: FlowNode[] = [
  { id: "c-gcp",       label: "GCP Project",     x: 60,  y: 40, color: SLATE,  type: "start" },
  { id: "c-discover",  label: "Discovery",       x: 200, y: 40, color: PURPLE },
  { id: "c-router",    label: "Router",          x: 340, y: 40, color: PURPLE, type: "decision" },
  { id: "c-active",    label: "Active Scanner",  x: 500, y: 10, color: TEAL,   type: "parallel" },
  { id: "c-logs",      label: "Log Analyzer",    x: 500, y: 70, color: TEAL,   type: "parallel" },
  { id: "c-correlate", label: "Correlation",     x: 660, y: 40, color: ROSE },
  { id: "c-remediate", label: "Remediation",     x: 800, y: 40, color: PURPLE },
  { id: "c-threat",    label: "Threat Pipeline", x: 940, y: 40, color: BLUE,   type: "end" },
];

const EDGES: FlowEdge[] = [
  { from: "c-gcp",       to: "c-discover" },
  { from: "c-discover",  to: "c-router" },
  { from: "c-router",    to: "c-active",    label: "public" },
  { from: "c-router",    to: "c-logs",      label: "private" },
  { from: "c-active",    to: "c-correlate" },
  { from: "c-logs",      to: "c-correlate" },
  { from: "c-correlate", to: "c-remediate" },
  { from: "c-remediate", to: "c-threat",    dashed: true },
];

/* ── Event → node state mapping ────────────────────────── */

type NodeStatus = "pending" | "active" | "completed" | "error";

// Maps SSE event name → set of completed node IDs and set of active node IDs
function deriveNodeStates(
  progress: ScanStreamEvent | null,
  scanning: boolean
): Record<string, NodeStatus> {
  const states: Record<string, NodeStatus> = {};
  for (const node of NODES) states[node.id] = "pending";

  if (!scanning && !progress) return states;

  const event = progress?.event ?? "";

  if (event === "error") {
    // Mark everything up to where we got as completed, current as error
    states["c-gcp"] = "completed";
    if (progress?.total_assets !== undefined) states["c-discover"] = "completed";
    return states;
  }

  // Progressive completion based on event
  // "starting"    → GCP done, Discovery active
  // "discovered"  → Discovery done, Router active
  // "routing"     → Router done, Scanners active
  // "scanned"     → Scanners done, Correlation+Remediation done, Threat Pipeline active
  // "complete"    → All done

  const ORDER: { event: string; completed: string[]; active: string[] }[] = [
    { event: "starting",   completed: ["c-gcp"],                                                                    active: ["c-discover"] },
    { event: "discovered", completed: ["c-gcp", "c-discover"],                                                      active: ["c-router"] },
    { event: "routing",    completed: ["c-gcp", "c-discover", "c-router"],                                          active: ["c-active", "c-logs"] },
    { event: "scanned",    completed: ["c-gcp", "c-discover", "c-router", "c-active", "c-logs", "c-correlate"],     active: ["c-remediate", "c-threat"] },
    { event: "complete",   completed: ["c-gcp", "c-discover", "c-router", "c-active", "c-logs", "c-correlate", "c-remediate", "c-threat"], active: [] },
  ];

  const match = ORDER.find((o) => o.event === event);
  if (!match && scanning) {
    // Scan started but no event yet — show GCP as active
    states["c-gcp"] = "active";
    return states;
  }
  if (!match) return states;

  for (const id of match.completed) states[id] = "completed";
  for (const id of match.active) states[id] = "active";

  return states;
}

function getStatusDetail(progress: ScanStreamEvent | null): string | null {
  if (!progress) return null;
  switch (progress.event) {
    case "starting":
      return "Initializing scan...";
    case "discovered":
      return `${progress.total_assets ?? 0} assets discovered`;
    case "routing":
      return `${progress.public_count ?? 0} public, ${progress.private_count ?? 0} private`;
    case "scanned":
      return `${progress.assets_scanned ?? 0} assets scanned — analyzing threats...`;
    case "complete":
      return `${progress.asset_count ?? 0} assets, ${progress.issue_count ?? 0} issues found${
        (progress.active_exploits_detected ?? 0) > 0
          ? ` — ${progress.active_exploits_detected} active exploit${progress.active_exploits_detected !== 1 ? "s" : ""} detected!`
          : ""
      }`;
    case "error":
      return progress.message ?? "Scan failed";
    default:
      return null;
  }
}

/* ── SVG rendering ─────────────────────────────────────── */

const NODE_W = 110;
const NODE_H = 36;
const NODE_RX = 10;

function NodeRect({ node, status }: { node: FlowNode; status: NodeStatus }) {
  const isSpecial = node.type === "start" || node.type === "end";
  const isDiamond = node.type === "decision";

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
        rx={isSpecial ? NODE_H / 2 : isDiamond ? 4 : NODE_RX}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={isError ? "#ef4444" : strokeColor}
        strokeWidth={isActive || isCompleted ? 2 : 1.5}
        strokeDasharray={isDiamond ? "4 2" : undefined}
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

  const isStraight = Math.abs(y2 - y1) < 5;
  const path = isStraight
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;

  // Color the edge green if both source and target are completed
  const fromDone = nodeStates[edge.from] === "completed";
  const toDone = nodeStates[edge.to] === "completed" || nodeStates[edge.to] === "active";
  const edgeColor = fromDone && toDone ? GREEN : "#30363d";

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={edgeColor}
        strokeWidth="1.5"
        strokeDasharray={edge.dashed ? "5 3" : undefined}
        markerEnd={`url(#arrow-${fromDone && toDone ? "green" : "gray"})`}
      />
      {edge.label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 6}
          textAnchor="middle"
          fill="#8b949e"
          fontSize="8"
          fontStyle="italic"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

/* ── Main overlay component ────────────────────────────── */

interface ScanProgressOverlayProps {
  open: boolean;
  onClose: () => void;
  progress: ScanStreamEvent | null;
  scanning: boolean;
}

export default function ScanProgressOverlay({ open, onClose, progress, scanning }: ScanProgressOverlayProps) {
  if (!open) return null;

  const nodeStates = deriveNodeStates(progress, scanning);
  const detail = getStatusDetail(progress);
  const isComplete = progress?.event === "complete";
  const isError = progress?.event === "error";
  const canClose = isComplete || isError;
  const exploits = progress?.active_exploits_detected ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={canClose ? onClose : undefined} />

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
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isComplete ? "Scan Complete" : isError ? "Scan Failed" : "Cloud Scan in Progress"}
              </h2>
              <p className="text-xs text-[#8b949e]">Cloud Scan Super Agent Pipeline</p>
            </div>
          </div>
          {canClose && (
            <button onClick={onClose} className="text-[#8b949e] hover:text-[#c9d1d9] transition-colors cursor-pointer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Pipeline SVG */}
        <div className="px-6 py-5 overflow-x-auto">
          <svg viewBox="0 0 1020 100" width="100%" height={100} className="overflow-visible min-w-[700px]">
            <defs>
              <marker id="arrow-gray" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#30363d" />
              </marker>
              <marker id="arrow-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
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

        {/* Status detail bar */}
        <div className="px-6 pb-5">
          {detail && (
            <div className={`px-4 py-3 rounded-xl text-sm flex items-center gap-3 ${
              isError
                ? "bg-red-950/20 border border-red-500/30 text-red-400"
                : isComplete
                ? exploits > 0
                  ? "bg-red-950/20 border border-red-500/30 text-red-400"
                  : "bg-[#00e68a]/10 border border-[#00e68a]/30 text-[#00e68a]"
                : "bg-[#21262d] border border-[#30363d] text-[#c9d1d9]"
            }`}>
              {scanning && !isComplete && !isError && (
                <div className="w-4 h-4 shrink-0 border-2 border-[#00e68a]/30 border-t-[#00e68a] rounded-full animate-spin" />
              )}
              {isComplete && exploits === 0 && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e68a" strokeWidth="2.5" className="shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {isComplete && exploits > 0 && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
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
        {canClose && (
          <div className="px-6 py-4 border-t border-[#262c34] flex justify-end">
            <button
              onClick={onClose}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                isError
                  ? "bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d]"
                  : "bg-primary text-white hover:bg-primary-hover"
              }`}
            >
              {isError ? "Dismiss" : "Done"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
