"""Tests for RAG vector store wrapper — no API calls needed."""

import os
from unittest.mock import patch

from pipeline.vector_store import format_threat_intel_context, query_threat_intel


class TestQueryThreatIntel:
    def test_returns_empty_when_no_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            # Clear the lru_cache to force re-check
            from pipeline.vector_store import _get_pinecone_index
            _get_pinecone_index.cache_clear()

            results = query_threat_intel("SSH brute force attack")
            assert results == []

            # Restore cache
            _get_pinecone_index.cache_clear()


class TestFormatThreatIntelContext:
    def test_returns_empty_when_no_results(self):
        with patch("pipeline.vector_store.query_threat_intel", return_value=[]):
            result = format_threat_intel_context("test threat", "brute_force")
            assert result == ""

    def test_formats_with_metadata(self):
        mock_results = [
            {
                "id": "CVE-2024-6387",
                "score": 0.92,
                "text": "regreSSHion: RCE in OpenSSH",
                "metadata": {
                    "severity": "critical",
                    "cvss": 8.1,
                    "technique": "T1190",
                    "tactic": "Initial Access",
                },
            }
        ]
        with patch("pipeline.vector_store.query_threat_intel", return_value=mock_results):
            result = format_threat_intel_context("SSH attack", "brute_force")
            assert "Relevant Threat Intelligence" in result
            assert "CVE-2024-6387" in result
            assert "critical" in result
            assert "T1190" in result
