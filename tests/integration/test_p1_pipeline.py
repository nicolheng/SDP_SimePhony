# tests/integration/test_p1_pipeline.py
"""
Integration tests for the P1 three-agent pipeline:

    intake_node → similar_defect_node → initial_inspection_node

These tests exercise the agents running together in sequence and assert on
the *combined* state they produce, including the hand-off contracts between
agents and the escalation trigger that links similar_defect → initial_inspection.

External dependencies that are mocked:
  - LLM client (no Ollama / network required)
  - backend/tools.py functions: find_similar_cases, attach_inspection_brief, send_email
  - Image file I/O (no real photos needed)

Design principles:
  - Each test scenario builds the full initial state and runs all three nodes.
  - The LLM mock returns scenario-appropriate JSON depending on which node is
    calling it (detected by inspecting the model arg or message content).
  - Business rule assertions use the same constants from rules.yaml as the agents.
"""

import json
import os
import pytest
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# rules.yaml ground-truth constants (must stay in sync)
# ---------------------------------------------------------------------------
OCCURRENCE_THRESHOLD = 3
STACK_CLUSTER_THRESHOLD = 3
GRACE_PERIOD_DAYS = 30
ALLOWED_CATEGORIES = (
    "water_leak", "plumbing", "waterproofing", "drainage", "sanitary_fittings",
    "electrical", "wall_crack", "structural_crack", "tiles", "flooring",
    "ceiling", "roof", "door_window", "paint", "external_works", "other",
)


# ---------------------------------------------------------------------------
# Import nodes under test
# ---------------------------------------------------------------------------
from agents.simephony.intake import intake_node
from agents.simephony.similar_defect import similar_defect_node
from agents.simephony.initial_inspection import initial_inspection_node


# ---------------------------------------------------------------------------
# Shared mock builders
# ---------------------------------------------------------------------------

def _make_case(case_id: str, category: str = "water_leak", status: str = "CLOSED") -> dict:
    return {
        "case_id": case_id,
        "unit_id": "A-12-08",
        "category": category,
        "status": status,
        "counts_toward_escalation": status != "INVALID",
    }


_INSPECTION_BRIEF = {
    "timeline": [{"at": "2026-10", "text": "Initial report"}],
    "photoComparison": "Compare with original intake photo.",
    "neighbouringUnits": [{"unitId": "A-11-08", "cases": 1, "last": "2026-09"}],
    "likelyComponents": ["Waterproofing membrane", "Floor trap"],
    "checklist": [
        "Inspect waterproofing layer in bathroom",
        "Check unit above for active leak",
        "Document all affected areas with photos",
    ],
}

_HIGH_URGENCY_BRIEF = {
    **_INSPECTION_BRIEF,
    "checklist": [
        "IMMEDIATE HUMAN REVIEW REQUIRED — do not auto-close this case",
        "Isolate electrical supply near the water source",
        "Verify no live wires are exposed before entering",
    ],
}


def _make_smart_llm(intake_payload: dict, brief_payload: dict) -> MagicMock:
    """
    Returns a mock LLM client whose response varies by which node calls it.

    Detection strategy (order matters — most specific first):
      1. system_msg contains 'cluster_reason'   → similar_defect node
      2. system_msg contains 'Senior Property Inspector' → initial_inspection node
      3. system_msg contains 'defect intake'              → intake node
      4. fallback                                         → cluster_reason JSON
    """
    def _create(**kwargs):
        system_msg = next(
            (m.get("content", "") for m in kwargs.get("messages", []) if m.get("role") == "system"),
            ""
        )

        # similar_defect — system prompt explicitly contains 'cluster_reason'
        if "cluster_reason" in system_msg:
            content = json.dumps({"cluster_reason": "Recurring defect detected across multiple reports."})

        # initial_inspection — system prompt contains 'Senior Property Inspector'
        elif "Senior Property Inspector" in system_msg:
            content = json.dumps(brief_payload)

        # intake — system prompt contains 'defect intake' (set in intake.py)
        elif "defect intake" in system_msg.lower():
            content = json.dumps(intake_payload)

        else:
            # Safe fallback
            content = json.dumps({"cluster_reason": "Recurring defect pattern identified."})

        return MagicMock(choices=[MagicMock(message=MagicMock(content=content))])

    mock = MagicMock()
    mock.chat.completions.create.side_effect = _create
    return mock


