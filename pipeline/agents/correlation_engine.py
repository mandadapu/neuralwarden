"""Correlation Engine — cross-references scanner findings with log activity.

Sits inside the Aggregate Node to detect active exploitation by matching
static vulnerabilities (from Active Scanner) against behavioral signals
(from Log Analyzer).  When overlap is found the issue severity is upgraded
to critical and tagged with a MITRE ATT&CK mapping.
"""

from __future__ import annotations


# --------------- Intelligence Matrix ---------------
# Maps scanner rule_codes to the log patterns that indicate active exploitation.

CORRELATION_RULES: dict[str, dict] = {
    "gcp_002": {
        "log_patterns": [
            "Invalid user",
            "Failed password",
            "Connection closed by authenticating user",
            "refused connect",
        ],
        "verdict": "Brute Force Attempt in Progress",
        "mitre_tactic": "TA0006",       # Credential Access
        "mitre_technique": "T1110",     # Brute Force
    },
    "gcp_004": {
        "log_patterns": [
            "AnonymousAccess",
            "GetObject",
            "storage.objects.get",
            "allUsers",
        ],
        "verdict": "Data Exfiltration Occurring",
        "mitre_tactic": "TA0010",       # Exfiltration
        "mitre_technique": "T1530",     # Data from Cloud Storage Object
    },
    "gcp_006": {
        "log_patterns": [
            "compute@developer.gserviceaccount.com",
            "CreateServiceAccountKey",
            "SetIamPolicy",
        ],
        "verdict": "Privilege Escalation Risk",
        "mitre_tactic": "TA0004",       # Privilege Escalation
        "mitre_technique": "T1078.004", # Valid Accounts: Cloud Accounts
    },
    "log_002": {
        "log_patterns": [
            "Invalid user",
            "brute",
            "Connection refused",
            "unauthorized",
        ],
        "verdict": "Unauthorized Access Attempt",
        "mitre_tactic": "TA0001",       # Initial Access
        "mitre_technique": "T1078",     # Valid Accounts
    },
}


def _extract_resource_name(location: str) -> str:
    """Pull the resource name from an issue location string.

    Locations look like  ``Firewall: allow-ssh``  or  ``GCS: my-bucket``.
    """
    if ": " in location:
        return location.split(": ", 1)[1]
    return location


def correlate_findings(
    scan_issues: list[dict],
    log_lines: list[str],
) -> tuple[list[dict], int]:
    """Cross-reference scan issues with log activity.

    Returns
    -------
    correlated_issues : list[dict]
        Copy of *scan_issues* with matched entries upgraded (severity →
        critical, title prefixed with ``[ACTIVE]``, verdict / MITRE fields
        added).
    active_exploit_count : int
        Number of issues that were correlated with live log activity.
    """
    if not log_lines:
        return list(scan_issues), 0

    active_count = 0
    correlated: list[dict] = []

    for issue in scan_issues:
        rule = CORRELATION_RULES.get(issue.get("rule_code", ""))
        if rule is None:
            correlated.append(issue)
            continue

        resource = _extract_resource_name(issue.get("location", ""))

        # Find log lines mentioning this resource
        related_logs = [
            line for line in log_lines
            if resource.lower() in line.lower()
        ]

        # Check if any known attack pattern appears in those logs
        matched_patterns = [
            p for p in rule["log_patterns"]
            if any(p.lower() in line.lower() for line in related_logs)
        ]

        if matched_patterns:
            upgraded = dict(issue)
            upgraded["severity"] = "critical"
            upgraded["title"] = f"[ACTIVE] {issue['title']}"
            upgraded["description"] = (
                f"{issue['description']}\n\n"
                f"CORRELATED: {rule['verdict']}. "
                f"{len(related_logs)} related log events detected."
            )
            upgraded["correlated"] = True
            upgraded["verdict"] = rule["verdict"]
            upgraded["mitre_tactic"] = rule["mitre_tactic"]
            upgraded["mitre_technique"] = rule["mitre_technique"]
            correlated.append(upgraded)
            active_count += 1
        else:
            correlated.append(issue)

    return correlated, active_count
