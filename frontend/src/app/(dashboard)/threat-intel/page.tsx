import PageShell from "@/components/PageShell";

const FEEDS = [
  { name: "Pinecone Vector DB", type: "RAG Knowledge Base", status: "Connected", entries: "1,247" },
];

export default function ThreatIntelPage() {
  return (
    <PageShell
      title="Threat Intel"
      description="Threat intelligence feeds and knowledge bases"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      }
    >
      <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Feed</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Type</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Status</th>
              <th className="text-left px-5 py-3.5 font-semibold text-gray-700">Entries</th>
            </tr>
          </thead>
          <tbody>
            {FEEDS.map((f) => (
              <tr key={f.name} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-[#1a1a2e]">{f.name}</td>
                <td className="px-5 py-3.5 text-gray-600">{f.type}</td>
                <td className="px-5 py-3.5">
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                    {f.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-gray-600">{f.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
