"""Strict JSON output parsing, schema validation, and one corrective LLM retry."""
import json
from typing import Any


class StructuredOutputError(RuntimeError):
    """The model failed to return valid structured output after its single retry."""

    def __init__(self) -> None:
        super().__init__("LLM JSON validation failed after 1 retry")


class JSONSchemaValidationError(ValueError):
    """A parsed JSON value does not match the requested JSON schema."""


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


def chat_json(client, model: str, messages: list[dict], schema: dict, temperature: float = 0.0) -> dict:
    """Request JSON mode, validate against a schema, then retry once with validation feedback."""
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
            response = client.chat.completions.create(
                model=model,
                messages=retry_messages,
                temperature=temperature,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            if not isinstance(content, str):
                raise JSONSchemaValidationError("$ response content must be a JSON string")
            value = json.loads(content)
            _validate(value, schema)
            return value
        except (json.JSONDecodeError, JSONSchemaValidationError, TypeError) as error:
            validation_error = str(error)
        except Exception as error:
            if attempt:
                raise StructuredOutputError() from error
            raise
    raise StructuredOutputError() from JSONSchemaValidationError(validation_error)
