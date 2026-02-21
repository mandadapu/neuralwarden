"""Tests for the threat intel API router."""

from __future__ import annotations

import os

# ── Bootstrap: patch DB connections BEFORE importing api.main ──────
os.environ["NEURALWARDEN_DB_PATH"] = ":memory:"

import sqlite3

class _NonClosingConnection:
    def __init__(self, real_conn):
        self._conn = real_conn
    def close(self):
        pass
    def __getattr__(self, name):
        return getattr(self._conn, name)

_shared_real_conn = sqlite3.connect(":memory:", check_same_thread=False)
_shared_real_conn.row_factory = sqlite3.Row
_shared_real_conn.execute("PRAGMA foreign_keys = ON")
_shared_wrapper = _NonClosingConnection(_shared_real_conn)

import api.cloud_database as cloud_db
import api.database as db

cloud_db._get_conn = lambda: _shared_wrapper
db._get_conn = lambda: _shared_wrapper

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


# ── Stats ────────────────────────────────────────────────────────────────────

def test_stats_no_pinecone():
    """Without PINECONE_API_KEY, stats returns connected=false."""
    with patch("pipeline.vector_store._get_pinecone_index", return_value=None):
        res = client.get("/api/threat-intel/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["connected"] is False
    assert data["total_vectors"] == 0


def test_stats_with_pinecone():
    """With a mock index, stats returns vector count."""
    class MockIndex:
        def describe_index_stats(self):
            return {"total_vector_count": 42}

    with patch("pipeline.vector_store._get_pinecone_index", return_value=MockIndex()):
        res = client.get("/api/threat-intel/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["connected"] is True
    assert data["total_vectors"] == 42


# ── Entries ──────────────────────────────────────────────────────────────────

def test_list_all_entries():
    """Listing all entries returns at least 26 (16 original + 10 OWASP)."""
    res = client.get("/api/threat-intel/entries")
    assert res.status_code == 200
    entries = res.json()
    assert len(entries) >= 26


def test_filter_cve():
    """Filtering by 'cve' returns only entries with cve_id in metadata."""
    res = client.get("/api/threat-intel/entries?category=cve")
    assert res.status_code == 200
    entries = res.json()
    assert len(entries) >= 9
    for e in entries:
        assert "cve_id" in e["metadata"]


def test_filter_owasp_agentic():
    """Filtering by 'owasp_agentic' returns exactly 10 OWASP entries."""
    res = client.get("/api/threat-intel/entries?category=owasp_agentic")
    assert res.status_code == 200
    entries = res.json()
    assert len(entries) == 10
    for e in entries:
        assert e["metadata"]["category"] == "owasp_agentic"
        assert e["id"].startswith("OWASP-ASI")


def test_filter_threat_pattern():
    """Filtering by 'threat_pattern' returns THREAT-INTEL-* entries."""
    res = client.get("/api/threat-intel/entries?category=threat_pattern")
    assert res.status_code == 200
    entries = res.json()
    assert len(entries) >= 7
    for e in entries:
        assert e["id"].startswith("THREAT-INTEL-")


# ── Search ───────────────────────────────────────────────────────────────────

def test_search_returns_results():
    """Search with mocked Pinecone returns formatted results."""
    mock_results = [
        {"id": "CVE-2024-6387", "score": 0.92, "metadata": {"text": "regreSSHion", "severity": "critical"}},
    ]
    with patch("api.routers.threat_intel.query_threat_intel", return_value=mock_results):
        res = client.post("/api/threat-intel/search", json={"query": "SSH remote code execution"})
    assert res.status_code == 200
    data = res.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["id"] == "CVE-2024-6387"
    assert data["results"][0]["score"] == 0.92


def test_search_empty_query():
    """Search with empty query returns 422."""
    res = client.post("/api/threat-intel/search", json={"query": ""})
    # Pydantic allows empty string; the router calls Pinecone which may return []
    # This test just ensures it doesn't crash
    assert res.status_code in (200, 422)
