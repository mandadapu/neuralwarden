"""SCA (Software Composition Analysis) scanner.

Parses lockfiles from 12 ecosystems, queries OSV.dev for known CVEs,
and scans for copyleft / missing licenses.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

import httpx

logger = logging.getLogger(__name__)

_SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", "vendor", "dist", "build"}
_OSV_API = "https://api.osv.dev/v1/querybatch"
_OSV_BATCH_SIZE = 200
_OSV_TIMEOUT = 30

# ── Lockfile discovery ────────────────────────────────────────────

_LOCKFILE_MAP: Dict[str, str] = {
    "package-lock.json": "npm",
    "yarn.lock": "npm",
    "pnpm-lock.yaml": "npm",
    "Pipfile.lock": "PyPI",
    "poetry.lock": "PyPI",
    "go.sum": "Go",
    "Gemfile.lock": "RubyGems",
    "Cargo.lock": "crates.io",
    "composer.lock": "Packagist",
    "packages.lock.json": "NuGet",
    "pubspec.lock": "Pub",
}


def find_lockfiles(repo_dir: str) -> List[Tuple[str, str, str]]:
    """Walk repo and return ``(abs_path, rel_path, ecosystem)`` for recognised lockfiles."""
    root = Path(repo_dir)
    found: List[Tuple[str, str, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for fname in filenames:
            eco = _LOCKFILE_MAP.get(fname)
            if eco:
                abs_p = os.path.join(dirpath, fname)
                rel_p = str(Path(abs_p).relative_to(root))
                found.append((abs_p, rel_p, eco))
    # Also discover requirements*.txt
    for req in root.rglob("requirements*.txt"):
        if any(part in _SKIP_DIRS for part in req.parts):
            continue
        found.append((str(req), str(req.relative_to(root)), "PyPI"))
    return found


# ── Lockfile parsers ──────────────────────────────────────────────
# Each parser returns List[Dict] with keys: name, version, ecosystem


def _parse_package_lock_json(path: str) -> List[Dict[str, str]]:
    try:
        data = json.loads(Path(path).read_text(errors="replace"))
    except (json.JSONDecodeError, OSError):
        return []

    pkgs: List[Dict[str, str]] = []
    # v2/v3 format: "packages" dict
    packages = data.get("packages", {})
    if packages:
        for key, info in packages.items():
            if not key:  # root entry
                continue
            name = info.get("name") or key.rsplit("node_modules/", 1)[-1]
            version = info.get("version", "")
            if name and version:
                pkgs.append({"name": name, "version": version, "ecosystem": "npm"})
        return pkgs

    # v1 format: "dependencies" dict
    for name, info in data.get("dependencies", {}).items():
        version = info.get("version", "") if isinstance(info, dict) else ""
        if name and version:
            pkgs.append({"name": name, "version": version, "ecosystem": "npm"})
    return pkgs


def _parse_yarn_lock(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        content = Path(path).read_text(errors="replace")
    except OSError:
        return []

    current_name = ""
    for line in content.splitlines():
        # Package header lines like: "lodash@^4.17.20:"
        if not line.startswith(" ") and not line.startswith("#") and "@" in line:
            # Extract name from "name@version:"
            raw = line.rstrip(":").strip().strip('"')
            at_idx = raw.rfind("@")
            if at_idx > 0:
                current_name = raw[:at_idx]
        elif line.strip().startswith("version "):
            version = line.strip().split('"')[1] if '"' in line else line.strip().split()[-1]
            if current_name and version:
                pkgs.append({"name": current_name, "version": version, "ecosystem": "npm"})
                current_name = ""
    return pkgs


def _parse_pnpm_lock(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        content = Path(path).read_text(errors="replace")
    except OSError:
        return []

    # pnpm-lock.yaml uses lines like: /package-name@version:
    # or package-name@version: in v9+
    for line in content.splitlines():
        line = line.strip()
        # Match patterns like /lodash@4.17.21: or lodash@4.17.21:
        match = re.match(r"^/?([^@\s]+)@([^:()\s]+):?\s*$", line)
        if match:
            name, version = match.group(1), match.group(2)
            if name and version and not version.startswith("{"):
                pkgs.append({"name": name, "version": version, "ecosystem": "npm"})
    return pkgs


def _parse_pipfile_lock(path: str) -> List[Dict[str, str]]:
    try:
        data = json.loads(Path(path).read_text(errors="replace"))
    except (json.JSONDecodeError, OSError):
        return []

    pkgs: List[Dict[str, str]] = []
    for section in ("default", "develop"):
        for name, info in data.get(section, {}).items():
            version = info.get("version", "").lstrip("=")
            if name and version:
                pkgs.append({"name": name, "version": version, "ecosystem": "PyPI"})
    return pkgs


def _parse_poetry_lock(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        import tomllib
        data = tomllib.loads(Path(path).read_text(errors="replace"))
    except Exception:
        # Fallback: regex parse
        try:
            content = Path(path).read_text(errors="replace")
        except OSError:
            return []
        for match in re.finditer(r'\[\[package\]\]\s*name\s*=\s*"([^"]+)"\s*version\s*=\s*"([^"]+)"', content, re.DOTALL):
            pkgs.append({"name": match.group(1), "version": match.group(2), "ecosystem": "PyPI"})
        return pkgs

    for pkg in data.get("package", []):
        name = pkg.get("name", "")
        version = pkg.get("version", "")
        if name and version:
            pkgs.append({"name": name, "version": version, "ecosystem": "PyPI"})
    return pkgs


def _parse_requirements_txt(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        content = Path(path).read_text(errors="replace")
    except OSError:
        return []

    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        match = re.match(r"^([A-Za-z0-9_.-]+)\s*[=<>!~]+\s*(.+)", line)
        if match:
            pkgs.append({"name": match.group(1).lower(), "version": match.group(2).strip(), "ecosystem": "PyPI"})
    return pkgs


def _parse_go_sum(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    seen = set()
    try:
        content = Path(path).read_text(errors="replace")
    except OSError:
        return []

    for line in content.splitlines():
        parts = line.strip().split()
        if len(parts) >= 2:
            name = parts[0]
            version = parts[1].split("/")[0].lstrip("v")
            key = (name, version)
            if key not in seen:
                seen.add(key)
                pkgs.append({"name": name, "version": version, "ecosystem": "Go"})
    return pkgs


def _parse_gemfile_lock(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        content = Path(path).read_text(errors="replace")
    except OSError:
        return []

    in_specs = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped == "GEM" or stripped == "specs:":
            in_specs = True
            continue
        if in_specs and stripped == "":
            in_specs = False
            continue
        if in_specs:
            match = re.match(r"^(\S+)\s+\(([^)]+)\)", stripped)
            if match:
                pkgs.append({"name": match.group(1), "version": match.group(2), "ecosystem": "RubyGems"})
    return pkgs


def _parse_cargo_lock(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        import tomllib
        data = tomllib.loads(Path(path).read_text(errors="replace"))
    except Exception:
        # Fallback: regex
        try:
            content = Path(path).read_text(errors="replace")
        except OSError:
            return []
        for match in re.finditer(r'\[\[package\]\]\s*name\s*=\s*"([^"]+)"\s*version\s*=\s*"([^"]+)"', content, re.DOTALL):
            pkgs.append({"name": match.group(1), "version": match.group(2), "ecosystem": "crates.io"})
        return pkgs

    for pkg in data.get("package", []):
        name = pkg.get("name", "")
        version = pkg.get("version", "")
        if name and version:
            pkgs.append({"name": name, "version": version, "ecosystem": "crates.io"})
    return pkgs


def _parse_composer_lock(path: str) -> List[Dict[str, str]]:
    try:
        data = json.loads(Path(path).read_text(errors="replace"))
    except (json.JSONDecodeError, OSError):
        return []

    pkgs: List[Dict[str, str]] = []
    for section in ("packages", "packages-dev"):
        for pkg in data.get(section, []):
            name = pkg.get("name", "")
            version = pkg.get("version", "").lstrip("v")
            if name and version:
                pkgs.append({"name": name, "version": version, "ecosystem": "Packagist"})
    return pkgs


def _parse_nuget_lock(path: str) -> List[Dict[str, str]]:
    try:
        data = json.loads(Path(path).read_text(errors="replace"))
    except (json.JSONDecodeError, OSError):
        return []

    pkgs: List[Dict[str, str]] = []
    for framework, deps in data.get("dependencies", {}).items():
        for name, info in deps.items():
            version = info.get("resolved", "") if isinstance(info, dict) else ""
            if name and version:
                pkgs.append({"name": name, "version": version, "ecosystem": "NuGet"})
    return pkgs


def _parse_pubspec_lock(path: str) -> List[Dict[str, str]]:
    pkgs: List[Dict[str, str]] = []
    try:
        content = Path(path).read_text(errors="replace")
    except OSError:
        return []

    # Simple YAML parse for pubspec.lock
    current_name = ""
    for line in content.splitlines():
        # Package name lines are at 2-space indent
        name_match = re.match(r"^  (\S+):$", line)
        if name_match:
            current_name = name_match.group(1)
            continue
        # Version lines at 4-space indent
        ver_match = re.match(r'^    version: "?([^"]+)"?$', line)
        if ver_match and current_name:
            pkgs.append({"name": current_name, "version": ver_match.group(1).strip(), "ecosystem": "Pub"})
            current_name = ""
    return pkgs


_PARSER_MAP: Dict[str, Any] = {
    "package-lock.json": _parse_package_lock_json,
    "yarn.lock": _parse_yarn_lock,
    "pnpm-lock.yaml": _parse_pnpm_lock,
    "Pipfile.lock": _parse_pipfile_lock,
    "poetry.lock": _parse_poetry_lock,
    "go.sum": _parse_go_sum,
    "Gemfile.lock": _parse_gemfile_lock,
    "Cargo.lock": _parse_cargo_lock,
    "composer.lock": _parse_composer_lock,
    "packages.lock.json": _parse_nuget_lock,
    "pubspec.lock": _parse_pubspec_lock,
}


def _parse_lockfile(abs_path: str, rel_path: str, ecosystem: str) -> List[Dict[str, str]]:
    """Route to the appropriate parser based on filename."""
    fname = Path(abs_path).name
    # requirements*.txt needs special handling
    if fname.startswith("requirements") and fname.endswith(".txt"):
        return _parse_requirements_txt(abs_path)
    parser = _PARSER_MAP.get(fname)
    if parser:
        return parser(abs_path)
    return []


# ── OSV.dev integration ──────────────────────────────────────────


def _query_osv_batch(packages: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Query OSV.dev for vulnerabilities across a batch of packages.

    Returns raw OSV response results list.  Gracefully returns empty on failure.
    """
    queries = []
    for pkg in packages:
        queries.append({
            "version": pkg["version"],
            "package": {
                "name": pkg["name"],
                "ecosystem": pkg["ecosystem"],
            },
        })

    all_results: List[Dict[str, Any]] = []
    # Process in batches of _OSV_BATCH_SIZE
    for i in range(0, len(queries), _OSV_BATCH_SIZE):
        batch = queries[i : i + _OSV_BATCH_SIZE]
        try:
            resp = httpx.post(
                _OSV_API,
                json={"queries": batch},
                timeout=_OSV_TIMEOUT,
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            # results is parallel to queries
            for idx, result in enumerate(results):
                vulns = result.get("vulns", [])
                if vulns:
                    pkg_info = packages[i + idx]
                    for vuln in vulns:
                        all_results.append({"vuln": vuln, "pkg": pkg_info})
        except Exception as exc:
            logger.warning("OSV.dev query failed: %s", exc)
            # Graceful degradation: return what we have so far
            break

    return all_results


def _extract_cvss(vuln: Dict) -> float:
    """Extract best CVSS score from an OSV vulnerability entry."""
    # Check severity array
    for sev in vuln.get("severity", []):
        score_str = sev.get("score", "")
        # CVSS vector may have score embedded
        if score_str:
            # Try to extract numeric CVSS score
            try:
                return float(score_str)
            except ValueError:
                pass
    # Check database_specific
    db = vuln.get("database_specific", {})
    cvss_score = db.get("cvss_score") or db.get("severity_score")
    if cvss_score:
        try:
            return float(cvss_score)
        except (ValueError, TypeError):
            pass
    # Map severity string to approximate score
    severity_str = db.get("severity", "").upper()
    return {"CRITICAL": 9.5, "HIGH": 7.5, "MODERATE": 5.5, "MEDIUM": 5.5, "LOW": 2.5}.get(severity_str, 5.0)


def _cvss_to_severity(score: float) -> str:
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "high"
    if score >= 4.0:
        return "medium"
    return "low"


def _extract_fixed_version(vuln: Dict, pkg_name: str) -> str:
    """Find the earliest fixed version from OSV affected ranges."""
    for affected in vuln.get("affected", []):
        pkg = affected.get("package", {})
        if pkg.get("name", "").lower() == pkg_name.lower():
            for rng in affected.get("ranges", []):
                for event in rng.get("events", []):
                    fixed = event.get("fixed")
                    if fixed:
                        return fixed
    return ""


_UPGRADE_COMMANDS = {
    "npm": "npm install {name}@{version}",
    "PyPI": "pip install {name}>={version}",
    "Go": "go get {name}@v{version}",
    "RubyGems": "bundle update {name}",
    "crates.io": "cargo update -p {name}",
    "Packagist": "composer require {name}:{version}",
    "NuGet": "dotnet add package {name} --version {version}",
    "Pub": "dart pub upgrade {name}",
}


# ── Main SCA scan function ───────────────────────────────────────


def scan_sca(repo_dir: str, repo_full_name: str) -> List[Dict[str, Any]]:
    """Scan repo for vulnerable dependencies via lockfile parsing + OSV.dev.

    Returns a list of issue dicts compatible with ``save_repo_issues()``.
    """
    lockfiles = find_lockfiles(repo_dir)
    if not lockfiles:
        return []

    # Collect all packages with their source lockfile
    all_packages: List[Dict[str, str]] = []
    pkg_lockfile_map: Dict[str, str] = {}  # "name:version:eco" -> rel_path

    for abs_path, rel_path, ecosystem in lockfiles:
        parsed = _parse_lockfile(abs_path, rel_path, ecosystem)
        for pkg in parsed:
            key = f"{pkg['name']}:{pkg['version']}:{pkg['ecosystem']}"
            if key not in pkg_lockfile_map:
                pkg_lockfile_map[key] = rel_path
                all_packages.append(pkg)

    if not all_packages:
        return []

    logger.info("SCA: Querying OSV.dev for %d packages from %s", len(all_packages), repo_full_name)

    raw_results = _query_osv_batch(all_packages)

    # Deduplicate by (vuln_id, pkg_name)
    seen: set = set()
    issues: List[Dict[str, Any]] = []

    for entry in raw_results:
        vuln = entry["vuln"]
        pkg = entry["pkg"]
        vuln_id = vuln.get("id", "")

        # Prefer CVE alias if available
        cve_id = vuln_id
        for alias in vuln.get("aliases", []):
            if alias.startswith("CVE-"):
                cve_id = alias
                break

        dedup_key = (cve_id, pkg["name"])
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        cvss = _extract_cvss(vuln)
        severity = _cvss_to_severity(cvss)
        fixed_version = _extract_fixed_version(vuln, pkg["name"])
        lockfile_path = pkg_lockfile_map.get(
            f"{pkg['name']}:{pkg['version']}:{pkg['ecosystem']}", ""
        )

        fix_time = f"Upgrade to {fixed_version}" if fixed_version else "Check advisory for fix"
        cmd_template = _UPGRADE_COMMANDS.get(pkg["ecosystem"], "")
        remediation_script = cmd_template.format(name=pkg["name"], version=fixed_version) if fixed_version and cmd_template else ""

        summary = vuln.get("summary", vuln.get("details", ""))[:300]
        references = [ref.get("url", "") for ref in vuln.get("references", [])[:3]]

        # Use CVE number as rule code for stable identification
        rule_code = cve_id.lower().replace("-", "_") if cve_id.startswith("CVE-") else f"osv_{vuln_id.lower().replace('-', '_')}"

        issues.append({
            "rule_code": rule_code,
            "title": f"{cve_id}: {pkg['name']}@{pkg['version']}",
            "description": (
                f"{summary}\n\n"
                f"Package: {pkg['name']} {pkg['version']} ({pkg['ecosystem']})\n"
                f"Lockfile: {lockfile_path}\n"
                f"CVSS: {cvss:.1f}\n"
                + (f"References: {', '.join(references)}" if references else "")
            ),
            "severity": severity,
            "location": f"{lockfile_path}:{pkg['name']}",
            "repo_full_name": repo_full_name,
            "category": "sca",
            "fix_time": fix_time,
            "remediation_script": remediation_script,
        })

    logger.info("SCA: Found %d CVEs in %s", len(issues), repo_full_name)
    return issues


# ── License scanner ──────────────────────────────────────────────

_COPYLEFT_LICENSES = {
    "gpl", "gpl-2.0", "gpl-3.0", "gpl-2.0-only", "gpl-3.0-only",
    "gpl-2.0-or-later", "gpl-3.0-or-later",
    "agpl", "agpl-3.0", "agpl-3.0-only", "agpl-3.0-or-later",
    "lgpl", "lgpl-2.0", "lgpl-2.1", "lgpl-3.0",
    "sspl", "sspl-1.0",
    "eupl", "eupl-1.1", "eupl-1.2",
    "cc-by-sa", "cc-by-sa-4.0",
}


def scan_license(repo_dir: str, repo_full_name: str) -> List[Dict[str, Any]]:
    """Scan package.json files for copyleft or missing licenses."""
    root = Path(repo_dir)
    issues: List[Dict[str, Any]] = []

    for pkg_json in root.rglob("package.json"):
        if any(part in _SKIP_DIRS for part in pkg_json.parts):
            continue
        try:
            data = json.loads(pkg_json.read_text(errors="replace"))
        except (json.JSONDecodeError, OSError):
            continue

        rel_path = str(pkg_json.relative_to(root))
        license_val = data.get("license", "")

        if not license_val:
            issues.append({
                "rule_code": "license_001",
                "title": f"Missing license declaration",
                "description": f"No license field found in {rel_path}. This may cause compliance issues.",
                "severity": "medium",
                "location": f"{rel_path}:license",
                "repo_full_name": repo_full_name,
                "category": "license",
                "fix_time": "5 min",
            })
            continue

        license_lower = license_val.lower().strip()
        if any(cl in license_lower for cl in _COPYLEFT_LICENSES):
            issues.append({
                "rule_code": "license_002",
                "title": f"Copyleft license detected: {license_val}",
                "description": (
                    f"Package at {rel_path} uses copyleft license '{license_val}'. "
                    f"This may require you to release your source code under the same license."
                ),
                "severity": "high",
                "location": f"{rel_path}:license",
                "repo_full_name": repo_full_name,
                "category": "license",
                "fix_time": "Review required",
            })

    return issues
