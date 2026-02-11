import PageShell from "@/components/PageShell";

const AGENTS = [
  { name: "Ingest", model: "Haiku 4.5", role: "Parses raw logs into structured entries", status: "Ready" },
  { name: "Detect", model: "Sonnet 4.5", role: "Rule-based + AI threat detection", status: "Ready" },
  { name: "Classify", model: "Sonnet 4.5", role: "Risk scoring and MITRE mapping", status: "Ready" },
  { name: "Validate", model: "Haiku 4.5", role: "Cross-checks detections for accuracy", status: "Ready" },
  { name: "HITL Gate", model: "—", role: "Human-in-the-loop review for critical threats", status: "Ready" },
  { name: "Report", model: "Opus 4.6", role: "Generates incident reports and action plans", status: "Ready" },
];

export default function AgentsPage() {
  return (
    <PageShell
      title="Agents"
      description="AI agents powering the security analysis pipeline"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        </svg>
      }
    >
      <div className="mt-6 grid gap-3">
        {AGENTS.map((agent, i) => (
          <div key={agent.name} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-4">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <div className="font-semibold text-[#1a1a2e]">{agent.name}</div>
                <div className="text-xs text-gray-500">{agent.role}</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400 font-mono">{agent.model}</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                {agent.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