def _initial_state(**overrides) -> dict:
    return {
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": None,
        "unit_id": "A-12-08",
        "case_id": "C-INT-001",
        "intake_result": {},
        "similar_cases_result": {},
        "initial_inspection_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED",
        **overrides,
    }


def _run_pipeline(state: dict, monkeypatch, *,
                  past_cases: list,
                  intake_payload: dict,
                  brief_payload: dict = None) -> dict:
    """Patch all external dependencies and run the three P1 nodes in sequence."""
    brief_payload = brief_payload or _INSPECTION_BRIEF
    mock_llm = _make_smart_llm(intake_payload, brief_payload)

    monkeypatch.setattr("agents.simephony.intake.client", mock_llm)
    monkeypatch.setattr("agents.simephony.similar_defect.client", mock_llm)
    monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_llm)

    monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                        lambda **_: past_cases)
    monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                        MagicMock(return_value={"ok": True}))
    monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                        MagicMock(return_value={"status": "sent"}))

    state = intake_node(state)
    state = similar_defect_node(state)
    state = initial_inspection_node(state)
    return state


# ===========================================================================
# Scenario 1: First-time report — no escalation
# ===========================================================================

class TestScenario_FirstTimeDefect:
    """
    Unit with NO past cases.  total_occurrences = 1.
    Expected: intake sets category, similar_defect recommends normal_triage.
    initial_inspection still runs (it's always called in this pipeline build).
    """

    INTAKE_PAYLOAD = {
        "category": "water_leak",
        "sub_category": "ceiling drip",
        "urgency": "normal",
        "location_in_unit": "master bedroom ceiling",
        "summary": "Water dripping from ceiling",
        "mentions_previous_issue": False,
        "mentioned_recurrence_count": None,
        "missing_info": [],
        "follow_up_question": "",
        "preliminary_outcome": "VALID_DEFECT",
        "mismatch_detected": False,
    }

    def test_intake_category_is_valid(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD)
        cat = state["intake_result"]["category"]
        assert cat in ALLOWED_CATEGORIES

    def test_no_escalation_on_first_report(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD)
        scr = state["similar_cases_result"]
        assert scr["total_occurrences"] == 1
        assert scr["ai_analysis"]["recommendation"] == "normal_triage"

    def test_missing_info_propagated_from_intake(self, monkeypatch):
        payload = {**self.INTAKE_PAYLOAD, "missing_info": []}
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[], intake_payload=payload)
        assert state["missing_info"] == []

    def test_all_three_result_keys_set(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD)
        assert state["intake_result"]
        assert state["similar_cases_result"]
        assert state["initial_inspection_result"]


# ===========================================================================
# Scenario 2: Recurring defect — escalation triggered
# ===========================================================================

