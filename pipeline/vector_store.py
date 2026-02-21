"""Pinecone vector store for CVE and threat intelligence lookups."""

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "neuralwarden-threat-intel")
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


@lru_cache(maxsize=1)
def _get_pinecone_index():
    """Lazily initialize and cache the Pinecone index client."""
    api_key = os.getenv("PINECONE_API_KEY")
    if not api_key:
        return None
    from pinecone import Pinecone

    pc = Pinecone(api_key=api_key)
    return pc.Index(PINECONE_INDEX_NAME)


@lru_cache(maxsize=1)
def _get_embeddings():
    """Lazily initialize and cache the OpenAI embeddings client."""
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=EMBEDDING_MODEL)


def query_threat_intel(query_text: str, top_k: int = 3) -> list[dict[str, Any]]:
    """Query Pinecone for relevant threat intelligence.

    Returns list of dicts with keys: id, score, text, metadata.
    Returns empty list if Pinecone is not configured.
    """
    index = _get_pinecone_index()
    if index is None:
        return []

    embeddings = _get_embeddings()
    query_vector = embeddings.embed_query(query_text)

    results = index.query(
        vector=query_vector,
        top_k=top_k,
        include_metadata=True,
    )

    return [
        {
            "id": match["id"],
            "score": match["score"],
            "text": match.get("metadata", {}).get("text", ""),
            "metadata": match.get("metadata", {}),
        }
        for match in results.get("matches", [])
    ]


_SEEDS_PATH = Path(__file__).resolve().parent.parent / "data" / "cve_seeds.json"


def get_pinecone_stats() -> dict[str, Any]:
    """Return Pinecone connection status and vector count."""
    index = _get_pinecone_index()
    if index is None:
        return {"connected": False, "total_vectors": 0}
    try:
        stats = index.describe_index_stats()
        total = stats.get("total_vector_count", 0)
        return {"connected": True, "total_vectors": total}
    except Exception:
        return {"connected": False, "total_vectors": 0}


def list_threat_intel_entries(category: str | None = None) -> list[dict[str, Any]]:
    """Read entries from cve_seeds.json, optionally filtered by category.

    Categories: 'cve' (has cve_id), 'threat_pattern' (THREAT-INTEL-*),
    'owasp_agentic' (metadata.category == owasp_agentic).
    """
    if not _SEEDS_PATH.exists():
        return []
    entries: list[dict[str, Any]] = json.loads(_SEEDS_PATH.read_text())
    if category is None:
        return entries
    filtered = []
    for e in entries:
        meta = e.get("metadata", {})
        entry_id: str = e.get("id", "")
        if category == "cve" and meta.get("cve_id"):
            filtered.append(e)
        elif category == "threat_pattern" and entry_id.startswith("THREAT-INTEL-"):
            filtered.append(e)
        elif category == "owasp_agentic" and meta.get("category") == "owasp_agentic":
            filtered.append(e)
    return filtered


def format_threat_intel_context(
    threat_description: str, threat_type: str, source_ip: str = ""
) -> str:
    """Query Pinecone and format results as context for the Classify Agent prompt.

    Returns empty string if no relevant intel found or Pinecone not configured.
    """
    query = f"{threat_type}: {threat_description}"
    if source_ip:
        query += f" (source IP: {source_ip})"

    results = query_threat_intel(query, top_k=3)
    if not results:
        return ""

    lines = ["## Relevant Threat Intelligence"]
    for r in results:
        lines.append(f"- [{r['id']}] (relevance: {r['score']:.2f}): {r['text']}")
        meta = r.get("metadata", {})
        if meta.get("severity"):
            lines.append(f"  Severity: {meta['severity']} | CVSS: {meta.get('cvss', 'N/A')}")
        if meta.get("technique"):
            lines.append(f"  MITRE: {meta['technique']} ({meta.get('tactic', '')})")
    return "\n".join(lines)
