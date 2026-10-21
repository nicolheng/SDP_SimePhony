# tests/conftest.py
import os
import sys
import json
import pytest
import importlib
from unittest.mock import MagicMock
from types import SimpleNamespace

# ---------------------------------------------------------------------------
# Path bootstrap — must come first so all test modules can import project code.
# ---------------------------------------------------------------------------
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_RESPONSE = "Standard AI response."
_FN_MODULES = ["comms", "triage", "verification", "booking"]
_CLIENT_MODULES = ["intake", "similar_defect", "initial_inspection", "analytics"]


# ---------------------------------------------------------------------------
# Hybrid FakeLLM (Teammate's FIFO queue + Your deterministic JSON fallback)
# ---------------------------------------------------------------------------
class FakeLLM:
    """
    Scripted LLM for unit tests.
    1. If a test queues a response via `fake_llm.responses.append(...)`, it uses that (FIFO).
    2. Otherwise, it falls back to deterministic content-inspection to return valid JSON for the AI pipeline tests (Intake, SimilarDefect, InitialInspection).
    """

    def __init__(self):
        self.responses: list[str] = []
        self.calls: list[list[dict]] = []
        self.client = MagicMock()
        self.client.chat.completions.create.side_effect = self._create

    def _create(self, **kwargs):
        self.calls.append(kwargs.get("messages", []))
        
        # 1. Use queued response if available
        if self.responses:
            content = self.responses.pop(0)
        else:
            # 2. Fallback to deterministic content-inspection
            content = self._get_deterministic_response(kwargs)
            
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    def _get_deterministic_response(self, kwargs) -> str:
        messages = kwargs.get("messages", [])
        system_msg = next((m.get("content", "") for m in messages if m.get("role") == "system"), "")
        user_msg_raw = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
        
        if isinstance(user_msg_raw, list):
            user_msg = " ".join(b.get("text", "") for b in user_msg_raw if isinstance(b, dict) and b.get("type") == "text").lower()
        else:
            user_msg = str(user_msg_raw).lower()
            
        combined = (system_msg + " " + user_msg).lower()

        # Intake node response
        if "defect intake" in system_msg.lower():
            return json.dumps({
                "category": "water_leak", "sub_category": "ceiling drip", "urgency": "normal",
                "location_in_unit": "master bedroom", "summary": "Water dripping from ceiling",
                "mentions_previous_issue": False, "mentioned_recurrence_count": None,
                "missing_info": [], "follow_up_question": "",
                "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False,
            })
        
        # similar_defect cluster_reason response
        if "cluster_reason" in system_msg:
            return json.dumps({"cluster_reason": "System detected multiple past cases in the database."})
        
        # initial_inspection brief response
        if "Senior Property Inspector" in system_msg:
            return json.dumps({
                "timeline": [{"at": "2026-10", "text": "First report"}],
                "photoComparison": "Compare with original intake photo.",
                "neighbouringUnits": [], "likelyComponents": ["Waterproofing membrane"],
                "checklist": ["Verify water source", "Inspect waterproofing", "Document findings"],
            })

        # Comms / Liability checks
        if "admit fault" in combined or "sorry we messed up" in combined:
            return "I apologize for the mistake, we are at fault."
        if "water leak" in combined:
            return "This is a high urgency plumbing leak."
        if "verification" in combined:
            return "Please provide a photo of the repair."

        return DEFAULT_RESPONSE


# ---------------------------------------------------------------------------
# Global LLM Mock Fixture
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def fake_llm(request, monkeypatch):
    """Deterministic LLM for every unit test. Skipped for @pytest.mark.live_llm."""
    if request.node.get_closest_marker("live_llm"):
        yield None
        return
        
    fake = FakeLLM()
    
    # Patch function-based modules (P2/P3/P4)
    for name in _FN_MODULES:
        try:
            mod = importlib.import_module(f"agents.simephony.{name}")
            monkeypatch.setattr(mod, "get_client", lambda: fake.client)
            monkeypatch.setattr(mod, "get_models", lambda: ("fake-vl", "fake-text"))
        except ImportError:
            pass
            
    # Patch module-level client variables (P1)
    for name in _CLIENT_MODULES:
        try:
            mod = importlib.import_module(f"agents.simephony.{name}")
            monkeypatch.setattr(mod, "client", fake.client)
        except ImportError:
            pass
            
    yield fake


# ---------------------------------------------------------------------------
# Shared State Fixtures
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
    """Full state used by P1 pipeline tests (intake → similar_defect → initial_inspection)."""
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
        {"case_id": "C-001", "unit_id": "A-12-08", "category": "water_leak", "status": "CLOSED", "counts_toward_escalation": True},
        {"case_id": "C-002", "unit_id": "A-12-08", "category": "water_leak", "status": "CLOSED", "counts_toward_escalation": True},
    ]

# ---------------------------------------------------------------------------
# Temporary copy of data/seed.db for tests that call backend/tools.py (opt-in)
# ---------------------------------------------------------------------------
@pytest.fixture
def seed_db(tmp_path, monkeypatch):
    """Point backend/tools.py at a fresh copy of data/seed.db; the live DB, uploads/ and Gmail are untouched."""
    import shutil
    backend = os.path.join(_ROOT, "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)
    import db
    import tools

    path = tmp_path / "seed_copy.db"
    shutil.copyfile(os.path.join(_ROOT, "data", "seed.db"), path)
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(tools, "UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setenv("EMAIL_ENABLED", "false")
    monkeypatch.setenv("EMBEDDINGS_ENABLED", "false")
    return path


# ---------------------------------------------------------------------------
# Fake escalation tools for graph tests that use made-up case ids (no DB)
# ---------------------------------------------------------------------------
class FakeEscalationDB:
    """Stands in for tools.check_escalation: set `earlier` (same-unit cases before this one),
    `stack_units` (units in the stack with this defect, incl. this one) and `pending` (approval id)."""

    def __init__(self):
        self.earlier, self.stack_units, self.pending, self.db_reopens = 0, 1, None, 0
        self.calls: list[str] = []
        self.request = MagicMock(return_value={"ok": True, "approval_id": "APR-STUB", "issue_id": "SI-STUB"})

    def check(self, case_id):
        self.calls.append(case_id)
        reasons = [f"{self.stack_units} units in stack A-08 have the same problem."] if self.stack_units >= 3 else []
        return {"case_id": case_id, "occurrence_count": self.earlier + 1, "reopen_count": self.db_reopens,
                "stack_unit_count": self.stack_units, "reasons": reasons, "pending_approval_id": self.pending}


@pytest.fixture
def escalation_db(monkeypatch):
    from agents.simephony import backend_tools, recurrence
    fake = FakeEscalationDB()
    monkeypatch.setattr(backend_tools, "check_escalation", fake.check)
    monkeypatch.setattr(recurrence, "request_extra_inspection", fake.request)
    return fake


# ---------------------------------------------------------------------------
# Safety net: tests never write the live data/simephony.db through tools.py
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _no_live_db_writes(request, monkeypatch):
    """Unless a test asks for `seed_db` (a temp copy), agent calls that write the DB are faked."""
    if "seed_db" in request.fixturenames:
        return
    from agents.simephony import backend_tools, recurrence
    monkeypatch.setattr(backend_tools, "start_verification",
                        MagicMock(return_value={"ok": True, "verification_id": "V-STUB", "status": "PENDING_SIGNOFF"}))
    monkeypatch.setattr(recurrence, "request_extra_inspection",
                        MagicMock(return_value={"ok": False, "error": "live DB writes are disabled in tests"}))