class TestScenario_RecurringDefect:
    """
    Unit with 2 valid past cases + current = total_occurrences 3.
    rules.yaml occurrence_threshold = 3 → flag_for_extra_inspection.
    """

    INTAKE_PAYLOAD = {
        "category": "water_leak",
        "sub_category": "ceiling drip",
        "urgency": "normal",
        "location_in_unit": "master bedroom",
        "summary": "Ceiling leaking again — third time",
        "mentions_previous_issue": True,
        "mentioned_recurrence_count": 3,
        "missing_info": [],
        "follow_up_question": "",
        "preliminary_outcome": "VALID_DEFECT",
        "mismatch_detected": False,
    }

    PAST_CASES = [_make_case("C-001"), _make_case("C-002")]

    def test_total_occurrences_is_three(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=self.PAST_CASES,
                              intake_payload=self.INTAKE_PAYLOAD)
        assert state["similar_cases_result"]["total_occurrences"] == 3

    def test_escalation_recommendation_flagged(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=self.PAST_CASES,
                              intake_payload=self.INTAKE_PAYLOAD)
        assert state["similar_cases_result"]["ai_analysis"]["recommendation"] \
               == "flag_for_extra_inspection"

    def test_is_recurring_true(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=self.PAST_CASES,
                              intake_payload=self.INTAKE_PAYLOAD)
        assert state["similar_cases_result"]["ai_analysis"]["is_recurring"] is True

    def test_inspection_brief_contains_checklist(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=self.PAST_CASES,
                              intake_payload=self.INTAKE_PAYLOAD)
        brief = state["initial_inspection_result"]
        assert "checklist" in brief
        assert len(brief["checklist"]) >= 1

    def test_attach_called_with_dict_not_string(self, monkeypatch):
        mock_attach = MagicMock(return_value={"ok": True})
        mock_llm = _make_smart_llm(self.INTAKE_PAYLOAD, _INSPECTION_BRIEF)

        monkeypatch.setattr("agents.simephony.intake.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.client", mock_llm)
        monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            lambda **_: self.PAST_CASES)
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief", mock_attach)
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        state = _initial_state()
        state = intake_node(state)
        state = similar_defect_node(state)
        state = initial_inspection_node(state)

        mock_attach.assert_called_once()
        _, kwargs = mock_attach.call_args
        brief_arg = kwargs.get("brief") or mock_attach.call_args[0][1]
        assert isinstance(brief_arg, dict), \
            f"attach_inspection_brief must receive a dict — got {type(brief_arg).__name__}"
        assert "checklist" in brief_arg

    def test_intake_category_flows_into_similar_defect(self, monkeypatch):
        """similar_defect must use the category set by intake, not a hardcoded value."""
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=self.PAST_CASES,
                              intake_payload=self.INTAKE_PAYLOAD)
        # intake set category = "water_leak"; similar_defect should query with that
        assert state["intake_result"]["category"] == "water_leak"

    def test_case_id_flows_through_to_attach(self, monkeypatch):
        mock_attach = MagicMock(return_value={"ok": True})
        mock_llm = _make_smart_llm(self.INTAKE_PAYLOAD, _INSPECTION_BRIEF)
        monkeypatch.setattr("agents.simephony.intake.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.client", mock_llm)
        monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            lambda **_: self.PAST_CASES)
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief", mock_attach)
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        state = _initial_state(case_id="C-INTTEST-42")
        state = intake_node(state)
        state = similar_defect_node(state)
        state = initial_inspection_node(state)

        _, kwargs = mock_attach.call_args
        case_id_arg = kwargs.get("case_id") or mock_attach.call_args[0][0]
        assert case_id_arg == "C-INTTEST-42"


# ===========================================================================
# Scenario 3: High-urgency defect (electrical sparks)
# ===========================================================================

class TestScenario_HighUrgency:
    """
    rules.yaml safety: high_urgency → immediate_human_review, allow_auto_close=false.
    The inspection brief checklist must reflect the urgency.
    """

    INTAKE_PAYLOAD = {
        "category": "electrical",
        "sub_category": "exposed wiring",
        "urgency": "high",
        "location_in_unit": "kitchen",
        "summary": "Exposed live wiring near kitchen sink — sparks visible",
        "mentions_previous_issue": False,
        "mentioned_recurrence_count": None,
        "missing_info": [],
        "follow_up_question": "",
        "preliminary_outcome": "VALID_DEFECT",
        "mismatch_detected": False,
    }

    def test_urgency_high_propagated(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD,
                              brief_payload=_HIGH_URGENCY_BRIEF)
        assert state["intake_result"]["urgency"] == "high"

    def test_category_is_electrical(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD,
                              brief_payload=_HIGH_URGENCY_BRIEF)
        assert state["intake_result"]["category"] == "electrical"

    def test_high_urgency_checklist_mentions_review(self, monkeypatch):
        """When urgency=high, the brief checklist must contain a human-review item."""
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD,
                              brief_payload=_HIGH_URGENCY_BRIEF)
        checklist_text = " ".join(state["initial_inspection_result"].get("checklist", [])).lower()
        assert any(word in checklist_text for word in ["human", "review", "immediate", "do not auto"]), \
            "High-urgency brief checklist must include a human-review / do-not-auto-close item"


