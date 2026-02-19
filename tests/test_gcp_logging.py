"""Tests for GCP Cloud Logging integration."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


# --------------- _format_entry tests ---------------


class TestFormatEntry:
    def test_text_payload(self):
        from api.gcp_logging import _format_entry

        entry = MagicMock()
        entry.timestamp = datetime(2026, 2, 18, 19, 31, 35, tzinfo=timezone.utc)
        entry.severity = "WARNING"
        entry.resource = MagicMock()
        entry.resource.type = "cloud_run_revision"
        entry.resource.labels = {"service_name": "archcelerate"}
        entry.payload = "Connection refused from 185.220.100.252"
        entry.http_request = None
        result = _format_entry(entry)
        assert "2026-02-18T19:31:35Z" in result
        assert "WARNING" in result
        assert "Connection refused" in result
        assert "cloud_run_revision/archcelerate:" in result

    def test_http_request_payload(self):
        from api.gcp_logging import _format_entry

        entry = MagicMock()
        entry.timestamp = datetime(2026, 2, 18, 19, 31, 35, tzinfo=timezone.utc)
        entry.severity = "WARNING"
        entry.resource = MagicMock()
        entry.resource.type = "cloud_run_revision"
        entry.resource.labels = {"service_name": "archcelerate"}
        entry.payload = ""
        entry.http_request = {
            "requestMethod": "GET",
            "requestUrl": "/wp-admin/setup-config.php",
            "status": 404,
            "remoteIp": "185.220.100.252",
            "userAgent": "Mozilla/5.0",
        }
        result = _format_entry(entry)
        assert "GET /wp-admin/setup-config.php" in result
        assert "status=404" in result
        assert "src=185.220.100.252" in result

    def test_json_payload(self):
        from api.gcp_logging import _format_entry

        entry = MagicMock()
        entry.timestamp = datetime(2026, 2, 18, 10, 0, 0, tzinfo=timezone.utc)
        entry.severity = "INFO"
        entry.resource = MagicMock()
        entry.resource.type = "cloudsql_database"
        entry.resource.labels = {"database_id": "archcelerate:mydb"}
        entry.payload = {"message": "LOG: connection authorized: user=postgres"}
        entry.http_request = None
        result = _format_entry(entry)
        assert "connection authorized" in result
        assert "INFO" in result

    def test_json_payload_no_message_key(self):
        from api.gcp_logging import _format_entry

        entry = MagicMock()
        entry.timestamp = datetime(2026, 2, 18, 10, 0, 0, tzinfo=timezone.utc)
        entry.severity = "INFO"
        entry.resource = MagicMock()
        entry.resource.type = "gce_instance"
        entry.resource.labels = {}
        entry.payload = {"key": "value", "count": 42}
        entry.http_request = None
        result = _format_entry(entry)
        assert "key" in result

    def test_empty_entry(self):
        from api.gcp_logging import _format_entry

        entry = MagicMock()
        entry.timestamp = None
        entry.severity = None
        entry.resource = None
        entry.payload = ""
        entry.http_request = None
        entry.text_payload = None
        result = _format_entry(entry)
        assert result == ""


# --------------- _format_http_request tests ---------------


class TestFormatHttpRequest:
    def test_all_fields(self):
        from api.gcp_logging import _format_http_request

        result = _format_http_request(
            {
                "requestMethod": "POST",
                "requestUrl": "/api/login",
                "status": 401,
                "remoteIp": "10.0.0.1",
                "userAgent": "curl/7.68",
                "latency": "0.5s",
                "responseSize": "1234",
            }
        )
        assert "POST /api/login" in result
        assert "status=401" in result
        assert "src=10.0.0.1" in result
        assert 'ua="curl/7.68"' in result

    def test_minimal_fields(self):
        from api.gcp_logging import _format_http_request

        result = _format_http_request(
            {"requestMethod": "GET", "requestUrl": "/", "status": 200}
        )
        assert "GET /" in result
        assert "status=200" in result
        assert "src=" not in result


# --------------- fetch_logs tests ---------------


class TestFetchLogs:
    @patch("api.gcp_logging._get_client")
    def test_returns_formatted_lines(self, mock_get_client):
        from api.gcp_logging import fetch_logs

        entry = MagicMock()
        entry.timestamp = datetime(2026, 2, 18, 10, 0, 0, tzinfo=timezone.utc)
        entry.severity = "WARNING"
        entry.resource = MagicMock()
        entry.resource.type = "cloud_run_revision"
        entry.resource.labels = {"service_name": "test"}
        entry.payload = "test log line"
        entry.http_request = None

        mock_client = MagicMock()
        mock_client.list_entries.return_value = [entry]
        mock_get_client.return_value = mock_client

        lines = fetch_logs("test-project", max_entries=10)
        assert len(lines) == 1
        assert "test log line" in lines[0]

    @patch("api.gcp_logging._get_client")
    def test_respects_max_entries(self, mock_get_client):
        from api.gcp_logging import fetch_logs

        entries = []
        for i in range(5):
            e = MagicMock()
            e.timestamp = datetime(2026, 2, 18, 10, i, 0, tzinfo=timezone.utc)
            e.severity = "INFO"
            e.resource = MagicMock()
            e.resource.type = "test"
            e.resource.labels = {}
            e.payload = f"line {i}"
            e.http_request = None
            entries.append(e)

        mock_client = MagicMock()
        mock_client.list_entries.return_value = entries
        mock_get_client.return_value = mock_client

        lines = fetch_logs("test-project", max_entries=10)
        assert len(lines) == 5

    @patch("api.gcp_logging._running_on_gcp", return_value=False)
    @patch.dict("os.environ", {}, clear=False)
    def test_raises_without_credentials(self, mock_gcp_check):
        import os

        os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
        from api.gcp_logging import _GCP_AVAILABLE

        if not _GCP_AVAILABLE:
            pytest.skip("google-cloud-logging not installed")
        from api.gcp_logging import fetch_logs

        with pytest.raises(RuntimeError, match="GOOGLE_APPLICATION_CREDENTIALS"):
            fetch_logs("test-project")
