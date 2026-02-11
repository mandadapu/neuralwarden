"""Burst-mode ingest: processes a single chunk of logs for parallel fan-out."""

from pipeline.agents.ingest import run_ingest


CHUNK_SIZE = 200


def run_ingest_chunk(state: dict) -> dict:
    """Process a single chunk of raw logs.

    Called via LangGraph's Send API during burst mode.
    The state dict has: chunk_logs (list[str]), chunk_index (int).
    """
    chunk_logs = state.get("chunk_logs", [])
    chunk_index = state.get("chunk_index", 0)

    if not chunk_logs:
        return {"parsed_logs": [], "invalid_count": 0, "total_count": 0}

    # Reuse the ingest agent logic by constructing a mini PipelineState
    mini_state = {
        "raw_logs": chunk_logs,
        "parsed_logs": [],
        "invalid_count": 0,
        "total_count": 0,
        "agent_metrics": {},
    }

    result = run_ingest(mini_state)

    # Adjust log indices to be globally unique (offset by chunk position)
    offset = chunk_index * CHUNK_SIZE
    for log in result.get("parsed_logs", []):
        log.index = log.index + offset

    return {
        "parsed_logs": result.get("parsed_logs", []),
        "invalid_count": result.get("invalid_count", 0),
        "total_count": result.get("total_count", 0),
    }
