/**
 * NeuralWarden Security Taxonomy
 *
 * All threat/issue types are organized into 4 categories.
 * This is the single source of truth — used by ThreatsTable filters,
 * ThreatTypeIcon, remediation mapping, and the detect agent prompt.
 */

export interface ThreatType {
  id: string;
  label: string;
  description: string;
}

export interface ThreatCategory {
  id: string;
  label: string;
  description: string;
  types: ThreatType[];
}

export const THREAT_TAXONOMY: ThreatCategory[] = [
  {
    id: "ai_native",
    label: "AI & Agentic Security",
    description: "Threats targeting LLM-powered agents, prompt pipelines, and AI model integrity.",
    types: [
      { id: "prompt_injection", label: "Prompt Injection", description: "Direct or indirect manipulation of LLM system prompts to bypass safety controls or exfiltrate data." },
      { id: "asi_01", label: "ASI-01: Model Integrity", description: "Model poisoning, training data corruption, adversarial inputs targeting AI model accuracy and safety." },
      { id: "asi_02", label: "ASI-02: Autonomous Risk", description: "Agent hijacking, tool misuse, and exploitation of autonomous agent decision loops." },
      { id: "ai_pentest", label: "AI Pentest", description: "AI-powered penetration testing findings and automated vulnerability discovery." },
    ],
  },
  {
    id: "supply_chain",
    label: "Code & Supply Chain",
    description: "Vulnerabilities in source code, dependencies, build pipelines, and software delivery.",
    types: [
      { id: "sast", label: "SAST", description: "Static Application Security Testing findings — SQL injection, XSS, code injection, insecure patterns." },
      { id: "open_source_deps", label: "Open-Source Deps", description: "Vulnerable dependencies, compromised upstream packages, and supply chain attacks." },
      { id: "license_issues", label: "License Issues", description: "Non-compliant open-source licenses, GPL violations, and license audit failures." },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure & Runtime",
    description: "Runtime threats against cloud resources, containers, hosts, and identity systems.",
    types: [
      { id: "cloud_configs", label: "Cloud Configs", description: "Cloud misconfigurations — public buckets, overly permissive IAM, missing encryption, privilege escalation." },
      { id: "k8s", label: "K8s", description: "Kubernetes security issues — pod security, RBAC misconfig, network policies, container escapes." },
      { id: "exposed_secrets", label: "Exposed Secrets", description: "Hardcoded credentials, leaked API keys, tokens in version control or logs." },
      { id: "eol_runtimes", label: "EOL Runtimes", description: "End-of-life runtimes, deprecated frameworks, and unsupported OS versions." },
    ],
  },
  {
    id: "threat_intel",
    label: "Threat Intel & Perimeter",
    description: "External reconnaissance, perimeter probing, malware indicators, and dynamic testing.",
    types: [
      { id: "dast", label: "DAST", description: "Dynamic Application Security Testing — brute force, authentication bypass, runtime injection, port scanning." },
      { id: "malware", label: "Malware", description: "Command & control beaconing, lateral movement, malicious payloads, and persistence mechanisms." },
      { id: "surface_monitoring", label: "Surface Monitoring", description: "Attack surface changes, data exfiltration, reconnaissance, and anomalous perimeter activity." },
    ],
  },
];

/** Flat lookup: type ID -> category ID */
export const TYPE_TO_CATEGORY: Record<string, string> = {};
/** Flat lookup: type ID -> label */
export const TYPE_LABELS: Record<string, string> = {};
/** Flat lookup: category ID -> label */
export const CATEGORY_LABELS: Record<string, string> = {};

for (const cat of THREAT_TAXONOMY) {
  CATEGORY_LABELS[cat.id] = cat.label;
  for (const t of cat.types) {
    TYPE_TO_CATEGORY[t.id] = cat.id;
    TYPE_LABELS[t.id] = t.label;
  }
}

/** Get display label for a type (falls back to Title Case of the raw string) */
export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get category label for a type */
export function getCategoryLabel(type: string): string {
  const catId = TYPE_TO_CATEGORY[type];
  return catId ? CATEGORY_LABELS[catId] : "Other";
}
