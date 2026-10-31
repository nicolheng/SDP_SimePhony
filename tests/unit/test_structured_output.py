import json

from agents.simephony.intake import intake_node


def _valid_intake():
    return {
        "category": "water_leak",
        "summary": "Water is dripping from the ceiling.",
        "missing_info": [],
        "urgency": "normal",
        "preliminary_outcome": "VALID_DEFECT",
    }


def test_invalid_json_retries_once_and_uses_validated_response(fake_llm):
    fake_llm.responses.extend(["not valid JSON", json.dumps(_valid_intake())])

    result = intake_node({"user_description": "Water dripping from the ceiling."})

    assert result["intake_result"]["summary"] == "Water is dripping from the ceiling."
    assert len(fake_llm.calls) == 2
    assert all(
        call.kwargs["response_format"] == {"type": "json_object"}
        for call in fake_llm.client.chat.completions.create.call_args_list
    )
    assert fake_llm.calls[1][0] == fake_llm.calls[0][0]
    retry_prompt = fake_llm.calls[1][-1]["content"]
    assert "failed validation" in retry_prompt
    assert "Expecting value" in retry_prompt
    assert '"required": ["category", "missing_info"]' in retry_prompt
