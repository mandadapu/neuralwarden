# NeuralWarden — Product Vision

## Mission

Replace reactive, manual security workflows with an AI-driven defense platform that **automatically discovers, scans, correlates, and responds** to threats across cloud infrastructure — making enterprise-grade security accessible to teams of any size.

## The Name

**Neural** — the Correlation Engine and Claude Sonnet reasoning layer that doesn't just see data, but *understands* the relationship between a vulnerability and a log event. It thinks, not just scans.

**Warden** — the autonomous guardian that watches over your cloud infrastructure 24/7, closing the loop from detection to remediation without waiting for a human to act.

## Core Thesis

Most security tools stop at static analysis: they find the "open window." NeuralWarden goes three layers deeper:

1. **Neural Discovery** — maps the attack surface autonomously (asset discovery)
2. **Agentic Analysis** — parallel workers investigate every resource (compliance + behavioral signals)
3. **Neural Correlation** — connects the vulnerability to the attack (active exploit detection via the Neural Core)
4. **Automated Wardenship** — writes the police report and locks the door (incident reports + remediation scripts)

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

### The Neural Core — Intelligence Over Volume
The Correlation Engine is the "Neural" in NeuralWarden. Rather than presenting a flat list of vulnerabilities, it cross-references static findings with behavioral signals to surface **active exploits** — the 2% of findings that actually matter. It doesn't just see data; it understands the *relationship* between a vulnerability and a log event.

### The Neural Engine — Claude Sonnet for Reasoning
Claude Sonnet serves as the Neural Engine for high-reasoning classification. When the Correlation Engine threads evidence into the Classify Agent, Sonnet reasons over the correlated findings: escalating severity to CRITICAL, generating remediation gcloud commands, and explaining *why* the vulnerability and behavior together indicate active exploitation.

### Deterministic First, LLM Second
Correlation follows a two-layer strategy. The deterministic Correlation Engine ($0) matches scanner rule codes to log patterns via an intelligence matrix — fast, reliable, and free. The LLM layer (Classify Agent powered by Sonnet) then reasons over the correlated evidence. This ensures the expensive model only adds reasoning, not pattern matching.

## Current Capabilities (v2.1)

### NeuralWarden Core — Cloud Scan Super Agent (runs first)
- 6-agent LangGraph pipeline: Discovery → Router → Active Scanner / Log Analyzer (parallel) → Correlation Engine → Remediation Generator
- GCP asset discovery: Compute Engine, Cloud Storage, Firewall Rules, Cloud SQL, Resource Manager
- Public/private asset routing based on metadata inspection
- Compliance checks: open SSH (GCP_002), public buckets (GCP_004), default service accounts (GCP_006)
- Cloud Logging queries for behavioral signals
- Correlation Engine with intelligence matrix mapping scanner findings to log patterns
- Correlated evidence collection: up to 5 log samples per finding with matched patterns and MITRE mappings
- Remediation Generator: parameterized gcloud command templates per rule code
- Real-time SSE streaming for scan progress

### Neural Engine — Threat Pipeline (fed by Cloud Scan)
- 6-agent LangGraph pipeline: Ingest → Detect → Validate → Classify → HITL → Report
- 5 rule-based detection patterns (brute force, port scan, privilege escalation, data exfil, lateral movement)
- AI-powered novel threat detection via Sonnet
- Shadow validation (5% sample of "clean" logs)
- RAG enrichment via Pinecone threat intel
- Human-in-the-loop review for critical threats
- MITRE ATT&CK mapping for all classified threats
- **Correlation-aware Classify Agent**: when correlated evidence is present, injects severity escalation rules, remediation gcloud commands, and MITRE mapping from evidence into the LLM prompt
- **Active Incidents reporting**: Report Agent leads executive summary with correlated active exploits when evidence is threaded from Cloud Scan

### Dashboard
- OAuth login (Google)
- Cloud management: connect, configure, scan, view issues/assets
- Threat feed with severity, confidence, MITRE mapping
- Threat detail panel with remediation guidance
- Snooze/ignore/solve workflow
- Incident report generation with PDF export
- Agents page with interactive SVG data flow diagram and 3-column card grid with collapsible groups
- 12 agents across 2 pipelines with execution-order numbering

## Roadmap

### Near-term
- **AWS Support** — extend Discovery/Router/Scanner agents to AWS (EC2, S3, Security Groups, RDS)
- **Azure Support** — VMs, Blob Storage, NSGs, Azure SQL
- **Scheduled Scans** — cron-based recurring scans with drift detection
- **Slack/PagerDuty Alerts** — notify on active exploit detection
- **AutoFix Agent** — execute Remediation Generator scripts with user approval (gcloud commands already generated)

### Medium-term
- **Compliance Frameworks** — CIS Benchmarks, SOC 2, ISO 27001 mapping
- **Multi-Cloud Correlation** — cross-reference findings across AWS + GCP + Azure
- **Team Collaboration** — shared workspaces, role-based access, audit trail

### Long-term
- **Continuous Monitoring** — real-time log streaming with instant correlation
- **Threat Hunting Playbooks** — guided investigation workflows powered by AI
- **Custom Detection Rules** — user-defined correlation patterns
- **API-First Platform** — full programmatic access for CI/CD integration
