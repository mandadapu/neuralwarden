import PageShell from "@/components/PageShell";

export default function ReportsPage() {
  return (
    <PageShell
      title="Reports"
      description="Generated incident reports from past analyses"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      }
    >
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">No saved reports yet. Run an analysis from the Feed to generate your first report.</p>
      </div>
    </PageShell>
  );
}
