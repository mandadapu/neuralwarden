# NeuralWarden — Product Vision

## Mission

Replace reactive, manual security workflows with an AI-driven defense platform that **automatically discovers, scans, correlates, and responds** to threats across cloud infrastructure — making enterprise-grade security accessible to teams of any size.

## Core Thesis

Most security tools stop at static analysis: they find the "open window." NeuralWarden goes three layers deeper:

1. **Static Analysis** — finds the open window (vulnerability scanning)
2. **Behavioral Analysis** — sees the burglar climbing in (log-based threat detection)
3. **Correlation** — connects the two automatically (active exploit detection)
4. **Agentic Response** — writes the police report and locks the door (incident reports + remediation)

## Architecture Principles

### Agentic, Not Monolithic
Each analysis capability is a discrete agent with a single responsibility. Agents compose via LangGraph state graphs, enabling parallel execution, conditional routing, and graceful degradation. If one agent fails, the pipeline continues with degraded output rather than crashing.

### Multi-Model Cost Optimization
Not every task needs the most expensive model. The pipeline routes by complexity:
- **Haiku** ($0.25/MTok) — high-volume log parsing
- **Sonnet** ($3/MTok) — detection, classification, validation
- **Opus** ($15/MTok) — final report generation (smallest token volume)
- **Deterministic** ($0) — rule-based detection, asset discovery, routing, correlation

Typical analysis cost: **$0.01–0.05** per run.

### Multi-Tenant by Default
Per-user data isolation via OAuth identity. Every cloud account, issue, and asset is scoped to `user_email`. Supports both SaaS (multi-tenant) and self-hosted (single-tenant) deployment.

### Intelligence Over Volume
The Correlation Engine is the key differentiator. Rather than presenting a flat list of vulnerabilities, it cross-references static findings with behavioral signals to surface **active exploits** — the 2% of findings that actually matter.

## Current Capabilities (v2.0)

### Threat Pipeline
- 6-agent LangGraph pipeline: Ingest → Detect → Validate → Classify → HITL → Report
- 5 rule-based detection patterns (brute force, port scan, privilege escalation, data exfil, lateral movement)
- AI-powered novel threat detection via Sonnet
- Shadow validation (5% sample of "clean" logs)
- RAG enrichment via Pinecone threat intel
- Human-in-the-loop review for critical threats
- MITRE ATT&CK mapping for all classified threats

### Cloud Scan Super Agent
- 5-agent LangGraph pipeline: Discovery → Router → Active Scanner / Log Analyzer → Correlation Engine
- GCP asset discovery: Compute Engine, Cloud Storage, Firewall Rules, Cloud SQL, Resource Manager
- Public/private asset routing based on metadata inspection
- Compliance checks: open SSH (GCP_002), public buckets (GCP_004), default service accounts (GCP_006)
- Cloud Logging queries for behavioral signals
- Correlation Engine with intelligence matrix mapping scanner findings to log patterns
- Real-time SSE streaming for scan progress

### Dashboard
- OAuth login (Google)
- Cloud management: connect, configure, scan, view issues/assets
- Threat feed with severity, confidence, MITRE mapping
- Threat detail panel with remediation guidance
- Snooze/ignore/solve workflow
- Incident report generation with PDF export
- Agent status and cost breakdown

## Roadmap

### Near-term
- **AWS Support** — extend Discovery/Router/Scanner agents to AWS (EC2, S3, Security Groups, RDS)
- **Azure Support** — VMs, Blob Storage, NSGs, Azure SQL
- **Scheduled Scans** — cron-based recurring scans with drift detection
- **Slack/PagerDuty Alerts** — notify on active exploit detection

### Medium-term
- **AutoFix Agent** — generate and apply Terraform/gcloud remediation commands
- **Compliance Frameworks** — CIS Benchmarks, SOC 2, ISO 27001 mapping
- **Multi-Cloud Correlation** — cross-reference findings across AWS + GCP + Azure
- **Team Collaboration** — shared workspaces, role-based access, audit trail

### Long-term
- **Continuous Monitoring** — real-time log streaming with instant correlation
- **Threat Hunting Playbooks** — guided investigation workflows powered by AI
- **Custom Detection Rules** — user-defined correlation patterns
- **API-First Platform** — full programmatic access for CI/CD integration
