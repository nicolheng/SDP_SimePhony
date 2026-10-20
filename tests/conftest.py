
import os
import sys
import json
import pytest
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Path bootstrap — must come first so all test modules can import project code.
# ---------------------------------------------------------------------------
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from agents.simephony import llm_client

# ---------------------------------------------------------------------------
# Global LLM mock — prevents Ollama calls in ALL tests.
# Individual test modules monkeypatch the client directly for precise control;
# this autouse fixture is the safety net for tests that don't patch explicitly.
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def mock_llm_client(monkeypatch):
    mock_client = MagicMock()

    def mock_create(**kwargs):
        """Deterministic stub: inspects message content and returns appropriate JSON."""
        messages = kwargs.get("messages", [])
        system_msg = next(
            (m.get("content", "") for m in messages if m.get("role") == "system"), ""
        )
        user_msg_raw = next(
            (m.get("content", "") for m in messages if m.get("role") == "user"), ""
        )
        # user content may be a list of blocks (vision) or a plain string
        if isinstance(user_msg_raw, list):
            user_msg = " ".join(
                b.get("text", "") for b in user_msg_raw if isinstance(b, dict) and b.get("type") == "text"
            ).lower()
        else:
            user_msg = str(user_msg_raw).lower()

        combined = (system_msg + " " + user_msg).lower()

        # Intake node response — system prompt contains 'defect intake'
        if "defect intake" in system_msg.lower():
            return MagicMock(choices=[MagicMock(message=MagicMock(content=json.dumps({
                "category": "water_leak",
                "sub_category": "ceiling drip",
                "urgency": "normal",
                "location_in_unit": "master bedroom",
                "summary": "Water dripping from ceiling",
                "mentions_previous_issue": False,
                "mentioned_recurrence_count": None,
                "missing_info": [],
                "follow_up_question": "",
                "preliminary_outcome": "VALID_DEFECT",
                "mismatch_detected": False,
            })))])

        # similar_defect cluster_reason response
        if "cluster_reason" in system_msg:
            return MagicMock(choices=[MagicMock(message=MagicMock(content=json.dumps({
                "cluster_reason": "System detected multiple past cases in the database."
            })))])

        # initial_inspection brief response — system prompt contains 'Senior Property Inspector'
        if "Senior Property Inspector" in system_msg:
            return MagicMock(choices=[MagicMock(message=MagicMock(content=json.dumps({
                "timeline": [{"at": "2026-10", "text": "First report"}],
                "photoComparison": "Compare with original intake photo.",
                "neighbouringUnits": [],
                "likelyComponents": ["Waterproofing membrane"],
                "checklist": ["Verify water source", "Inspect waterproofing", "Document findings"],
            })))])

        # comms / other tests
        if "admit fault" in combined or "sorry we messed up" in combined:
            return MagicMock(choices=[MagicMock(message=MagicMock(
                content="I apologize for the mistake, we are at fault."))])
        if "water leak" in combined:
            return MagicMock(choices=[MagicMock(message=MagicMock(
                content="This is a high urgency plumbing leak."))])
        if "verification" in combined:
            return MagicMock(choices=[MagicMock(message=MagicMock(
                content="Please provide a photo of the repair."))])

        return MagicMock(choices=[MagicMock(message=MagicMock(content="Standard AI response."))])

    mock_client.chat.completions.create.side_effect = mock_create

    monkeypatch.setattr("agents.simephony.llm_client.get_client", lambda: mock_client)
    monkeypatch.setattr("agents.simephony.llm_client.get_models", lambda: ("llava-llama3", "qwen2.5:7b"))
    # Also patch the module-level client used by the agents directly
    monkeypatch.setattr("agents.simephony.llm_client.client", mock_client)


# ---------------------------------------------------------------------------
# Shared state fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_state():
    """Minimal valid state used by older unit tests (triage, comms, etc.)."""
    return {
        "user_description": "Water leak in master bathroom",
        "unit_id": "1201",
        "case_id": "C-001",
        "intake_result": {"category": "water_leak", "urgency": "normal", "severity_hint": "NORMAL"},
        "triage_result": {},
        "reopen_count": 0,
        "current_status": "OPEN",
    }


@pytest.fixture
def p1_initial_state():
    """
    Full state used by P1 pipeline tests (intake → similar_defect → initial_inspection).
    """
    return {
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": None,
        "unit_id": "A-12-08",
        "case_id": "C-TEST-001",
        "intake_result": {},
        "similar_cases_result": {},
        "initial_inspection_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED",
    }


@pytest.fixture
def recurring_similar_cases():
    """Two valid past cases that push total_occurrences to 3 (the escalation threshold)."""
    return [
        {"case_id": "C-001", "unit_id": "A-12-08", "category": "water_leak",
         "status": "CLOSED", "counts_toward_escalation": True},
        {"case_id": "C-002", "unit_id": "A-12-08", "category": "water_leak",
         "status": "CLOSED", "counts_toward_escalation": True},
    ]
