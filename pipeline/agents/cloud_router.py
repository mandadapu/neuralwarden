"""Router node — inspects asset metadata to determine public vs private."""

from __future__ import annotations

from pipeline.cloud_scan_state import ScanAgentState


def is_public(asset: dict) -> bool:
    """Determine if a cloud asset is publicly exposed based on its metadata."""
    metadata = asset.get("metadata", {})
    asset_type = asset.get("asset_type", "")

    # Compute Engine: has external IP via accessConfigs
    if asset_type == "compute_instance":
        for iface in metadata.get("networkInterfaces", []):
            if "accessConfigs" in iface:
                return True

    # GCS Bucket: publicAccessPrevention not enforced
    if asset_type == "gcs_bucket":
        if metadata.get("publicAccessPrevention") != "enforced":
            return True

    # Firewall Rule: allows 0.0.0.0/0 or ::/0
    if asset_type == "firewall_rule":
        for src in metadata.get("source_ranges", []):
            if src in ("0.0.0.0/0", "::/0"):
                return True

    # Cloud SQL: has public IP
    if asset_type == "cloud_sql":
        if metadata.get("publicIp"):
            return True

    return False


def router_node(state: ScanAgentState) -> dict:
    """Split discovered assets into public and private lists."""
    assets = state.get("discovered_assets", [])
    public = []
    private = []
    for asset in assets:
        if is_public(asset):
            public.append(asset)
        else:
            private.append(asset)

    return {
        "public_assets": public,
        "private_assets": private,
        "total_assets": len(assets),
        "scan_status": "routing",
    }
