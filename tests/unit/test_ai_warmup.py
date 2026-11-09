import asyncio
import logging
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


pytestmark = pytest.mark.usefixtures("seed_db")


def test_embedder_warmup_initializes_model(monkeypatch):
    import tools

    model = Mock()
    monkeypatch.setenv("EMBEDDINGS_ENABLED", "true")
    monkeypatch.setattr(tools, "_load_embedder", lambda: model)

    assert tools.warmup_ai_models() is True
    model.encode.assert_called_once_with(["SimePhony startup warmup"], convert_to_numpy=True)


def test_embedder_warmup_keeps_lazy_retry_when_model_unavailable(monkeypatch, caplog):
    import tools

    loader = Mock(return_value=None)
    loader.cache_clear = Mock()
    monkeypatch.setenv("EMBEDDINGS_ENABLED", "true")
    monkeypatch.setattr(tools, "_load_embedder", loader)

    assert tools.warmup_ai_models() is False
    loader.cache_clear.assert_called_once()
    assert "retry lazy loading on first use" in caplog.text


def test_ollama_warmup_loads_both_models(monkeypatch):
    from demo_api import ai_agents
    from agents.simephony import llm_client

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=Mock())))
    monkeypatch.setenv("USE_AI_AGENTS", "true")
    monkeypatch.setattr(llm_client, "get_client", lambda: client)
    monkeypatch.setattr(llm_client, "get_models", lambda: ("vision-model", "text-model"))

    ai_agents.warmup_ollama_models()

    assert [call.kwargs["model"] for call in client.chat.completions.create.call_args_list] == [
        "text-model", "vision-model",
    ]


def test_ollama_warmup_skips_when_agents_are_disabled(monkeypatch):
    from demo_api import ai_agents

    monkeypatch.setenv("USE_AI_AGENTS", "false")
    ai_agents.warmup_ollama_models()


@pytest.mark.parametrize("ollama_error", [None, ConnectionError("Ollama offline")], ids=["warm", "offline"])
def test_startup_logs_warmup_and_survives_unavailable_ollama(monkeypatch, tmp_path, caplog, ollama_error):
    import db
    import main
    import tools
    from demo_api import ai_agents

    caplog.set_level(logging.INFO)

    @contextmanager
    def fake_connection():
        yield SimpleNamespace(execute=lambda _sql: SimpleNamespace(fetchone=lambda: (1,)))

    monkeypatch.setattr(db, "ensure_db", lambda: None)
    monkeypatch.setattr(db, "get_conn", fake_connection)
    monkeypatch.setattr(main.config, "write_rules_snapshot", lambda: False)
    monkeypatch.setattr(main, "migrate", lambda _conn: None)
    monkeypatch.setattr(main, "UPLOADS_DIR", tmp_path)
    monkeypatch.setattr(tools, "warmup_ai_models", lambda: True)
    monkeypatch.setattr(ai_agents, "warmup_ollama_models",
                        Mock(side_effect=ollama_error))
    monkeypatch.setenv("USE_AI_AGENTS", "true")

    async def start_and_stop():
        async with main.lifespan(main.app):
            await asyncio.sleep(0.5)  # the warm-up runs in the background after the server is up
            return True

    assert asyncio.run(start_and_stop()) is True
    assert "Warming up AI models (embedder/Ollama)..." in caplog.text
    if ollama_error:
        assert "Ollama not reachable at startup, will attempt lazy load on first request" in caplog.text
        assert "AI model warmup completed in" in caplog.text
    else:
        assert "AI models warmed up successfully in" in caplog.text


def test_model_warmup_is_skipped_for_a_cloud_model(monkeypatch):
    from demo_api import ai_agents
    from agents.simephony import llm_client

    client = Mock()
    monkeypatch.setenv("USE_AI_AGENTS", "all")
    monkeypatch.setenv("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
    monkeypatch.setattr(llm_client, "get_client", lambda: client)

    ai_agents.warmup_ollama_models()

    client.chat.completions.create.assert_not_called()


def test_startup_does_not_wait_for_the_models(monkeypatch, tmp_path):
    import time
    import db
    import main
    import tools
    from demo_api import ai_agents

    @contextmanager
    def fake_connection():
        yield SimpleNamespace(execute=lambda _sql: SimpleNamespace(fetchone=lambda: (1,)))

    monkeypatch.setattr(db, "ensure_db", lambda: None)
    monkeypatch.setattr(db, "get_conn", fake_connection)
    monkeypatch.setattr(main.config, "write_rules_snapshot", lambda: False)
    monkeypatch.setattr(main, "migrate", lambda _conn: None)
    monkeypatch.setattr(main, "UPLOADS_DIR", tmp_path)
    monkeypatch.setattr(tools, "warmup_ai_models", lambda: time.sleep(2) or True)  # a slow embedder
    monkeypatch.setattr(ai_agents, "warmup_ollama_models", lambda: None)

    async def time_to_ready():
        start = time.perf_counter()
        async with main.lifespan(main.app):
            return time.perf_counter() - start

    assert asyncio.run(time_to_ready()) < 1


def test_embedder_loads_once_when_two_requests_need_it_at_the_same_time(monkeypatch):
    import threading
    import time
    import tools

    loads = []

    class FakeModel:
        def __init__(self, name):
            loads.append(name)
            time.sleep(0.3)

    import types, sys
    monkeypatch.setitem(sys.modules, "sentence_transformers", types.SimpleNamespace(SentenceTransformer=FakeModel))
    tools._load_embedder.cache_clear()
    try:
        threads = [threading.Thread(target=tools._load_embedder) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(loads) == 1
    finally:
        tools._load_embedder.cache_clear()
