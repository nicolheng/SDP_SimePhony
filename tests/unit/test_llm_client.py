# tests/unit/test_llm_client.py
import base64
import importlib
import json
import socket
import time

import pytest
from openai import APITimeoutError, OpenAI

from agents.simephony import llm_client
from agents.simephony.intake import image_data_url, intake_node
from agents.simephony.structured_output import chat_json
from agents.simephony.verification import assess_repair_photo

SCHEMA = {"type": "object"}


@pytest.fixture
def reload_client(monkeypatch):
    """Reload llm_client under the test's env, then put the real settings back."""
    yield lambda: importlib.reload(llm_client)
    monkeypatch.undo()
    importlib.reload(llm_client)


def test_settings_come_from_the_environment(monkeypatch, reload_client):
    monkeypatch.setenv("LLM_BASE_URL", "http://example.test/v1")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_TEXT", "text-from-env")
    monkeypatch.setenv("MODEL_VL", "vision-from-env")
    monkeypatch.setenv("LLM_TIMEOUT_TEXT", "12")

    module = reload_client()

    assert str(module.client.base_url) == "http://example.test/v1/"
    assert module.client.api_key == "test-key"
    assert module.get_models() == ("vision-from-env", "text-from-env")
    assert module.client.timeout == 12


def test_client_retries_once():
    assert llm_client.client.max_retries == 1


def test_vision_limit_is_longer_than_text():
    assert llm_client.LLM_TIMEOUT_VISION > llm_client.LLM_TIMEOUT_TEXT


def test_chat_json_sends_the_text_limit_and_token_cap_by_default(fake_llm):
    fake_llm.responses.append("{}")

    chat_json(fake_llm.client, "model", [], SCHEMA)

    sent = fake_llm.client.chat.completions.create.call_args.kwargs
    assert sent["timeout"] == llm_client.LLM_TIMEOUT_TEXT
    assert sent["max_tokens"] == llm_client.LLM_MAX_TOKENS


def test_intake_uses_the_vision_limit(fake_llm):
    intake_node({"user_description": "Water leak in the bedroom", "image_path": None, "decide_only": True})

    sent = fake_llm.client.chat.completions.create.call_args.kwargs
    assert sent["timeout"] == llm_client.LLM_TIMEOUT_VISION


def test_repair_photo_check_uses_the_vision_limit(fake_llm, tmp_path):
    photo = tmp_path / "repair.jpg"
    photo.write_bytes(b"photo")
    fake_llm.responses.append(json.dumps({
        "assessment": "unclear",
        "observations": "",
        "matches_location": False,
        "confidence_score": 0.95,
    }))

    assess_repair_photo({"repair_photo_path": str(photo), "repair_note": "Fixed"})

    sent = fake_llm.client.chat.completions.create.call_args.kwargs
    assert sent["timeout"] == llm_client.LLM_TIMEOUT_VISION


def test_hung_server_fails_within_the_limit():
    # A socket that accepts the connection and never answers, like a hung Ollama
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]
        client = OpenAI(base_url=f"http://127.0.0.1:{port}/v1", api_key="test", max_retries=1)

        start = time.perf_counter()
        with pytest.raises(APITimeoutError):
            chat_json(client, "model", [{"role": "user", "content": "hi"}], SCHEMA, timeout=0.2)

    assert time.perf_counter() - start < 5


@pytest.mark.parametrize("data, mime", [
    (b"\xff\xd8\xff\xe0rest", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\nrest", "image/png"),
    (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
    (b"not a known image", "image/jpeg"),
], ids=["jpeg", "png", "webp", "unknown"])
def test_image_is_labelled_from_its_bytes_not_its_file_name(tmp_path, data, mime):
    photo = tmp_path / "upload.jpg"
    photo.write_bytes(data)

    assert image_data_url(str(photo)) == f"data:{mime};base64,{base64.b64encode(data).decode()}"
