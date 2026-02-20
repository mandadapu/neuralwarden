import PageShell from "@/components/PageShell";

interface Agent {
  name: string;
  model: string;
  role: string;
  status: string;
  group: string;
}

const AGENTS: Agent[] = [
  // Threat Pipeline
  { name: "Ingest", model: "Haiku 4.5", role: "Parses raw logs into structured entries", status: "Ready", group: "Threat Pipeline" },
  { name: "Detect", model: "Sonnet 4.5", role: "Rule-based + AI threat detection", status: "Ready", group: "Threat Pipeline" },
  { name: "Classify", model: "Sonnet 4.5", role: "Risk scoring and MITRE mapping", status: "Ready", group: "Threat Pipeline" },
  { name: "Validate", model: "Haiku 4.5", role: "Cross-checks detections for accuracy", status: "Ready", group: "Threat Pipeline" },
  { name: "HITL Gate", model: "\u2014", role: "Human-in-the-loop review for critical threats", status: "Ready", group: "Threat Pipeline" },
  { name: "Report", model: "Opus 4.6", role: "Generates incident reports and action plans", status: "Ready", group: "Threat Pipeline" },
  // Cloud Scan Super Agent
  { name: "Discovery", model: "\u2014", role: "Enumerates GCP assets (VMs, buckets, firewalls, SQL)", status: "Ready", group: "Cloud Scan" },
  { name: "Router", model: "\u2014", role: "Routes assets to active scan (public) or log analysis (private)", status: "Ready", group: "Cloud Scan" },
  { name: "Active Scanner", model: "\u2014", role: "Runs compliance checks on public-facing assets", status: "Ready", group: "Cloud Scan" },
  { name: "Log Analyzer", model: "\u2014", role: "Queries Cloud Logging for private resource audit events", status: "Ready", group: "Cloud Scan" },
  { name: "Correlation Engine", model: "\u2014", role: "Cross-references scanner findings with log activity to detect active exploits", status: "Ready", group: "Cloud Scan" },
  { name: "Remediation Generator", model: "\u2014", role: "Generates parameterized gcloud remediation scripts for scan findings", status: "Ready", group: "Cloud Scan" },
];

function AgentGroup({ group, agents, startIndex }: { group: string; agents: Agent[]; startIndex: number }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{group}</h2>
      <div className="grid gap-3">
        {agents.map((agent, i) => (
          <div key={agent.name} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-4">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">
                {startIndex + i + 1}
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
    </div>
  );
}

export default function AgentsPage() {
  const groups = [...new Set(AGENTS.map((a) => a.group))];
  let index = 0;

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
      <div className="mt-6 space-y-8">
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
