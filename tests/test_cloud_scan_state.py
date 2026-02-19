"""Tests for cloud scan agent state."""
import operator
from typing import get_type_hints

import pytest

from pipeline.cloud_scan_state import ScanAgentState


def test_state_has_required_keys():
    state = ScanAgentState(
        cloud_account_id="abc",
        project_id="my-proj",
        credentials_json="{}",
        enabled_services=["cloud_logging"],
    )
    assert state["cloud_account_id"] == "abc"
    assert state["project_id"] == "my-proj"


def test_scan_issues_aggregation():
    """Annotated list fields should support operator.add for parallel fan-in."""
    hints = get_type_hints(ScanAgentState, include_extras=True)
    assert hasattr(hints["scan_issues"], "__metadata__")


def test_state_supports_current_asset():
    """current_asset field is needed for Send() fan-out."""
    state = ScanAgentState(
        current_asset={"asset_type": "firewall_rule", "name": "test"},
    )
    assert state["current_asset"]["name"] == "test"
