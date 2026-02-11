import PageShell from "@/components/PageShell";

const SOURCES = [
  { name: "Firewall Logs", type: "Network", status: "Active", events: "12.4K/day" },
  { name: "SSH Auth Logs", type: "Authentication", status: "Active", events: "3.2K/day" },
  { name: "Syslog (Linux)", type: "System", status: "Active", events: "8.7K/day" },
  { name: "Web Access Logs", type: "Application", status: "Paused", events: "—" },
];

export default function LogSourcesPage() {
  return (
    <PageShell
      title="Log Sources"
      description="Connected log sources feeding the analysis pipeline"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      }
    >
      <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Name</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Type</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Status</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Events</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.name} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-[#1a1a2e]">{s.name}</td>
                <td className="px-5 py-3.5 text-gray-600">{s.type}</td>
                <td className="px-5 py-3.5">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                    s.status === "Active"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200"
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-gray-600">{s.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
