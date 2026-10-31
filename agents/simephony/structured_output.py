"""Strict JSON output parsing, schema validation, and one corrective LLM retry."""
import json
import time
from typing import Any

from agents.telemetry import record_llm_telemetry
from .llm_client import LLM_MAX_TOKENS, LLM_TIMEOUT_TEXT

class StructuredOutputError(RuntimeError):
    """The model failed to return valid structured output after its single retry."""

    def __init__(self) -> None:
        super().__init__("LLM JSON validation failed after 1 retry")


class JSONSchemaValidationError(ValueError):
    """A parsed JSON value does not match the requested JSON schema."""


def _usage_value(usage: Any, key: str) -> Any:
    if isinstance(usage, dict):
        return usage.get(key)
    return getattr(usage, key, None) if usage else None


def _response_value(response: Any, key: str) -> Any:
    if isinstance(response, dict):
        return response.get(key)
    return getattr(response, key, None)


def _validate(value: Any, schema: dict, path: str = "$") -> None:
    expected = schema.get("type")
    valid_types = {
        "object": lambda item: isinstance(item, dict),
        "array": lambda item: isinstance(item, list),
        "string": lambda item: isinstance(item, str),
        "integer": lambda item: isinstance(item, int) and not isinstance(item, bool),
        "number": lambda item: isinstance(item, (int, float)) and not isinstance(item, bool),
        "boolean": lambda item: isinstance(item, bool),
        "null": lambda item: item is None,
    }
    expected_types = expected if isinstance(expected, list) else [expected]
    if expected and not any(valid_types.get(item, lambda _value: False)(value) for item in expected_types):
        raise JSONSchemaValidationError(f"{path} must be {' or '.join(expected_types)}")
    if "enum" in schema and value not in schema["enum"]:
        raise JSONSchemaValidationError(f"{path} must be one of {schema['enum']}")
    if isinstance(value, dict):
        required = schema.get("required", [])
        missing = [key for key in required if key not in value]
        if missing:
            raise JSONSchemaValidationError(f"{path} is missing required properties: {', '.join(missing)}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            extra = sorted(set(value) - set(properties))
            if extra:
                raise JSONSchemaValidationError(f"{path} has unexpected properties: {', '.join(extra)}")
        for key, item in value.items():
            if key in properties:
                _validate(item, properties[key], f"{path}.{key}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise JSONSchemaValidationError(f"{path} must contain at least {schema['minItems']} items")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                _validate(item, item_schema, f"{path}[{index}]")


def chat_json(client, model: str, messages: list[dict], schema: dict, temperature: float = 0.0,
              timeout: float = LLM_TIMEOUT_TEXT) -> dict:
    """Request JSON mode, validate against a schema, then retry once with validation feedback."""
    timing_ms = 0
    input_tokens = 0
    output_tokens = 0
    has_token_counts = False
    has_input_tokens = False
    has_output_tokens = False
    for attempt in range(2):
        retry_messages = messages
        if attempt:
            retry_messages = [
                *messages,
                {
                    "role": "user",
                    "content": (
                        f"Your previous output failed validation: {validation_error}. "
                        "Please output ONLY valid JSON matching this schema:\n"
                        f"{json.dumps(schema, ensure_ascii=False)}"
                    ),
                },
            ]
        try:
            start = time.perf_counter()
            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=retry_messages,
                    temperature=temperature,
                    response_format={"type": "json_object"},
                    max_tokens=LLM_MAX_TOKENS,
                    timeout=timeout,
                )
            finally:
                timing_ms += max(1, int((time.perf_counter() - start) * 1000))
            usage = _response_value(response, "usage")
            prompt_tokens = _usage_value(usage, "prompt_tokens")
            completion_tokens = _usage_value(usage, "completion_tokens")
            prompt_tokens = prompt_tokens if isinstance(prompt_tokens, int) else _response_value(response, "prompt_eval_count")
            completion_tokens = completion_tokens if isinstance(completion_tokens, int) else _response_value(response, "eval_count")
            if isinstance(prompt_tokens, int) or isinstance(completion_tokens, int):
                has_token_counts = True
                has_input_tokens = has_input_tokens or isinstance(prompt_tokens, int)
                has_output_tokens = has_output_tokens or isinstance(completion_tokens, int)
                input_tokens += prompt_tokens if isinstance(prompt_tokens, int) else 0
                output_tokens += completion_tokens if isinstance(completion_tokens, int) else 0
            choices = _response_value(response, "choices")
            message = _response_value(choices[0], "message")
            content = _response_value(message, "content")
            if not isinstance(content, str):
                raise JSONSchemaValidationError("$ response content must be a JSON string")
            value = json.loads(content)
            _validate(value, schema)
            tokens = {
                "input": input_tokens if has_input_tokens else None,
                "output": output_tokens if has_output_tokens else None,
            } if has_token_counts else None
            return {
                "parsed": value,
                "model": model,
                "timing_ms": timing_ms,
                "tokens": tokens,
            }
        except (json.JSONDecodeError, JSONSchemaValidationError, TypeError) as error:
            validation_error = str(error)
        except Exception as error:
            tokens = {
                "input": input_tokens if has_input_tokens else None,
                "output": output_tokens if has_output_tokens else None,
            } if has_token_counts else None
            record_llm_telemetry(model, timing_ms, tokens)
            if attempt:
                raise StructuredOutputError() from error
            raise
    tokens = {
        "input": input_tokens if has_input_tokens else None,
        "output": output_tokens if has_output_tokens else None,
    } if has_token_counts else None
    record_llm_telemetry(model, timing_ms, tokens)
    raise StructuredOutputError() from JSONSchemaValidationError(validation_error)
