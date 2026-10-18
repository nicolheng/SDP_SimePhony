
import pytest
from unittest.mock import MagicMock
from agents.simephony import llm_client

# Mock the LLM client to avoid needing Ollama for CI/Tests
@pytest.fixture(autouse=True)
def mock_llm_client(monkeypatch):
    mock_client = MagicMock()
    
    # Default behavior for chat.completions.create
    def mock_create(**kwargs):
        # Simple echo/deterministic response based on prompt content
        prompt = kwargs.get('messages', [{}])[-1].get('content', '').lower()
        
        if 'admit fault' in prompt or 'sorry we messed up' in prompt:
            return MagicMock(choices=[MagicMock(message=MagicMock(content="I apologize for the mistake, we are at fault."))])
        if 'water leak' in prompt:
            return MagicMock(choices=[MagicMock(message=MagicMock(content="This is a high urgency plumbing leak."))])
        if 'verification' in prompt:
            return MagicMock(choices=[MagicMock(message=MagicMock(content="Please provide a photo of the repair."))])
        
        return MagicMock(choices=[MagicMock(message=MagicMock(content="Standard AI response."))])

    mock_client.chat.completions.create.side_effect = mock_create
    
    # Patch the get_client and get_models functions in the simephony package
    monkeypatch.setattr("agents.simephony.llm_client.get_client", lambda: mock_client)
    monkeypatch.setattr("agents.simephony.llm_client.get_models", lambda: ("llava-llama3", "qwen2.5:7b"))

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
