"""Agent metrics tracking for cost and latency monitoring."""

import time
from dataclasses import dataclass, field
from typing import Any


# Cost per million tokens for each model
MODEL_COSTS: dict[str, dict[str, float]] = {
    "claude-haiku-4-5-20251001": {"input": 0.25, "output": 1.25},
    "claude-sonnet-4-5-20250929": {"input": 3.00, "output": 15.00},
    "claude-opus-4-6": {"input": 15.00, "output": 75.00},
}


@dataclass
class AgentTimer:
    """Context manager for tracking agent execution time and LLM token usage."""

    agent_name: str
    model: str
    _start: float = field(default=0.0, init=False)
    _metrics: dict[str, Any] = field(default_factory=dict, init=False)

    def __enter__(self) -> "AgentTimer":
        self._start = time.time()
        return self

    def __exit__(self, *args: Any) -> None:
        self._metrics["latency_ms"] = (time.time() - self._start) * 1000

    def record_usage(self, response: Any) -> None:
        """Extract token usage from LangChain response metadata."""
        usage = getattr(response, "usage_metadata", None) or {}
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        self._metrics["input_tokens"] = input_tokens
        self._metrics["output_tokens"] = output_tokens
        costs = MODEL_COSTS.get(self.model, {"input": 0, "output": 0})
        self._metrics["cost_usd"] = (
            input_tokens * costs["input"] / 1_000_000
            + output_tokens * costs["output"] / 1_000_000
        )

    @property
    def metrics(self) -> dict[str, Any]:
        return self._metrics
