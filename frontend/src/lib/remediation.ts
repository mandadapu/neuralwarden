const REMEDIATION: Record<string, string[]> = {
  brute_force: [
    "Implement account lockout after 5 failed attempts",
    "Enable multi-factor authentication for all accounts",
    "Review and rotate compromised credentials",
    "Deploy IP-based rate limiting on authentication endpoints",
  ],
  port_scan: [
    "Review firewall rules and close unnecessary ports",
    "Enable intrusion detection system alerts for scan patterns",
    "Investigate the scanning source IP for known threat intelligence",
    "Implement network segmentation to limit exposure",
  ],
  data_exfiltration: [
    "Immediately block the destination IP at the firewall",
    "Audit all file transfers in the affected time window",
    "Review DLP policies and enable alerts for large transfers",
    "Check for compromised credentials used in the transfer",
  ],
  privilege_escalation: [
    "Revoke escalated privileges and reset affected accounts",
    "Audit sudo and admin access logs for unauthorized changes",
    "Review and harden privilege escalation policies",
    "Deploy endpoint detection for privilege abuse patterns",
  ],
  lateral_movement: [
    "Isolate affected hosts from the network immediately",
    "Reset credentials for accounts used in lateral movement",
    "Scan all accessed systems for persistence mechanisms",
    "Implement micro-segmentation between critical network zones",
  ],
};

const DEFAULT_REMEDIATION = [
  "Isolate affected systems from the network",
  "Review security logs for full scope of the incident",
  "Engage incident response team for investigation",
  "Document findings and update detection rules",
];

export function getRemediation(type: string, risk: string): string[] {
  const steps = REMEDIATION[type] ?? DEFAULT_REMEDIATION;
  if (risk === "critical" || risk === "high") {
    return [`IMMEDIATE: ${steps[0]}`, ...steps.slice(1)];
  }
  return steps;
}
