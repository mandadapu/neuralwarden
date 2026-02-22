"""Tests for the GCP Cloud Logging router."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from api.auth import get_current_user
from api.main import app

app.dependency_overrides[get_current_user] = lambda: "test@example.com"
client = TestClient(app)


class TestGcpStatus:
    @patch.dict("os.environ", {"GOOGLE_APPLICATION_CREDENTIALS": "/path/to/key.json"})
    def test_status_with_credentials(self):
        res = client.get("/api/gcp-logging/status")
        assert res.status_code == 200
        data = res.json()
        assert data["credentials_set"] is True

    @patch.dict("os.environ", {}, clear=False)
    def test_status_without_credentials(self):
        import os

        os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
        res = client.get("/api/gcp-logging/status")
        assert res.status_code == 200
        data = res.json()
        assert data["credentials_set"] is False


class TestGcpFetch:
    @patch("api.gcp_logging.fetch_logs")
    def test_fetch_success(self, mock_fetch):
        mock_fetch.return_value = ["line1", "line2", "line3"]
        res = client.post(
            "/api/gcp-logging/fetch",
            json={"project_id": "test-project", "max_entries": 100, "hours_back": 24},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["entry_count"] == 3
        assert data["logs"] == "line1\nline2\nline3"
        assert data["project_id"] == "test-project"

    @patch(
        "api.gcp_logging.fetch_logs",
        side_effect=RuntimeError("GOOGLE_APPLICATION_CREDENTIALS not set"),
    )
    def test_fetch_no_credentials(self, mock_fetch):
        res = client.post("/api/gcp-logging/fetch", json={"project_id": "test"})
        assert res.status_code == 400

    @patch("api.gcp_logging.fetch_logs", return_value=[])
    def test_fetch_empty_results(self, mock_fetch):
        res = client.post("/api/gcp-logging/fetch", json={"project_id": "test"})
        assert res.status_code == 404

    @patch("api.gcp_logging.fetch_logs", side_effect=Exception("API quota exceeded"))
    def test_fetch_gcp_error(self, mock_fetch):
        res = client.post("/api/gcp-logging/fetch", json={"project_id": "test"})
        assert res.status_code == 502
        assert res.json()["detail"] == "GCP API error"
