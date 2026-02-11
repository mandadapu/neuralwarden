import PageShell from "@/components/PageShell";

export default function SolvedPage() {
  return (
    <PageShell
      title="Solved"
      description="Threats that have been resolved"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      }
    >
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">No solved findings yet. Resolve threats from the Feed to track them here.</p>
      </div>
    </PageShell>
  );
}
