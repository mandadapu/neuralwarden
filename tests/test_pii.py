"""Tests for PII masking in pipeline/security.py."""

from pipeline.security import mask_pii, mask_pii_logs


class TestPIIMasking:
    def test_masks_ssn(self):
        assert mask_pii("SSN: 123-45-6789") == "SSN: [SSN-REDACTED]"

    def test_masks_credit_card_with_dashes(self):
        assert "[CC-REDACTED]" in mask_pii("Card: 4111-1111-1111-1111")

    def test_masks_credit_card_plain(self):
        assert "[CC-REDACTED]" in mask_pii("Card: 4111111111111111")

    def test_masks_email(self):
        assert mask_pii("Contact: admin@company.com") == "Contact: [EMAIL-REDACTED]"

    def test_masks_phone_with_parens(self):
        assert "[PHONE-REDACTED]" in mask_pii("Call (555) 123-4567")

    def test_masks_phone_with_dashes(self):
        assert "[PHONE-REDACTED]" in mask_pii("Call 555-123-4567")

    def test_preserves_ip_addresses(self):
        result = mask_pii("Source: 203.0.113.50")
        assert "203.0.113.50" in result

    def test_preserves_internal_ips(self):
        result = mask_pii("Host: 192.168.1.1 port 8080")
        assert "192.168.1.1" in result

    def test_preserves_port_numbers(self):
        result = mask_pii("Listening on port 8443")
        assert "8443" in result

    def test_batch_masking(self):
        logs = ["user SSN 123-45-6789", "IP 10.0.0.1 normal"]
        masked = mask_pii_logs(logs)
        assert "[SSN-REDACTED]" in masked[0]
        assert "10.0.0.1" in masked[1]

    def test_multiple_pii_in_one_line(self):
        line = "User admin@test.com SSN 123-45-6789 called 555-234-5678"
        result = mask_pii(line)
        assert "[EMAIL-REDACTED]" in result
        assert "[SSN-REDACTED]" in result
