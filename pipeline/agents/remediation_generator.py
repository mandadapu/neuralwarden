"""Remediation Script Generator — deterministic gcloud command mapping.

Maps rule_codes from cloud scan issues to parameterized gcloud
remediation scripts. No LLM needed — pure template-based generation.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

# ── Remediation templates per rule_code ─────────────────────────────

REMEDIATION_TEMPLATES: Dict[str, Dict[str, str]] = {
    "gcp_002": {
        "title": "Restrict SSH firewall rule to trusted CIDRs",
        "script": "gcloud compute firewall-rules update {asset} --source-ranges='YOUR_OFFICE_IP/32'",
        "notes": "Replace YOUR_OFFICE_IP with your actual office/VPN IP address.",
    },
    "gcp_004": {
        "title": "Remove public access from GCS bucket",
        "script": "gcloud storage buckets update gs://{asset} --public-access-prevention=enforced",
        "notes": (
            "This will block all public access. "
            "Ensure no public-facing content depends on this bucket."
        ),
    },
    "gcp_006": {
        "title": "Migrate from default service account",
        "script": (
            "# Step 1: Create a custom service account\n"
            "gcloud iam service-accounts create {asset}-sa \\\n"
            "  --display-name='{asset} custom SA'\n"
            "\n"
            "# Step 2: Grant minimum required roles\n"
            "# gcloud projects add-iam-policy-binding {project_id} \\\n"
            "#   --member='serviceAccount:{asset}-sa@{project_id}.iam.gserviceaccount.com' \\\n"
            "#   --role='roles/REQUIRED_ROLE'\n"
            "\n"
            "# Step 3: Update the instance to use the new SA (requires stop/start)\n"
            "# gcloud compute instances set-service-account {asset} \\\n"
            "#   --service-account={asset}-sa@{project_id}.iam.gserviceaccount.com \\\n"
            "#   --zone=ZONE"
        ),
        "notes": (
            "Manual migration recommended. Replace REQUIRED_ROLE and ZONE "
            "with actual values. Commented steps require careful review."
        ),
    },
    "log_001": {
        "title": "Investigate high error rate",
        "script": (
            "# Fetch recent errors for investigation\n"
            "gcloud logging read 'severity>=ERROR' \\\n"
            "  --project={project_id} --limit=50 --format=json\n"
            "\n"
            "# Check for specific error patterns\n"
            "gcloud logging read 'severity>=ERROR AND timestamp>=\"$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)\"' \\\n"
            "  --project={project_id} --format='table(timestamp,severity,textPayload)'"
        ),
        "notes": (
            "This is a diagnostic command, not a fix. "
            "Review the error logs to identify and address the root cause."
        ),
    },
    "log_002": {
        "title": "Enable audit logging and investigate auth failures",
        "script": (
            "# View recent authentication failures\n"
            "gcloud logging read 'protoPayload.status.code=7 OR protoPayload.status.code=16' \\\n"
            "  --project={project_id} --limit=50 --format=json\n"
            "\n"
            "# Enable Data Access audit logging\n"
            "gcloud projects get-iam-policy {project_id} --format=json > /tmp/iam-policy.json\n"
            "# Edit /tmp/iam-policy.json to add auditConfigs, then apply:\n"
            "# gcloud projects set-iam-policy {project_id} /tmp/iam-policy.json"
        ),
        "notes": (
            "Review authentication failure sources before taking action. "
            "Enable audit logs for forensic analysis."
        ),
    },
    "log_003": {
        "title": "Deploy Cloud Armor WAF rules to block recon probes",
        "script": (
            "# Create a Cloud Armor security policy\n"
            "gcloud compute security-policies create block-recon \\\n"
            "  --description='Block reconnaissance probes'\n"
            "\n"
            "# Block known recon paths\n"
            "gcloud compute security-policies rules create 1000 \\\n"
            "  --security-policy=block-recon \\\n"
            "  --expression=\"request.path.matches('/(\\\\.env|\\\\.git|wp-admin|phpMyAdmin)')\" \\\n"
            "  --action=deny-403\n"
            "\n"
            "# Attach to your backend service\n"
            "# gcloud compute backend-services update BACKEND_SERVICE \\\n"
            "#   --security-policy=block-recon --global"
        ),
        "notes": (
            "Attach this security policy to your backend service. "
            "Adjust paths and backend service name as needed."
        ),
    },
}


def _extract_asset_name(location: str) -> str:
    """Extract the asset name from a location string.

    Examples:
        "Firewall: allow-ssh"  → "allow-ssh"
        "Bucket: my-bucket"    → "my-bucket"
        "Instance: web-vm"     → "web-vm"
        "Cloud Logging"        → "cloud-logging"
    """
    if ":" in location:
        return location.split(":", 1)[1].strip()
    return re.sub(r"[^a-zA-Z0-9_-]", "-", location.strip()).lower()


def generate_remediation(
    issues: List[Dict[str, Any]],
    project_id: str = "PROJECT_ID",
) -> List[Dict[str, Any]]:
    """Generate remediation scripts for a list of cloud scan issues.

    For each issue with a matching rule_code template, adds a
    ``remediation_script`` key containing a ready-to-run bash script.

    Returns the issues list (same references, mutated in place for
    convenience, but also returned).
    """
    for issue in issues:
        rule_code = issue.get("rule_code", "")
        template = REMEDIATION_TEMPLATES.get(rule_code)
        if not template:
            continue

        asset = _extract_asset_name(issue.get("location", ""))

        # Build the full script
        header = (
            "#!/bin/bash\n"
            f"# Remediation: {template['title']}\n"
            f"# Rule: {rule_code}\n"
            f"# Asset: {asset}\n"
            f"# Generated by NeuralWarden AutoFix\n"
            "#\n"
            f"# NOTE: {template['notes']}\n"
            "#\n"
            "set -euo pipefail\n"
            ""
        )
        body = template["script"].format(
            asset=asset,
            project_id=project_id,
        )
        issue["remediation_script"] = header + body

    return issues
