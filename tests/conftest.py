import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

DEFAULT_RESPONSE = "Standard AI response."

_FN_MODULES = ["comms", "triage", "verification", "booking"]
_CLIENT_MODULES = ["intake", "similar_defect", "initial_inspection", "analytics"]


class FakeLLM:
    """Scripted LLM: `responses` popped FIFO, `calls` records each call's messages."""

    def __init__(self):
        self.responses: list[str] = []
        self.calls: list[list[dict]] = []
        self.client = MagicMock()
        self.client.chat.completions.create.side_effect = self._create

    def _create(self, **kwargs):
        self.calls.append(kwargs.get("messages", []))
        content = self.responses.pop(0) if self.responses else DEFAULT_RESPONSE
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


@pytest.fixture(autouse=True)
def fake_llm(request, monkeypatch):
    """Deterministic LLM for every unit test. Skipped for @pytest.mark.live_llm."""
    if request.node.get_closest_marker("live_llm"):
        yield None
        return
    import importlib
    fake = FakeLLM()
    for name in _FN_MODULES:
        mod = importlib.import_module(f"agents.simephony.{name}")
        monkeypatch.setattr(mod, "get_client", lambda: fake.client)
        monkeypatch.setattr(mod, "get_models", lambda: ("fake-vl", "fake-text"))
    for name in _CLIENT_MODULES:
        mod = importlib.import_module(f"agents.simephony.{name}")
        monkeypatch.setattr(mod, "client", fake.client)
    yield fake


@pytest.fixture
def sample_state():
    return {
        "user_description": "Water leak in master bathroom",
        "unit_id": "1201",
        "intake_result": {"category": "water_leak", "severity_hint": "NORMAL"},
        "triage_result": {},
        "reopen_count": 0,
        "current_status": "OPEN"
    }
