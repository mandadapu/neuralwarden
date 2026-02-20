import PageShell from "@/components/PageShell";

const INTEGRATIONS = [
  { name: "Anthropic Claude API", category: "AI / LLM", connected: true },
  { name: "Pinecone", category: "Vector Database", connected: true },
  { name: "Slack", category: "Notifications", connected: false },
  { name: "PagerDuty", category: "Incident Management", connected: false },
  { name: "Jira", category: "Ticketing", connected: false },
  { name: "Splunk", category: "SIEM", connected: false },
];

export default function IntegrationsPage() {
  return (
    <PageShell
      title="Integrations"
      description="Connect external services and tools"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      }
    >
      <div className="mt-6 grid grid-cols-2 gap-3">
        {INTEGRATIONS.map((int) => (
          <div key={int.name} className="bg-[#1c2128] rounded-xl border border-[#30363d] p-5 flex items-center justify-between transition-shadow">
            <div>
              <div className="font-semibold text-white text-sm">{int.name}</div>
              <div className="text-xs text-[#8b949e]">{int.category}</div>
            </div>
            {int.connected ? (
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#21262d] text-green-700 border border-green-200">
                Connected
              </span>
            ) : (
              <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors">
                Connect
              </button>
            )}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
