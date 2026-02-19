import PageShell from "@/components/PageShell";

export default function AutoFixPage() {
  return (
    <PageShell
      title="AutoFix"
      description="Automated remediation for common security issues"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      }
    >
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-2xl font-bold text-[#1a1a2e]">0</div>
          <div className="text-sm text-gray-500">Available fixes</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-2xl font-bold text-green-600">0</div>
          <div className="text-sm text-gray-500">Applied</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-2xl font-bold text-gray-400">0</div>
          <div className="text-sm text-gray-500">Skipped</div>
        </div>
      </div>
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-400 text-sm">Run an analysis from the Feed to discover auto-fixable issues.</p>
      </div>
    </PageShell>
  );
}
