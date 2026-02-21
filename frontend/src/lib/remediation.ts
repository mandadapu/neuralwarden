const REMEDIATION: Record<string, string[]> = {
  // AI & Agentic Security
  prompt_injection: [
    "Review and harden system prompts with input sanitization",
    "Implement prompt boundary validation and output filtering",
    "Enable content safety classifiers on all LLM inputs",
    "Audit agent tool-use permissions and restrict scope",
  ],
  asi_01: [
    "Validate training data provenance and integrity checksums",
    "Run differential analysis on model outputs before and after fine-tuning",
    "Implement data pipeline access controls and audit logging",
    "Quarantine and retrain from clean data snapshots",
  ],
  asi_02: [
    "Restrict agent tool-use to allowlisted actions only",
    "Implement human-in-the-loop gates for destructive operations",
    "Monitor agent planning loops for divergent behavior",
    "Deploy rate limiting on agent action execution",
  ],
  ai_pentest: [
    "Review AI pentest findings and validate true positives",
    "Prioritize critical findings for immediate remediation",
    "Update security policies based on discovered attack paths",
    "Schedule re-testing after fixes are applied",
  ],
  // Code & Supply Chain
  sast: [
    "Sanitize and parameterize all user inputs at entry points",
    "Review and harden input validation across API endpoints",
    "Deploy WAF rules to block common injection payloads",
    "Audit codebase for dynamic query construction patterns",
  ],
  open_source_deps: [
    "Update affected packages to patched versions immediately",
    "Run dependency audit and review all findings",
    "Enable automated dependency scanning in CI/CD pipeline",
    "Verify checksums and signatures of all build artifacts",
  ],
  license_issues: [
    "Audit all open-source licenses against compliance policy",
    "Replace non-compliant dependencies with approved alternatives",
    "Add license scanning to CI/CD pipeline gates",
    "Document license obligations and attribution requirements",
  ],
  // Infrastructure & Runtime
  cloud_configs: [
    "Remediate the specific misconfiguration (public access, IAM, encryption)",
    "Run a full cloud security posture assessment",
    "Enable cloud-native security monitoring and alerting",
    "Review and enforce infrastructure-as-code policies",
  ],
  k8s: [
    "Review pod security standards and enforce restricted profiles",
    "Audit RBAC roles and remove excessive permissions",
    "Enable network policies to isolate workloads",
    "Scan container images for vulnerabilities before deployment",
  ],
  exposed_secrets: [
    "Rotate all exposed credentials and API keys immediately",
    "Remove secrets from version control and add to .gitignore",
    "Deploy pre-commit hooks to detect secrets before push",
    "Migrate to a secrets manager for centralized credential storage",
  ],
  eol_runtimes: [
    "Upgrade to a supported runtime version immediately",
    "Document migration path and test compatibility",
    "Enable automated runtime version monitoring",
    "Review all services for deprecated framework usage",
  ],
  // Threat Intel & Perimeter
  dast: [
    "Implement account lockout and rate limiting on auth endpoints",
    "Enable multi-factor authentication for all accounts",
    "Review firewall rules and close unnecessary ports",
    "Deploy intrusion detection system alerts for attack patterns",
  ],
  malware: [
    "Block identified C2 domains and IPs at the firewall",
    "Isolate affected endpoints for forensic investigation",
    "Review DNS logs for beaconing patterns and DGA domains",
    "Scan all accessed systems for persistence mechanisms",
  ],
  surface_monitoring: [
    "Review exposed services and reduce attack surface",
    "Enable web application firewall to block enumeration",
    "Investigate source IPs against threat intelligence feeds",
    "Audit all file transfers and outbound data flows",
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
