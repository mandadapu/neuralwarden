# Cloud Monitoring (Clouds) — Design Document

**Date**: 2026-02-19
**Status**: Approved
**Scope**: Replace "Log Sources" with full "Clouds" section — GCP-first cloud monitoring with asset discovery, compliance scanning, and threat detection pipeline integration.

## Overview

Redesign the static "Log Sources" page into a production-grade "Cloud Monitoring" section. The system integrates with GCP via service account credentials, discovers cloud resources, runs CIS-style compliance checks, and feeds Cloud Logging into the existing LangGraph threat detection pipeline.

## Navigation & Routes

**Sidebar**: Replace "Log Sources [4]" with "Clouds [N]" (N = connected cloud accounts).

| Route | Page | Description |
|-------|------|-------------|
| `/clouds` | Cloud List | All connected cloud accounts with issue counts |
| `/clouds/connect` | Connect Cloud | Wizard to add a new GCP project |
| `/clouds/[id]` | Cloud Detail — Issues | Security issues found during scans (default tab) |
| `/clouds/[id]/assets` | Cloud Detail — Assets | Discovered GCP resources |
| `/clouds/[id]/virtual-machines` | Cloud Detail — VMs | Compute Engine instances |
| `/clouds/[id]/checks` | Cloud Detail — Checks | Compliance rule results |

## Connect Cloud Flow

Wizard-style onboarding:

1. **Choose Provider** — Card selection: "Google Cloud Platform" (only GCP active; AWS/Azure placeholders for future)
2. **Authentication** — GCP Project ID + Service Account JSON upload (drag-and-drop). Backend validates credentials via `resourcemanager.projects.get`.
3. **Configure** — Cloud name, purpose (Production/Staging/Development), service selection checkboxes (Compute Engine, Cloud Run, Cloud SQL, Cloud Storage, IAM, Firewall Rules, Cloud Logging).
4. **Save** — Stores per-user in database, redirects to `/clouds/[id]`.

## Database Schema

### cloud_accounts
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| user_email | TEXT NOT NULL | Per-user isolation |
| provider | TEXT DEFAULT 'gcp' | Cloud provider |
| name | TEXT NOT NULL | Display name |
| project_id | TEXT NOT NULL | GCP project ID |
| purpose | TEXT DEFAULT 'production' | Production/Staging/Development |
| credentials_json | TEXT | Encrypted service account key |
| services | TEXT DEFAULT '[]' | JSON array of enabled services |
| last_scan_at | TEXT | ISO timestamp of last scan |
| created_at | TEXT NOT NULL | ISO timestamp |
| status | TEXT DEFAULT 'active' | active/disconnected/error |

### cloud_assets
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| cloud_account_id | TEXT FK | References cloud_accounts |
| asset_type | TEXT NOT NULL | compute_instance/cloud_run/cloud_sql/gcs_bucket/firewall_rule |
| name | TEXT NOT NULL | Resource name |
| region | TEXT | GCP region/zone |
| metadata_json | TEXT DEFAULT '{}' | Provider-specific details |
| discovered_at | TEXT NOT NULL | ISO timestamp |

### cloud_issues
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| cloud_account_id | TEXT FK | References cloud_accounts |
| asset_id | TEXT FK | References cloud_assets (nullable) |
| rule_code | TEXT NOT NULL | gcp_001, gcp_002, etc. |
| title | TEXT NOT NULL | Issue title |
| description | TEXT | Detailed description |
| severity | TEXT NOT NULL | critical/high/medium/low |
| location | TEXT | Resource location string |
| fix_time | TEXT | Estimated fix time |
| status | TEXT DEFAULT 'todo' | todo/in_progress/ignored/solved |
| discovered_at | TEXT NOT NULL | ISO timestamp |

### cloud_checks
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| provider | TEXT DEFAULT 'gcp' | Cloud provider |
| rule_code | TEXT NOT NULL UNIQUE | gcp_001 |
| title | TEXT NOT NULL | Check title |
| description | TEXT | What the check verifies |
| category | TEXT | standard/advanced/custom |
| check_function | TEXT NOT NULL | Python function name |

## GCP Compliance Checks

