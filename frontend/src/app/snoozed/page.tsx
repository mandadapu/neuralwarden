import PageShell from "@/components/PageShell";

export default function SnoozedPage() {
  return (
    <PageShell
      title="Snoozed"
      description="Threats deferred for later review"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      }
    >
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">No snoozed findings. Snooze threats from the Feed to revisit them later.</p>
      </div>
    </PageShell>
  );
}
