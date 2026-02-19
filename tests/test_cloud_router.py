"""Tests for the cloud router node — public/private asset detection."""
import pytest
from pipeline.agents.cloud_router import is_public, router_node


class TestIsPublic:
    def test_compute_with_external_ip(self):
        asset = {
            "asset_type": "compute_instance",
            "name": "web-server",
            "metadata": {"networkInterfaces": [{"accessConfigs": [{"natIP": "35.1.2.3"}]}]},
        }
        assert is_public(asset) is True

    def test_compute_internal_only(self):
        asset = {
            "asset_type": "compute_instance",
            "name": "internal-vm",
            "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.5"}]},
        }
        assert is_public(asset) is False

    def test_gcs_bucket_public(self):
        asset = {
            "asset_type": "gcs_bucket",
            "name": "public-data",
            "metadata": {"publicAccessPrevention": "inherited"},
        }
        assert is_public(asset) is True

    def test_gcs_bucket_private(self):
        asset = {
            "asset_type": "gcs_bucket",
            "name": "private-data",
            "metadata": {"publicAccessPrevention": "enforced"},
        }
        assert is_public(asset) is False

    def test_firewall_open(self):
        asset = {
            "asset_type": "firewall_rule",
            "name": "allow-all-ssh",
            "metadata": {"source_ranges": ["0.0.0.0/0"]},
        }
        assert is_public(asset) is True

    def test_firewall_restricted(self):
        asset = {
            "asset_type": "firewall_rule",
            "name": "corp-ssh",
            "metadata": {"source_ranges": ["10.0.0.0/8"]},
        }
        assert is_public(asset) is False

    def test_cloud_sql_public_ip(self):
        asset = {
            "asset_type": "cloud_sql",
            "name": "prod-db",
            "metadata": {"publicIp": "34.56.78.90"},
        }
        assert is_public(asset) is True

    def test_cloud_sql_private(self):
        asset = {
            "asset_type": "cloud_sql",
            "name": "private-db",
            "metadata": {},
        }
        assert is_public(asset) is False


class TestRouterNode:
    def test_splits_assets_correctly(self):
        state = {
            "discovered_assets": [
                {"asset_type": "compute_instance", "name": "web", "metadata": {"networkInterfaces": [{"accessConfigs": [{}]}]}},
                {"asset_type": "compute_instance", "name": "internal", "metadata": {"networkInterfaces": [{"networkIP": "10.0.0.1"}]}},
                {"asset_type": "gcs_bucket", "name": "pub", "metadata": {"publicAccessPrevention": "inherited"}},
            ]
        }
        result = router_node(state)
        assert len(result["public_assets"]) == 2  # web + pub
        assert len(result["private_assets"]) == 1  # internal
        assert result["total_assets"] == 3
        assert result["scan_status"] == "routing"
