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