| Rule | Title | Service | What It Checks |
|------|-------|---------|----------------|
| gcp_001 | Project should have org-level MFA | IAM | Org-wide 2FA enforcement |
| gcp_002 | Firewall allows unrestricted SSH | Compute | 0.0.0.0/0 to port 22 |
| gcp_003 | Service account keys older than 90 days | IAM | Key rotation policy |
| gcp_004 | GCS buckets are publicly accessible | Storage | Bucket IAM/ACL |
| gcp_005 | Cloud SQL publicly accessible | Cloud SQL | Authorized networks |
| gcp_006 | Instances use default service account | Compute | Instance service account |
| gcp_007 | Cloud SQL backups not enabled | Cloud SQL | Backup configuration |
| gcp_008 | VPC flow logs disabled | Networking | Subnet flow log settings |
| gcp_009 | OS Login not enabled | Compute | Project metadata |
| gcp_010 | API keys not restricted | IAM | Key restrictions |

## GCP Scanner Backend

New module: `api/gcp_scanner.py`

### Asset Discovery
Uses Google Cloud Python client libraries:
- `google-cloud-compute` — Compute Engine instances, firewall rules
- `google-cloud-storage` — GCS buckets
- `google-cloud-resource-manager` — Project metadata
- `google-cloud-sqladmin` (or REST) — Cloud SQL instances
- `google-cloud-run` — Cloud Run services

### Scan Flow
1. User clicks "Start Scan" on cloud detail page
2. Backend iterates enabled services in parallel
3. For each service: discover assets → run compliance checks → save issues
4. Optionally fetches Cloud Logging → feeds into existing LangGraph pipeline
5. Returns scan summary (issue counts by severity)

## Frontend Components

### Cloud List Page (`/clouds`)
- Header: "Clouds" + "N connected clouds" badge
- "Connect Cloud" button (top-right, purple)
- Search bar + "Search Cloud Assets" button
- Table columns: Type (GCP icon) | Name | Purpose | Project ID | Issues (severity color badges) | Ignored | Last scan

### Cloud Detail Page (`/clouds/[id]`)
Header: Cloud name + issue count badge + "Configure" gear + provider badge + "Start Scan" button

**Issues Tab** (default):
- Table: Type icon | Name + description | Severity badge | Location | Fix time | Status pill (To Do/In Progress/Ignored/Solved)
- Filters: All types dropdown, severity filter, search
- Actions dropdown (bulk operations)
- Row click → slide-out detail panel

**Assets Tab**:
- Table: Type icon | Name | Region | Status | # Issues
- Filter by asset type

**Virtual Machines Tab**:
- Table: Name (zone + instance count) | # Open | # Ignored | Severity | Purpose | Last scan
- "Scan VMs" + "Disconnect VMs" buttons

**Checks Tab**:
- Sub-tabs: Standard | Advanced | Custom
- Table: Rule code | Title | Description | Compliance (Compliant/Non-compliant badge)
- Search bar

**Configure Modal** (triggered by gear icon):
- Edit: name, purpose, credentials
- Delete cloud button (red, bottom-left)

## Hybrid Engine

The system combines:
1. **Config scanning** — Direct GCP API queries to check resource configurations against compliance rules (fast, deterministic)
2. **Log-based threat detection** — GCP Cloud Logging entries fed into the existing LangGraph pipeline (Ingest → Detect → Validate → Classify → Report)

Issues from both sources appear in the Issues tab with appropriate type icons.

## Tech Stack Additions

### Python packages
- `google-cloud-compute>=1.0.0`
- `google-cloud-storage>=2.0.0`
- `google-cloud-resource-manager>=1.0.0`
- `google-cloud-run>=0.10.0`
- `cryptography>=41.0.0` (for credential encryption)

### New backend files
- `api/gcp_scanner.py` — Asset discovery + compliance checking
- `api/routers/clouds.py` — CRUD endpoints for cloud accounts, assets, issues, checks
- `api/cloud_database.py` — Database operations for new tables

### New frontend files
- `frontend/src/app/(dashboard)/clouds/page.tsx` — Cloud list
- `frontend/src/app/(dashboard)/clouds/connect/page.tsx` — Connect wizard
- `frontend/src/app/(dashboard)/clouds/[id]/page.tsx` — Cloud detail (Issues)
- `frontend/src/app/(dashboard)/clouds/[id]/assets/page.tsx`
- `frontend/src/app/(dashboard)/clouds/[id]/virtual-machines/page.tsx`
- `frontend/src/app/(dashboard)/clouds/[id]/checks/page.tsx`
- `frontend/src/components/CloudConfigModal.tsx`
- `frontend/src/components/IssueDetailPanel.tsx`

### Modified files
- `frontend/src/components/Sidebar.tsx` — Replace Log Sources with Clouds
- `frontend/src/lib/api.ts` — Add cloud API client functions
- `frontend/src/lib/types.ts` — Add CloudAccount, CloudAsset, CloudIssue, CloudCheck types
- `api/main.py` — Register clouds router
- `api/database.py` — Add cloud tables migration
