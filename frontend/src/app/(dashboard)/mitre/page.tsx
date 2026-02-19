import PageShell from "@/components/PageShell";

const TACTICS = [
  { id: "TA0043", name: "Reconnaissance", techniques: ["T1595.002 — Active Scanning: Vulnerability Scanning", "T1046 — Network Service Discovery"] },
  { id: "TA0001", name: "Initial Access", techniques: ["T1110 — Brute Force", "T1110.001 — Password Guessing"] },
  { id: "TA0010", name: "Exfiltration", techniques: ["T1041 — Exfiltration Over C2 Channel", "T1048 — Exfiltration Over Alternative Protocol"] },
  { id: "TA0004", name: "Privilege Escalation", techniques: ["T1548 — Abuse Elevation Control Mechanism"] },
  { id: "TA0008", name: "Lateral Movement", techniques: ["T1021 — Remote Services"] },
];

export default function MitrePage() {
  return (
    <PageShell
      title="MITRE ATT&CK"
      description="Techniques and tactics observed in your environment"
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      }
    >
      <div className="mt-6 space-y-3">
        {TACTICS.map((tactic) => (
          <div key={tactic.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{tactic.id}</span>
              <h3 className="font-semibold text-[#1a1a2e]">{tactic.name}</h3>
            </div>
            <div className="space-y-1.5">
              {tactic.techniques.map((t) => (
                <div key={t} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                  <span className="font-mono text-xs text-gray-500">{t.split(" — ")[0]}</span>
                  <span>{t.split(" — ")[1]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
