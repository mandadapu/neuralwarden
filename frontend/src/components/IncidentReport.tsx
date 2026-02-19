import type { IncidentReport as IReport } from "@/lib/types";

const BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000/api`
    : "/api";

export default function IncidentReport({
  report,
  analysisId,
}: {
  report: IReport | null;
  analysisId?: string | null;
}) {
  if (!report) return null;

  return (
    <div className="mx-7 mb-7 bg-white border border-gray-200 rounded-xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#1a1a2e]">Incident Report</h3>
        {analysisId && (
          <a
            href={`${BASE}/reports/${analysisId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </a>
        )}
      </div>

      {/* Executive Summary */}
      <section className="mb-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-1">Executive Summary</h4>
        <p className="text-sm text-gray-600 leading-relaxed">{report.summary}</p>
      </section>

      {/* Timeline */}
      {report.timeline && (
        <section className="mb-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-1">Attack Timeline</h4>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
            {report.timeline}
          </p>
        </section>
      )}

      {/* Action Plan */}
      {report.action_plan.length > 0 && (
        <section className="mb-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Action Plan</h4>
          <div className="space-y-2">
            {report.action_plan.map((step) => (
              <div
                key={step.step}
                className="flex items-start gap-3 text-sm text-gray-600"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {step.step}
                </span>
                <div>
                  <span>{step.action} </span>
                  <span className="font-bold text-gray-800">[{step.urgency.toUpperCase()}]</span>
                  <span className="italic text-gray-500"> {step.owner}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <section className="mb-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Strategic Recommendations
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            {report.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </section>
      )}

      {/* IOCs */}
      {report.ioc_summary.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Indicators of Compromise
          </h4>
          <ul className="space-y-1">
            {report.ioc_summary.map((ioc, i) => (
              <li key={i} className="text-sm font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">
                {ioc}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
