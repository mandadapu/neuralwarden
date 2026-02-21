"""GitHub Scanner -- deterministic code scanning for GitHub repositories.

Clones repos via the GitHub API, then runs regex-based scanners for
secrets, vulnerable dependencies, and dangerous code patterns.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_API = "https://api.github.com"

# Directories to skip when walking repo files
_SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", "vendor", "dist", "build"}

# Max file size to scan (1 MB)
_MAX_FILE_SIZE = 1_048_576


# ── GitHub API helpers ─────────────────────────────────────────────


def _gh_headers() -> Dict[str, str]:
    """Return standard headers for GitHub API requests."""
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "NeuralWarden-Scanner/1.0",
    }


def get_authenticated_user() -> Dict[str, Any]:
    """GET /user -- return the authenticated user's profile."""
    resp = httpx.get(f"{GITHUB_API}/user", headers=_gh_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def list_user_orgs() -> List[Dict[str, Any]]:
    """GET /user/orgs -- return organisations the authenticated user belongs to."""
    resp = httpx.get(f"{GITHUB_API}/user/orgs", headers=_gh_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def list_org_repos(org: str) -> List[Dict[str, Any]]:
    """Return all repos for *org*, paginating through all pages.

    Falls back to ``GET /users/{org}/repos`` if the org endpoint 404s
    (happens for personal accounts).
    """
    repos: List[Dict[str, Any]] = []
    page = 1

    while True:
        resp = httpx.get(
            f"{GITHUB_API}/orgs/{org}/repos",
            headers=_gh_headers(),
            params={"per_page": 100, "page": page},
            timeout=30,
        )

        # Fall back to user repos endpoint for personal accounts
        if resp.status_code == 404:
            return _list_user_repos_fallback(org)

        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        repos.extend(batch)
        page += 1

    return repos


def _list_user_repos_fallback(user: str) -> List[Dict[str, Any]]:
    """GET /users/{user}/repos -- fallback when org endpoint 404s."""
    repos: List[Dict[str, Any]] = []
    page = 1

    while True:
        resp = httpx.get(
            f"{GITHUB_API}/users/{user}/repos",
            headers=_gh_headers(),
            params={"per_page": 100, "page": page},
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        repos.extend(batch)
        page += 1

    return repos


# ── Clone / cleanup ───────────────────────────────────────────────


def clone_repo(repo_full_name: str, branch: str = "main") -> str:
    """Shallow-clone a repo into a temporary directory and return its path.

    Uses ``GITHUB_TOKEN`` for authentication.  If the requested *branch*
    does not exist, retries without ``--branch`` to get the default branch.
    """
    temp_dir = tempfile.mkdtemp(prefix="nw_scan_")
    clone_url = f"https://{GITHUB_TOKEN}@github.com/{repo_full_name}.git"

    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, clone_url, temp_dir],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError:
        # Branch may not exist -- retry without --branch to get the default
        shutil.rmtree(temp_dir, ignore_errors=True)
        temp_dir = tempfile.mkdtemp(prefix="nw_scan_")
        subprocess.run(
            ["git", "clone", "--depth", "1", clone_url, temp_dir],
            check=True,
            capture_output=True,
            text=True,
        )

    return temp_dir


def cleanup_clone(temp_dir: str) -> None:
    """Remove a cloned repo directory."""
    shutil.rmtree(temp_dir, ignore_errors=True)


# ── File walker ───────────────────────────────────────────────────


def _walk_files(repo_dir: str):
    """Yield ``(relative_path, absolute_path)`` for scannable files."""
    root = Path(repo_dir)
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skipped directories in-place
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for fname in filenames:
            abs_path = Path(dirpath) / fname
            rel_path = abs_path.relative_to(root)
            yield str(rel_path), str(abs_path)


def _read_lines(abs_path: str) -> List[str]:
    """Read up to ``_MAX_FILE_SIZE`` bytes from a file and return lines."""
    try:
        size = os.path.getsize(abs_path)
        if size > _MAX_FILE_SIZE:
            return []
        with open(abs_path, "r", errors="replace") as fh:
            return fh.readlines()
    except (OSError, UnicodeDecodeError):
        return []


# ── Secrets scanner ───────────────────────────────────────────────

_SECRET_PATTERNS: List[Tuple[re.Pattern, str, str, str]] = [
    (
        re.compile(r"AKIA[0-9A-Z]{16}"),
        "secret_001",
        "critical",
        "AWS Access Key ID found",
    ),
    (
        re.compile(r"(?i)aws_secret_access_key\s*[=:]\s*[A-Za-z0-9/+=]{40}"),
        "secret_002",
        "critical",
        "AWS Secret Access Key found",
    ),
    (
        re.compile(r"gh[ps]_[A-Za-z0-9_]{36,}"),
        "secret_003",
        "high",
        "GitHub personal access token found",
    ),
    (
        re.compile(r"(?i)(api[_-]?key|apikey)\s*[=:]\s*['\"][A-Za-z0-9]{20,}['\"]"),
        "secret_004",
        "high",
        "Generic API key found",
    ),
    (
        re.compile(r"-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----"),
        "secret_005",
        "critical",
        "Private key file detected",
    ),
    (
        re.compile(r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{8,}['\"]"),
        "secret_006",
        "high",
        "Hardcoded password in source code",
    ),
    (
        re.compile(r"(?i)(mysql|postgres|mongodb|redis)://[^\s'\"]+"),
        "secret_007",
        "high",
        "Database connection URL with credentials",
    ),
]


def scan_secrets(repo_dir: str, repo_full_name: str) -> List[Dict[str, Any]]:
    """Scan files for hardcoded secrets and credentials."""
    issues: List[Dict[str, Any]] = []

    for rel_path, abs_path in _walk_files(repo_dir):
        lines = _read_lines(abs_path)
        for line_no, line in enumerate(lines, start=1):
            for pattern, rule_code, severity, title in _SECRET_PATTERNS:
                if pattern.search(line):
                    issues.append(
                        {
                            "rule_code": rule_code,
                            "title": title,
                            "description": (
                                f"Potential secret detected in {rel_path} at line {line_no}. "
                                f"Matched pattern for {title.lower()}."
                            ),
                            "severity": severity,
                            "location": f"{rel_path}:{line_no}",
                            "repo_full_name": repo_full_name,
                            "category": "secrets",
                        }
                    )

    return issues


# ── Dependency scanner ────────────────────────────────────────────

# (package_name, vulnerable_version_check, rule_code, severity, description)
_NPM_VULN_PACKAGES: List[Tuple[str, Callable[[str], bool], str, str, str]] = [
    (
        "lodash",
        lambda v: _version_lt(v, "4.17.21"),
        "dep_001",
        "high",
        "lodash < 4.17.21 has prototype pollution vulnerability (CVE-2021-23337)",
    ),
    (
        "minimist",
        lambda v: _version_lt(v, "1.2.6"),
        "dep_002",
        "high",
        "minimist < 1.2.6 has prototype pollution vulnerability (CVE-2021-44906)",
    ),
    (
        "node-fetch",
        lambda v: _version_lt(v, "2.6.7"),
        "dep_003",
        "medium",
        "node-fetch < 2.6.7 has exposure of sensitive information (CVE-2022-0235)",
    ),
]

_PIP_VULN_PACKAGES: List[Tuple[str, Callable[[str], bool], str, str, str]] = [
    (
        "flask",
        lambda v: _version_lt(v, "2.3.0"),
        "dep_004",
        "high",
        "Flask < 2.3.0 has multiple security advisories",
    ),
    (
        "django",
        lambda v: _version_lt(v, "4.2"),
        "dep_005",
        "critical",
        "Django < 4.2 has known security vulnerabilities",
    ),
    (
        "requests",
        lambda v: _version_lt(v, "2.31.0"),
        "dep_006",
        "medium",
        "requests < 2.31.0 has information disclosure vulnerability (CVE-2023-32681)",
    ),
    (
        "pyyaml",
        lambda v: _version_lt(v, "6.0"),
        "dep_007",
        "high",
        "PyYAML < 6.0 has arbitrary code execution vulnerability",
    ),
]


def _version_lt(version_str: str, target: str) -> bool:
    """Naive version comparison: return True if *version_str* < *target*.

    Strips leading caret/tilde/equals/spaces, compares integer tuples.
    Returns False on any parse error so we don't create false positives.
    """
    cleaned = re.sub(r"^[\^~>=<!\s]+", "", version_str.strip())
    try:
        v_parts = [int(x) for x in cleaned.split(".")]
        t_parts = [int(x) for x in target.split(".")]
        # Pad shorter list with zeros
        max_len = max(len(v_parts), len(t_parts))
        v_parts.extend([0] * (max_len - len(v_parts)))
        t_parts.extend([0] * (max_len - len(t_parts)))
        return v_parts < t_parts
    except (ValueError, AttributeError):
        return False


def scan_dependencies(repo_dir: str, repo_full_name: str) -> List[Dict[str, Any]]:
    """Scan manifest files for known vulnerable dependency versions."""
    issues: List[Dict[str, Any]] = []
    root = Path(repo_dir)

    # ── package.json (npm) ────────────────────────────────────────
    for pkg_json in root.rglob("package.json"):
        if any(part in _SKIP_DIRS for part in pkg_json.parts):
            continue
        try:
            data = json.loads(pkg_json.read_text(errors="replace"))
        except (json.JSONDecodeError, OSError):
            continue

        all_deps: Dict[str, str] = {}
        all_deps.update(data.get("dependencies", {}))
        all_deps.update(data.get("devDependencies", {}))

        rel_manifest = str(pkg_json.relative_to(root))

        for pkg_name, check_fn, rule_code, severity, desc in _NPM_VULN_PACKAGES:
            if pkg_name in all_deps and check_fn(all_deps[pkg_name]):
                issues.append(
                    {
                        "rule_code": rule_code,
                        "title": f"Vulnerable npm package: {pkg_name}",
                        "description": desc,
                        "severity": severity,
                        "location": f"{rel_manifest}:{pkg_name}",
                        "repo_full_name": repo_full_name,
                        "category": "dependencies",
                    }
                )

        # Check for missing lockfile
        pkg_dir = pkg_json.parent
        has_lock = (
            (pkg_dir / "package-lock.json").exists()
            or (pkg_dir / "yarn.lock").exists()
            or (pkg_dir / "pnpm-lock.yaml").exists()
        )
        if not has_lock:
            issues.append(
                {
                    "rule_code": "dep_010",
                    "title": "Missing npm lockfile",
                    "description": (
                        f"No package-lock.json, yarn.lock, or pnpm-lock.yaml found "
                        f"alongside {rel_manifest}. Builds may be non-reproducible."
                    ),
                    "severity": "low",
                    "location": f"{rel_manifest}:lockfile",
                    "repo_full_name": repo_full_name,
                    "category": "dependencies",
                }
            )

    # ── requirements.txt (pip) ────────────────────────────────────
    for req_txt in root.rglob("requirements*.txt"):
        if any(part in _SKIP_DIRS for part in req_txt.parts):
            continue
        try:
            content = req_txt.read_text(errors="replace")
        except OSError:
            continue

        rel_manifest = str(req_txt.relative_to(root))

        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Parse "package==version" or "package>=version" etc.
            match = re.match(r"^([A-Za-z0-9_.-]+)\s*[=<>!~]+\s*(.+)", line)
            if not match:
                continue
            pkg_name = match.group(1).lower()
            pkg_version = match.group(2).strip()

            for vuln_name, check_fn, rule_code, severity, desc in _PIP_VULN_PACKAGES:
                if pkg_name == vuln_name and check_fn(pkg_version):
                    issues.append(
                        {
                            "rule_code": rule_code,
                            "title": f"Vulnerable Python package: {pkg_name}",
                            "description": desc,
                            "severity": severity,
                            "location": f"{rel_manifest}:{pkg_name}",
                            "repo_full_name": repo_full_name,
                            "category": "dependencies",
                        }
                    )

        # Check for missing poetry lockfile alongside pyproject.toml
        req_dir = req_txt.parent
        if (req_dir / "pyproject.toml").exists() and not (req_dir / "poetry.lock").exists():
            issues.append(
                {
                    "rule_code": "dep_010",
                    "title": "Missing Poetry lockfile",
                    "description": (
                        f"No poetry.lock found alongside pyproject.toml in "
                        f"{str(req_dir.relative_to(root))}. Builds may be non-reproducible."
                    ),
                    "severity": "low",
                    "location": f"{rel_manifest}:lockfile",
                    "repo_full_name": repo_full_name,
                    "category": "dependencies",
                }
            )

    return issues


# ── Code patterns scanner ─────────────────────────────────────────

_CODE_PATTERNS: List[Tuple[re.Pattern, str, str, str]] = [
    (
        re.compile(
            r"(?i)(execute|query)\s*\([^)]*['\"]"
            r"\s*\+|f['\"](SELECT|INSERT|UPDATE|DELETE)"
        ),
        "code_001",
        "high",
        "Potential SQL injection via string concatenation",
    ),
    (
        re.compile(r"(?i)innerHTML\s*=|document\.write\s*\(|\.html\s*\([^)]*\+"),
        "code_002",
        "high",
        "Potential XSS via unsafe DOM manipulation",
    ),
    (
        re.compile(
            r"(?i)(os\.system|subprocess\.call|exec)\s*\([^)]*\+|(?i)child_process"
        ),
        "code_003",
        "critical",
        "Potential command injection via dynamic process execution",
    ),
    (
        # Detects insecure deserialization patterns in scanned code
        re.compile(r"(?i)(pickle\.loads?|yaml\.load\s*\()(?!.*Loader)"),
        "code_004",
        "high",
        "Insecure deserialization without safe loader",
    ),
    (
        re.compile(r"(?i)DEBUG\s*=\s*True|app\.debug\s*=\s*True"),
        "code_005",
        "medium",
        "Debug mode enabled in configuration",
    ),
    (
        re.compile(r"(?i)(Access-Control-Allow-Origin|cors).*\*"),
        "code_006",
        "medium",
        "CORS wildcard allows requests from any origin",
    ),
    (
        re.compile(
            r"(?i)(host|url|endpoint)\s*[=:]\s*['\"]https?://(localhost|127\.0\.0\.1)"
        ),
        "code_007",
        "low",
        "Hardcoded localhost/127.0.0.1 in configuration",
    ),
]


def scan_code_patterns(repo_dir: str, repo_full_name: str) -> List[Dict[str, Any]]:
    """Scan source files for dangerous code patterns."""
    issues: List[Dict[str, Any]] = []

    for rel_path, abs_path in _walk_files(repo_dir):
        lines = _read_lines(abs_path)
        for line_no, line in enumerate(lines, start=1):
            for pattern, rule_code, severity, title in _CODE_PATTERNS:
                if pattern.search(line):
                    issues.append(
                        {
                            "rule_code": rule_code,
                            "title": title,
                            "description": (
                                f"Detected in {rel_path} at line {line_no}: "
                                f"{title.lower()}."
                            ),
                            "severity": severity,
                            "location": f"{rel_path}:{line_no}",
                            "repo_full_name": repo_full_name,
                            "category": "code_patterns",
                        }
                    )

    return issues


# ── Orchestrator ──────────────────────────────────────────────────


def run_repo_scan(
    connection_id: str,
    org_name: str,
    repos: List[Dict[str, Any]],
    scan_config: Dict[str, Any] | None = None,
    progress_callback: Callable[[str, Any], None] | None = None,
) -> Dict[str, Any]:
    """Scan a list of repositories and return aggregated results.

    Parameters
    ----------
    connection_id:
        The cloud_account ID that owns this GitHub connection.
    org_name:
        Organisation or user name the repos belong to.
    repos:
        List of repo dicts (from GitHub API) to scan.
    scan_config:
        Which scan types to enable.  Defaults to all enabled.
    progress_callback:
        Optional ``(stage, detail)`` callback for progress tracking.

    Returns
    -------
    dict with keys ``issues``, ``assets``, ``summary``.
    """
    if scan_config is None:
        scan_config = {"secrets": True, "dependencies": True, "code_patterns": True}

    all_issues: List[Dict[str, Any]] = []
    repo_assets: List[Dict[str, Any]] = []
    by_type: Dict[str, int] = {"secrets": 0, "dependencies": 0, "code_patterns": 0}

    for idx, repo in enumerate(repos):
        repo_full_name = repo.get("full_name", f"{org_name}/{repo.get('name', 'unknown')}")
        repo_name = repo.get("name", "unknown")
        default_branch = repo.get("default_branch", "main")

        if progress_callback:
            progress_callback(
                "scanning_repo",
                {"repo": repo_full_name, "index": idx + 1, "total": len(repos)},
            )

        logger.info("Scanning repo %s (%d/%d)", repo_full_name, idx + 1, len(repos))

        temp_dir: Optional[str] = None
        try:
            temp_dir = clone_repo(repo_full_name, branch=default_branch)

            if scan_config.get("secrets"):
                found = scan_secrets(temp_dir, repo_full_name)
                all_issues.extend(found)
                by_type["secrets"] += len(found)

            if scan_config.get("dependencies"):
                found = scan_dependencies(temp_dir, repo_full_name)
                all_issues.extend(found)
                by_type["dependencies"] += len(found)

            if scan_config.get("code_patterns"):
                found = scan_code_patterns(temp_dir, repo_full_name)
                all_issues.extend(found)
                by_type["code_patterns"] += len(found)

        except Exception as exc:
            logger.error("Failed to scan %s [%s]: %s", repo_full_name, type(exc).__name__, exc)
            # Record the failure but continue with remaining repos
            all_issues.append(
                {
                    "rule_code": "scan_error",
                    "title": f"Scan failed for {repo_full_name}",
                    "description": f"Error during scan: {type(exc).__name__}: {exc}",
                    "severity": "low",
                    "location": repo_full_name,
                    "repo_full_name": repo_full_name,
                    "category": "scan_error",
                }
            )
        finally:
            if temp_dir:
                cleanup_clone(temp_dir)

        # Build asset record for this repo
        repo_assets.append(
            {
                "repo_full_name": repo_full_name,
                "repo_name": repo_name,
                "language": repo.get("language", ""),
                "default_branch": default_branch,
                "is_private": repo.get("private", False),
                "metadata_json": json.dumps(
                    {
                        "stars": repo.get("stargazers_count", 0),
                        "forks": repo.get("forks_count", 0),
                        "size_kb": repo.get("size", 0),
                        "archived": repo.get("archived", False),
                        "topics": repo.get("topics", []),
                        "updated_at": repo.get("updated_at", ""),
                    }
                ),
            }
        )

    summary = {
        "repos_scanned": len(repos),
        "total_issues": len(all_issues),
        "by_type": by_type,
    }

    if progress_callback:
        progress_callback("scan_complete", summary)

    return {
        "issues": all_issues,
        "assets": repo_assets,
        "summary": summary,
    }


# ── Sample data generator ────────────────────────────────────────


def generate_sample_data(connection_id: str) -> Dict[str, Any]:
    """Return sample scan results for demo/sample workspaces.

    Produces realistic-looking issues and assets for three fictitious
    repositories without performing any actual cloning or scanning.
    """
    now = datetime.now(timezone.utc).isoformat()

    sample_repos = [
        {
            "repo_full_name": "acme-corp/web-dashboard",
            "repo_name": "web-dashboard",
            "language": "TypeScript",
            "default_branch": "main",
            "is_private": False,
            "metadata_json": json.dumps(
                {
                    "stars": 42,
                    "forks": 8,
                    "size_kb": 15200,
                    "archived": False,
                    "topics": ["react", "dashboard"],
                    "updated_at": now,
                }
            ),
        },
        {
            "repo_full_name": "acme-corp/backend-api",
            "repo_name": "backend-api",
            "language": "Python",
            "default_branch": "main",
            "is_private": True,
            "metadata_json": json.dumps(
                {
                    "stars": 15,
                    "forks": 3,
                    "size_kb": 8400,
                    "archived": False,
                    "topics": ["fastapi", "python"],
                    "updated_at": now,
                }
            ),
        },
        {
            "repo_full_name": "acme-corp/infra-scripts",
            "repo_name": "infra-scripts",
            "language": "Shell",
            "default_branch": "main",
            "is_private": True,
            "metadata_json": json.dumps(
                {
                    "stars": 2,
                    "forks": 0,
                    "size_kb": 320,
                    "archived": False,
                    "topics": ["devops", "infrastructure"],
                    "updated_at": now,
                }
            ),
        },
    ]

    sample_issues = [
        # Secrets
        {
            "rule_code": "secret_001",
            "title": "AWS Access Key ID found",
            "description": (
                "Potential secret detected in src/config/aws.ts at line 12. "
                "Matched pattern for AWS access key ID."
            ),
            "severity": "critical",
            "location": "src/config/aws.ts:12",
            "repo_full_name": "acme-corp/web-dashboard",
            "category": "secrets",
        },
        {
            "rule_code": "secret_006",
            "title": "Hardcoded password in source code",
            "description": (
                "Potential secret detected in tests/fixtures/config.py at line 45. "
                "Matched pattern for hardcoded password."
            ),
            "severity": "high",
            "location": "tests/fixtures/config.py:45",
            "repo_full_name": "acme-corp/backend-api",
            "category": "secrets",
        },
        {
            "rule_code": "secret_007",
            "title": "Database connection URL with credentials",
            "description": (
                "Potential secret detected in deploy/docker-compose.yml at line 8. "
                "Matched pattern for database connection URL."
            ),
            "severity": "high",
            "location": "deploy/docker-compose.yml:8",
            "repo_full_name": "acme-corp/infra-scripts",
            "category": "secrets",
        },
        {
            "rule_code": "secret_005",
            "title": "Private key file detected",
            "description": (
                "Potential secret detected in certs/server.key at line 1. "
                "Matched pattern for private key."
            ),
            "severity": "critical",
            "location": "certs/server.key:1",
            "repo_full_name": "acme-corp/infra-scripts",
            "category": "secrets",
        },
        # Dependencies
        {
            "rule_code": "dep_001",
            "title": "Vulnerable npm package: lodash",
            "description": "lodash < 4.17.21 has prototype pollution vulnerability (CVE-2021-23337)",
            "severity": "high",
            "location": "package.json:lodash",
            "repo_full_name": "acme-corp/web-dashboard",
            "category": "dependencies",
        },
        {
            "rule_code": "dep_004",
            "title": "Vulnerable Python package: flask",
            "description": "Flask < 2.3.0 has multiple security advisories",
            "severity": "high",
            "location": "requirements.txt:flask",
            "repo_full_name": "acme-corp/backend-api",
            "category": "dependencies",
        },
        {
            "rule_code": "dep_010",
            "title": "Missing npm lockfile",
            "description": (
                "No package-lock.json, yarn.lock, or pnpm-lock.yaml found "
                "alongside package.json. Builds may be non-reproducible."
            ),
            "severity": "low",
            "location": "package.json:lockfile",
            "repo_full_name": "acme-corp/web-dashboard",
            "category": "dependencies",
        },
        # Code patterns
        {
            "rule_code": "code_001",
            "title": "Potential SQL injection via string concatenation",
            "description": (
                "Detected in src/db/queries.py at line 34: "
                "potential SQL injection via string concatenation."
            ),
            "severity": "high",
            "location": "src/db/queries.py:34",
            "repo_full_name": "acme-corp/backend-api",
            "category": "code_patterns",
        },
        {
            "rule_code": "code_002",
            "title": "Potential XSS via unsafe DOM manipulation",
            "description": (
                "Detected in src/components/RichText.tsx at line 67: "
                "potential XSS via unsafe DOM manipulation."
            ),
            "severity": "high",
            "location": "src/components/RichText.tsx:67",
            "repo_full_name": "acme-corp/web-dashboard",
            "category": "code_patterns",
        },
        {
            "rule_code": "code_005",
            "title": "Debug mode enabled in configuration",
            "description": (
                "Detected in src/settings.py at line 5: "
                "debug mode enabled in configuration."
            ),
            "severity": "medium",
            "location": "src/settings.py:5",
            "repo_full_name": "acme-corp/backend-api",
            "category": "code_patterns",
        },
        {
            "rule_code": "code_003",
            "title": "Potential command injection via dynamic process execution",
            "description": (
                "Detected in scripts/deploy.sh at line 22: "
                "potential command injection via dynamic process execution."
            ),
            "severity": "critical",
            "location": "scripts/deploy.sh:22",
            "repo_full_name": "acme-corp/infra-scripts",
            "category": "code_patterns",
        },
        {
            "rule_code": "code_006",
            "title": "CORS wildcard allows requests from any origin",
            "description": (
                "Detected in src/main.py at line 18: "
                "CORS wildcard allows requests from any origin."
            ),
            "severity": "medium",
            "location": "src/main.py:18",
            "repo_full_name": "acme-corp/backend-api",
            "category": "code_patterns",
        },
    ]

    summary = {
        "repos_scanned": 3,
        "total_issues": len(sample_issues),
        "by_type": {
            "secrets": 4,
            "dependencies": 3,
            "code_patterns": 5,
        },
    }

    return {
        "issues": sample_issues,
        "assets": sample_repos,
        "summary": summary,
    }
