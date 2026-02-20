"use client";

import { useState } from "react";

/* ── Node & edge data ─────────────────────────────────────── */

interface FlowNode {
  id: string;
  label: string;
  model?: string;
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

const BLUE = "#2563eb";
const PURPLE = "#7c3aed";
const TEAL = "#0d9488";
const AMBER = "#d97706";
const ROSE = "#e11d48";
const SLATE = "#64748b";

const THREAT_NODES: FlowNode[] = [
  { id: "t-raw",       label: "Raw Logs",       x: 60,  y: 40,  color: SLATE,  type: "start" },
  { id: "t-ingest",    label: "Ingest",         x: 200, y: 40,  color: BLUE,   model: "Haiku" },
  { id: "t-detect",    label: "Detect",         x: 340, y: 40,  color: BLUE,   model: "Sonnet" },
  { id: "t-validate",  label: "Validate",       x: 480, y: 40,  color: BLUE,   model: "Haiku" },
  { id: "t-classify",  label: "Classify",       x: 620, y: 40,  color: BLUE,   model: "Sonnet" },
  { id: "t-hitl",      label: "HITL",           x: 760, y: 40,  color: AMBER,  type: "decision" },
  { id: "t-report",    label: "Report",         x: 900, y: 40,  color: BLUE,   model: "Haiku" },
];

const THREAT_EDGES: FlowEdge[] = [
  { from: "t-raw",      to: "t-ingest" },
  { from: "t-ingest",   to: "t-detect" },
  { from: "t-detect",   to: "t-validate" },
  { from: "t-validate", to: "t-classify" },
  { from: "t-classify", to: "t-hitl" },
  { from: "t-hitl",     to: "t-report", label: "approved" },
];

const CLOUD_NODES: FlowNode[] = [
  { id: "c-gcp",       label: "GCP Project",       x: 60,  y: 40,  color: SLATE,  type: "start" },
  { id: "c-discover",  label: "Discovery",         x: 200, y: 40,  color: PURPLE },
  { id: "c-router",    label: "Router",            x: 340, y: 40,  color: PURPLE, type: "decision" },
  { id: "c-active",    label: "Active Scanner",    x: 500, y: 10,  color: TEAL },
  { id: "c-logs",      label: "Log Analyzer",      x: 500, y: 70,  color: TEAL },
  { id: "c-correlate", label: "Correlation",       x: 660, y: 40,  color: ROSE },
  { id: "c-remediate", label: "Remediation",       x: 800, y: 40,  color: PURPLE },
  { id: "c-threat",    label: "Threat Pipeline",   x: 940, y: 40,  color: BLUE,   type: "end" },
];

const CLOUD_EDGES: FlowEdge[] = [
  { from: "c-gcp",       to: "c-discover" },
  { from: "c-discover",  to: "c-router" },
  { from: "c-router",    to: "c-active",    label: "public" },
  { from: "c-router",    to: "c-logs",      label: "private" },
  { from: "c-active",    to: "c-correlate" },
  { from: "c-logs",      to: "c-correlate" },
  { from: "c-correlate", to: "c-remediate" },
  { from: "c-remediate", to: "c-threat",    dashed: true },
];

/* ── SVG helpers ──────────────────────────────────────────── */

const NODE_W = 110;
const NODE_H = 36;
const NODE_RX = 10;

function NodeRect({ node, hovered, onHover }: { node: FlowNode; hovered: boolean; onHover: (id: string | null) => void }) {
  const isSpecial = node.type === "start" || node.type === "end";
  const isDiamond = node.type === "decision";

  return (
    <g
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "default" }}
    >
      {/* Glow on hover */}
      {hovered && (
        <rect
          x={node.x - NODE_W / 2 - 3}
          y={node.y - NODE_H / 2 - 3}
          width={NODE_W + 6}
          height={NODE_H + 6}
          rx={NODE_RX + 2}
          fill="none"
          stroke={node.color}
          strokeWidth="2"
          opacity="0.3"
        />
      )}

