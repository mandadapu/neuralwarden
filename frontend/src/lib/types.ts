export interface ClassifiedThreat {
  threat_id: string;
  type: string;
  confidence: number;
  source_log_indices: number[];
  method: "rule_based" | "ai_detected" | "validator_detected";
  description: string;
  source_ip: string;
  risk: "critical" | "high" | "medium" | "low" | "informational";
  risk_score: number;
  mitre_technique: string;
  mitre_tactic: string;
  business_impact: string;
  affected_systems: string[];
  remediation_priority: number;
}

export interface PendingThreat {
  threat_id: string;
  type: string;
  risk_score: number;
  description: string;
  source_ip: string;
  mitre_technique: string;
  business_impact: string;
  suggested_action: string;
}

export interface ActionStep {
  step: number;
  action: string;
  urgency: string;
  owner: string;
}

export interface IncidentReport {
  summary: string;
  threat_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  timeline: string;
  action_plan: ActionStep[];
  recommendations: string[];
  ioc_summary: string[];
  mitre_techniques: string[];
  generated_at: string | null;
}

export interface AgentMetrics {
  cost_usd: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export interface Summary {
  total_threats: number;
  severity_counts: Record<string, number>;
  auto_ignored: number;
  total_logs: number;
  logs_cleared: number;
}

export interface AnalysisResponse {
  analysis_id: string | null;
  thread_id: string | null;
  status: "completed" | "hitl_required" | "error";
  summary: Summary;
  classified_threats: ClassifiedThreat[];
  pending_critical_threats: PendingThreat[];
  report: IncidentReport | null;
  agent_metrics: Record<string, AgentMetrics>;
  pipeline_time: number;
  error: string | null;
}

export interface SampleInfo {
  id: string;
  name: string;
}

export interface SampleContent {
  id: string;
  name: string;
  content: string;
}

export interface ReportSummary {
  id: string;
  created_at: string;
  status: string;
  log_count: number;
  threat_count: number;
  critical_count: number;
  pipeline_time: number;
  pipeline_cost: number;
  summary: string;
}

// ── Cloud Monitoring ──

export interface IssueCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface CloudAccount {
  id: string;
  user_email: string;
  provider: string;
  name: string;
  project_id: string;
  purpose: string;
  services: string[];
  last_scan_at: string | null;
  created_at: string;
  status: string;
  issue_counts?: IssueCounts;
  asset_counts?: { total: number; by_type: Record<string, number> };
}

export interface CloudAsset {
  id: string;
  cloud_account_id: string;
  asset_type: string;
  name: string;
  region: string;
  metadata_json: string;
  discovered_at: string;
}

export interface CloudIssue {
  id: string;
  cloud_account_id: string;
  asset_id: string | null;
  rule_code: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  fix_time: string;
  status: "todo" | "in_progress" | "ignored" | "resolved";
  remediation_script: string;
  discovered_at: string;
}

export interface CloudCheck {
  id: string;
  provider: string;
  rule_code: string;
  title: string;
  description: string;
  category: string;
  check_function: string;
}

export interface ScanResult {
  scan_type: string;
  scanned_services: string[];
  asset_count: number;
  issue_count: number;
  issue_counts: IssueCounts;
}

export interface ScanStreamEvent {
  event: string;
  total_assets?: number;
  assets_scanned?: number;
  scan_type?: string;
  public_count?: number;
  private_count?: number;
  asset_count?: number;
  issue_count?: number;
  active_exploits_detected?: number;
  issue_counts?: IssueCounts;
  has_report?: boolean;
  message?: string;
  scan_log_id?: string;
  threat_stage?: string;
}

// ── Scan Logs ──

export interface ScanLogServiceDetail {
  status: "success" | "error" | "skipped";
  duration_seconds: number;
  asset_count: number;
  issue_count: number;
  error: string | null;
}

export interface ScanLogSummary {
  scan_type: string;
  services_attempted: string[];
  services_succeeded: string[];
  services_failed: string[];
  total_asset_count: number;
  total_issue_count: number;
  duration_seconds: number;
  service_details: Record<string, ScanLogServiceDetail>;
  active_exploits_detected: number;
}

export interface ScanLogEntry {
  ts: string;
  level: "info" | "error" | "warning";
  message: string;
}

export interface ThreatLogEntry {
  ts: string;
  level: "info" | "error" | "warning";
  agent: string;
  message: string;
}

export interface ScanLog {
  id: string;
  cloud_account_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "partial" | "error";
  summary_json: string;
  log_entries_json: string;
  threat_metrics_json: string;
  threat_log_entries_json: string;
}

export interface ScanLogListItem {
  id: string;
  cloud_account_id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "success" | "partial" | "error";
  summary_json: string;
}

// ── Threat Intel ──

export interface ThreatIntelStats {
  connected: boolean;
  total_vectors: number;
}

export interface ThreatIntelEntry {
  id: string;
  text: string;
  metadata: {
    severity?: string;
    cvss?: number;
    cve_id?: string;
    technique?: string;
    tactic?: string;
    category?: string;
    affected_software?: string;
    published?: string;
    framework?: string;
    control_id?: string;
  };
}

export interface ThreatIntelSearchResult {
  id: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
}
