from types import SimpleNamespace
import time

from agents.simephony.structured_output import chat_json
from agents.telemetry import record_llm_telemetry, telemetry_payload, telemetry_scope


def test_chat_json_returns_and_records_actual_model_timing_and_usage():
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))],
        usage=SimpleNamespace(prompt_tokens=21, completion_tokens=8),
    )

    def create(**_kwargs):
        time.sleep(0.002)
        return response

    client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=create),
        ),
    )
    schema = {
        "type": "object",
        "required": ["ok"],
        "properties": {"ok": {"type": "boolean"}},
        "additionalProperties": False,
    }

    with telemetry_scope() as telemetry:
        result = chat_json(client, "qwen2.5:7b", [], schema)
        record_llm_telemetry(result["model"], result["timing_ms"], result["tokens"])
        payload = telemetry_payload(telemetry)

    assert result["parsed"] == {"ok": True}
    assert result["model"] == payload["model"] == "qwen2.5:7b"
    assert result["timing_ms"] > 0
    assert payload["timing_ms"] > 0
    assert result["tokens"] == payload["tokens"] == {"input": 21, "output": 8}
