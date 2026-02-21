"""Tests for Slack notification support."""

from unittest.mock import patch, MagicMock
from pipeline.notifications import send_slack_notification, notify_critical_threats


class TestSlackNotification:
    @patch("pipeline.notifications.SLACK_WEBHOOK_URL", None)
    def test_returns_false_without_webhook(self):
        assert send_slack_notification("test") is False

    @patch("pipeline.notifications.SLACK_WEBHOOK_URL", "https://hooks.slack.com/test")
    @patch("pipeline.notifications.urllib.request.urlopen")
    def test_sends_message(self, mock_urlopen):
        mock_urlopen.return_value = MagicMock()
        assert send_slack_notification("Hello") is True
        mock_urlopen.assert_called_once()

    @patch("pipeline.notifications.SLACK_WEBHOOK_URL", "https://hooks.slack.com/test")
    @patch("pipeline.notifications.urllib.request.urlopen", side_effect=Exception("Network error"))
    def test_returns_false_on_error(self, mock_urlopen):
        assert send_slack_notification("Hello") is False


class TestNotifyCriticalThreats:
    def test_returns_false_with_empty_threats(self):
        assert notify_critical_threats([]) is False

    @patch("pipeline.notifications.send_slack_notification", return_value=True)
    def test_formats_message_correctly(self, mock_send):
        threats = [
            {"type": "dast", "risk_score": 9.5, "source_ip": "10.0.0.1", "description": "SSH attack"}
        ]
        result = notify_critical_threats(threats, report_summary="Test summary")
        assert result is True
        call_args = mock_send.call_args[0][0]
        assert "Critical Threat" in call_args
        assert "Dast" in call_args
        assert "10.0.0.1" in call_args
