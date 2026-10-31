import json

import pytest


pytestmark = pytest.mark.usefixtures("seed_db")


class _OllamaResponse:
    def __init__(self, models):
        self.payload = json.dumps({"models": models}).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return self.payload


def test_health_reports_component_statuses(monkeypatch):
    import tools
    import main

    tools.get_clock()
    monkeypatch.setenv("USE_AI_AGENTS", "all")
    monkeypatch.setattr(tools, "embedder_health", lambda: {
        "status": "ok",
        "message": "Loaded (all-MiniLM-L6-v2)",
    })
    requests = []

    def urlopen(request, timeout):
        requests.append((request.full_url, timeout))
        return _OllamaResponse([{"name": "qwen2.5:7b"}, {"name": "llava-llama3"}])

    monkeypatch.setattr(main.urllib.request, "urlopen", urlopen)

    assert any(getattr(route, "path", None) == "/health" for route in main.app.routes)
    result = main.health()

    assert result["status"] == "healthy"
    assert result["checks"]["database"]["status"] == "ok"
    assert result["checks"]["ollama"] == {
        "status": "ok",
        "message": "Running, 2 models available",
    }
    assert result["checks"]["embedder"]["status"] == "ok"
    assert result["checks"]["agents_mode"]["message"] == "all"
    assert requests == [("http://localhost:11434/api/tags", 5)]


def test_health_checks_the_configured_llm_server(monkeypatch):
    import tools
    import main

    tools.get_clock()
    monkeypatch.setenv("LLM_BASE_URL", "http://gpu-box:11434/v1/")
    monkeypatch.setattr(tools, "embedder_health", lambda: {"status": "disabled", "message": "Disabled"})
    urls = []

    def urlopen(request, timeout):
        urls.append(request.full_url)
        return _OllamaResponse([{"name": "qwen2.5:7b"}])

    monkeypatch.setattr(main.urllib.request, "urlopen", urlopen)

    main.health()

    assert urls == ["http://gpu-box:11434/api/tags"]


def test_health_degrades_gracefully_when_ollama_is_offline(monkeypatch):
    import urllib.error

    import main
    import tools

    tools.get_clock()
    monkeypatch.setattr(tools, "embedder_health", lambda: {
        "status": "disabled",
        "message": "Disabled by configuration",
    })

    def unreachable(_request, timeout):
        assert timeout == 5
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(main.urllib.request, "urlopen", unreachable)

    result = main.health()

    assert result["status"] == "degraded"
    assert result["checks"]["database"]["status"] == "ok"
    assert result["checks"]["ollama"]["status"] == "error"
    assert "Ollama not reachable" in result["checks"]["ollama"]["message"]


def test_health_reports_database_failure_without_raising(monkeypatch):
    from contextlib import contextmanager

    import main

    @contextmanager
    def unavailable_database():
        raise OSError("database unavailable")
        yield

    monkeypatch.setattr(main.db, "get_conn", unavailable_database)
    monkeypatch.setattr(main.urllib.request, "urlopen", lambda *_args, **_kwargs: _OllamaResponse([{"name": "qwen"}]))

    result = main.health()

    assert result["status"] == "degraded"
    assert result["checks"]["database"] == {
        "status": "error",
        "message": "database unavailable",
    }
    assert result["checks"]["ollama"]["status"] == "ok"
