import PageShell from "@/components/PageShell";

export default function IgnoredPage() {
  return (
    <PageShell
      title="Ignored"
      description="Findings marked as false positives or accepted risk"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      }
    >
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">No ignored findings. Mark threats as ignored from the Feed to manage noise.</p>
      </div>
    </PageShell>
  );
}