      {/* Node shape */}
      <rect
        x={node.x - NODE_W / 2}
        y={node.y - NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={isSpecial ? NODE_H / 2 : isDiamond ? 4 : NODE_RX}
        fill={hovered ? node.color : "#081510"}
        stroke={node.color}
        strokeWidth={isDiamond ? 2 : 1.5}
        strokeDasharray={isDiamond ? "4 2" : undefined}
      />

      {/* Label */}
      <text
        x={node.x}
        y={node.y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={hovered ? "white" : node.color}
        fontSize="11"
        fontWeight="600"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      >
        {node.label}
      </text>

      {/* Model badge */}
      {node.model && (
        <text
          x={node.x}
          y={node.y + NODE_H / 2 + 12}
          textAnchor="middle"
          fill="#3a5548"
          fontSize="8"
          fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
        >
          {node.model}
        </text>
      )}
    </g>
  );
}

function EdgeArrow({ edge, nodes }: { edge: FlowEdge; nodes: FlowNode[] }) {
  const from = nodes.find((n) => n.id === edge.from)!;
  const to = nodes.find((n) => n.id === edge.to)!;

  const x1 = from.x + NODE_W / 2;
  const y1 = from.y;
  const x2 = to.x - NODE_W / 2;
  const y2 = to.y;

  // Curved path for non-straight connections
  const isStraight = Math.abs(y2 - y1) < 5;
  const path = isStraight
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="#1a3020"
        strokeWidth="1.5"
        strokeDasharray={edge.dashed ? "5 3" : undefined}
        markerEnd="url(#arrowhead)"
      />
      {edge.label && (
        <text
          x={(x1 + x2) / 2}
          y={((y1 + y2) / 2) - 6}
          textAnchor="middle"
          fill="#3a5548"
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

/* ── Pipeline diagram component ──────────────────────────── */

function PipelineSVG({
  nodes,
  edges,
  width,
  height,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className="overflow-visible"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#1a3020" />
        </marker>
      </defs>

      {/* Edges first (behind nodes) */}
      {edges.map((edge) => (
        <EdgeArrow key={`${edge.from}-${edge.to}`} edge={edge} nodes={nodes} />
      ))}

      {/* Nodes */}
      {nodes.map((node) => (
        <NodeRect
          key={node.id}
          node={node}
          hovered={hovered === node.id}
          onHover={setHovered}
        />
      ))}
    </svg>
  );
}

/* ── Main export ──────────────────────────────────────────── */

export default function PipelineFlowDiagram() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[#122a1e]/60 bg-[#081510]/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#0a1a14]/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-8 rounded-full bg-gradient-to-b from-[#2563eb] to-[#7c3aed]" />
          <div className="text-left">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#3a5548]">
              Architecture
            </span>
            <h2 className="text-base font-bold text-white -mt-0.5">Data Flow</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#3a5548] hidden md:block">How agents connect across both pipelines</span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[#3a5548] transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${
          open ? "opacity-100 max-h-[1000px] pb-5" : "max-h-0 opacity-0 overflow-hidden pb-0"
        }`}
      >
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 mb-4">
          {[
            { color: BLUE, label: "Threat Pipeline" },
            { color: PURPLE, label: "Cloud Scan" },
            { color: TEAL, label: "Parallel Scanners" },
            { color: ROSE, label: "Correlation" },
            { color: AMBER, label: "Decision Gate" },
            { color: SLATE, label: "Input / Output" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
              <span className="text-[11px] text-[#5a7068]">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Cloud Scan Pipeline (runs first) */}
        <div className="px-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#3a5548] mb-1.5 px-1">
            1. Cloud Scan Super Agent
          </div>
          <div className="bg-[#081510] rounded-xl border border-[#0e1e16] px-4 py-4 overflow-x-auto">
            <PipelineSVG nodes={CLOUD_NODES} edges={CLOUD_EDGES} width={1020} height={100} />
          </div>
        </div>

        {/* Connector */}
        <div className="flex justify-center my-2">
          <div className="flex flex-col items-center">
            <svg width="2" height="16">
              <line x1="1" y1="0" x2="1" y2="16" stroke="#1a3020" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span className="text-[9px] text-[#3a5548] bg-[#0a1a14] px-2 py-0.5 rounded-full border border-[#122a1e]">
              feeds into
            </span>
            <svg width="2" height="16">
              <line x1="1" y1="0" x2="1" y2="16" stroke="#1a3020" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
          </div>
        </div>

        {/* Threat Pipeline (fed by Cloud Scan) */}
        <div className="px-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#3a5548] mb-1.5 px-1">
            2. Threat Pipeline
          </div>
          <div className="bg-[#081510] rounded-xl border border-[#0e1e16] px-4 py-4 overflow-x-auto">
            <PipelineSVG nodes={THREAT_NODES} edges={THREAT_EDGES} width={980} height={75} />
          </div>
        </div>
      </div>
    </div>
  );
}