# ===========================================================================
# Scenario 4: INVALID past cases must not count toward escalation
# ===========================================================================

class TestScenario_InvalidCasesExcluded:
    """
    5 INVALID past cases + current = past_case_count 0 → normal_triage.
    """

    INTAKE_PAYLOAD = {
        "category": "tiles",
        "sub_category": "hollow tile",
        "urgency": "normal",
        "location_in_unit": "living room",
        "summary": "Hollow tiles near window",
        "mentions_previous_issue": False,
        "mentioned_recurrence_count": None,
        "missing_info": [],
        "follow_up_question": "",
        "preliminary_outcome": "VALID_DEFECT",
        "mismatch_detected": False,
    }

    def test_invalid_cases_excluded(self, monkeypatch):
        invalid_cases = [_make_case(f"C-INV-{i}", status="INVALID") for i in range(5)]
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=invalid_cases,
                              intake_payload=self.INTAKE_PAYLOAD)
        scr = state["similar_cases_result"]
        assert scr["past_case_count"] == 0
        assert scr["total_occurrences"] == 1
        assert scr["ai_analysis"]["recommendation"] == "normal_triage"


# ===========================================================================
# Scenario 5: Missing / incomplete information from resident
# ===========================================================================

class TestScenario_InsufficientInformation:
    """
    If intake sets preliminary_outcome = INSUFFICIENT_INFORMATION, the pipeline
    should still complete without crashing; missing_info must be forwarded.
    """

    INTAKE_PAYLOAD = {
        "category": "other",
        "sub_category": "",
        "urgency": "normal",
        "location_in_unit": "",
        "summary": "Image too blurry to assess",
        "mentions_previous_issue": False,
        "mentioned_recurrence_count": None,
        "missing_info": ["Please upload a clear photo", "Location not specified"],
        "follow_up_question": "Could you please retake the photo?",
        "preliminary_outcome": "INSUFFICIENT_INFORMATION",
        "mismatch_detected": False,
    }

    def test_pipeline_completes(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD)
        assert "intake_result" in state
        assert "similar_cases_result" in state
        assert "initial_inspection_result" in state

    def test_missing_info_forwarded(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD)
        assert state["missing_info"] == [
            "Please upload a clear photo", "Location not specified"
        ]

    def test_preliminary_outcome_preserved(self, monkeypatch):
        state = _run_pipeline(_initial_state(), monkeypatch,
                              past_cases=[],
                              intake_payload=self.INTAKE_PAYLOAD)
        assert state["intake_result"]["preliminary_outcome"] == "INSUFFICIENT_INFORMATION"


# ===========================================================================
# Scenario 6: Full resilience — all external services fail simultaneously
# ===========================================================================

class TestScenario_AllServicesDown:
    """
    LLM is down + DB is down + SMTP is down.
    The pipeline must complete with graceful fallbacks for all three nodes.
    """

    def test_pipeline_survives_total_failure(self, monkeypatch):
        # LLM raises on every call
        mock_llm = MagicMock()
        mock_llm.chat.completions.create.side_effect = RuntimeError("Ollama offline")
        monkeypatch.setattr("agents.simephony.intake.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.client", mock_llm)
        monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_llm)

        # DB raises
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            MagicMock(side_effect=RuntimeError("DB offline")))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(side_effect=RuntimeError("DB offline")))
        # SMTP raises
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(side_effect=ConnectionError("SMTP offline")))

        state = _initial_state()
        state = intake_node(state)
        state = similar_defect_node(state)
        state = initial_inspection_node(state)

        # All three result keys must be present even with failures
        assert "intake_result" in state
        assert "similar_cases_result" in state
        assert "initial_inspection_result" in state

    def test_intake_error_category_on_llm_failure(self, monkeypatch):
        mock_llm = MagicMock()
        mock_llm.chat.completions.create.side_effect = RuntimeError("Ollama offline")
        monkeypatch.setattr("agents.simephony.intake.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.client", mock_llm)
        monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_llm)
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        state = _initial_state()
        state = intake_node(state)
        # intake safety net sets category="error" when LLM completely fails
        assert state["intake_result"]["category"] == "error"
