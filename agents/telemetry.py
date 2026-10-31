"""Per-agent-call LLM and governance telemetry."""
from contextvars import ContextVar
from contextlib import contextmanager
from time import perf_counter
from typing import Any


_CURRENT: ContextVar[dict | None] = ContextVar("agent_telemetry", default=None)


def _new_telemetry() -> dict:
    return {
        "started_at": perf_counter(),
        "model": None,
        "llm_timing_ms": 0.0,
        "input_tokens": None,
        "output_tokens": None,
        "guardrail_hits": [],
        "agent_step_events": 0,
    }


@contextmanager
def telemetry_scope():
    telemetry = _new_telemetry()
    token = _CURRENT.set(telemetry)
    try:
        yield telemetry
    finally:
        _CURRENT.reset(token)


def current_telemetry() -> dict | None:
    return _CURRENT.get()


def record_guardrail_hit(hit: str) -> None:
    telemetry = _CURRENT.get()
    if telemetry is not None and hit not in telemetry["guardrail_hits"]:
        telemetry["guardrail_hits"].append(hit)


def record_agent_step_event() -> None:
    telemetry = _CURRENT.get()
    if telemetry is not None:
        telemetry["agent_step_events"] += 1


def record_llm_telemetry(model: str, timing_ms: int, tokens: dict | None) -> None:
    telemetry = _CURRENT.get()
    if telemetry is None:
        return
    if model:
        telemetry["model"] = model
    telemetry["llm_timing_ms"] += max(0, timing_ms)
    if tokens:
        input_tokens = tokens.get("input")
        output_tokens = tokens.get("output")
        if input_tokens is not None:
            telemetry["input_tokens"] = (telemetry["input_tokens"] or 0) + input_tokens
        if output_tokens is not None:
            telemetry["output_tokens"] = (telemetry["output_tokens"] or 0) + output_tokens


def telemetry_payload(
    telemetry: dict | None = None,
    *,
    fallback_used: bool = False,
    fallback_reason: str | None = None,
) -> dict:
    current = telemetry if telemetry is not None else _CURRENT.get()
    if current is None:
        return {
            "model": None,
            "timing_ms": 0.0,
            "tokens": {"input": None, "output": None},
            "fallback_used": fallback_used,
            "fallback_reason": fallback_reason,
            "guardrail_hits": [],
        }
    return {
        "model": current["model"],
        "timing_ms": max(1, int(max(
            current["llm_timing_ms"],
            (perf_counter() - current["started_at"]) * 1000,
        ))) if current["model"] else 0,
        "tokens": (
            {"input": current["input_tokens"], "output": current["output_tokens"]}
            if current["input_tokens"] is not None or current["output_tokens"] is not None
            else None
        ),
        "fallback_used": fallback_used,
        "fallback_reason": fallback_reason,
        "guardrail_hits": list(current["guardrail_hits"]),
    }


def _token_count(*values: Any) -> int | None:
    for value in values:
        if isinstance(value, int) and not isinstance(value, bool):
            return value
    return None


def _usage_value(usage: Any, *names: str) -> Any:
    if isinstance(usage, dict):
        return next((usage[name] for name in names if name in usage), None)
    return next((getattr(usage, name, None) for name in names if getattr(usage, name, None) is not None), None)


def tracked_chat_completion(client, **kwargs):
    telemetry = _CURRENT.get()
    start = perf_counter()
    response = None
    try:
        response = client.chat.completions.create(**kwargs)
        return response
    finally:
        if telemetry is not None:
            model = kwargs.get("model")
            timing_ms = max(1, int((perf_counter() - start) * 1000))
            tokens = None
            if response is not None:
                usage = getattr(response, "usage", None)
                input_tokens = _token_count(
                    _usage_value(usage, "prompt_tokens"),
                    _usage_value(usage, "input_tokens"),
                    getattr(response, "prompt_eval_count", None),
                )
                output_tokens = _token_count(
                    _usage_value(usage, "completion_tokens"),
                    _usage_value(usage, "output_tokens"),
                    getattr(response, "eval_count", None),
                )
                if input_tokens is not None or output_tokens is not None:
                    tokens = {"input": input_tokens, "output": output_tokens}
            record_llm_telemetry(model, timing_ms, tokens)
