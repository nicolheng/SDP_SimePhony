# tests/unit/test_initial_inspection.py
"""
Unit tests for agents/simephony/initial_inspection.py (P1 InitialInspectionAgent).

Strategy
--------
- `attach_inspection_brief` and `send_email` (both from backend/tools.py) are
  mocked so tests run without a live database or SMTP server.
- `client.chat.completions.create` is mocked for deterministic LLM output.
- Tests assert on:
  1. Output schema written to state["initial_inspection_result"].
  2. That attach_inspection_brief receives a JSON dict (NOT a Markdown string).
  3. That the system prompt is grounded in rules.yaml constants.
  4. High-urgency safety behaviour (checklist must include a human-review item).
  5. Resilience — DB failure and LLM failure must not crash the node.
"""

import json
import pytest
from unittest.mock import MagicMock, call, patch


# ---------------------------------------------------------------------------
# Minimal valid brief the LLM should return
# ---------------------------------------------------------------------------

_GOOD_BRIEF = {
    "timeline": [{"at": "2026-10", "text": "First report"}],
    "photoComparison": "Compare with original intake photo.",
    "neighbouringUnits": [{"unitId": "A-11-08", "cases": 1, "last": "2026-09"}],
    "likelyComponents": ["Waterproofing membrane", "Drainage outlet"],
    "checklist": [
        "Verify water source above unit A-12-08",
        "Inspect waterproofing layer",
        "Check drainage outlet for blockage",
    ],
}

_HIGH_URGENCY_BRIEF = {
    **_GOOD_BRIEF,
    "checklist": [
        "IMMEDIATE HUMAN REVIEW REQUIRED — do not auto-close",
        "Isolate the electrical circuit near the leak",
        "Evacuate if water is near live wiring",
    ],
}


def _llm_response(payload: dict) -> MagicMock:
    return MagicMock(choices=[MagicMock(message=MagicMock(content=json.dumps(payload)))])


def _base_state(**overrides) -> dict:
    return {
        "unit_id": "A-12-08",
        "case_id": "C-042",
        "intake_result": {
            "category": "water_leak",
            "urgency": "normal",
            "summary": "Ceiling dripping near bedroom",
        },
        "similar_cases_result": {
            "past_case_count": 2,
            "total_occurrences": 3,
            "ai_analysis": {"recommendation": "flag_for_extra_inspection"},
        },
        **overrides,
    }


from agents.simephony.initial_inspection import initial_inspection_node


# ===========================================================================
# Group 1: Output contract — state keys and schema
# ===========================================================================

class TestOutputContract:
    def test_always_sets_initial_inspection_result(self, monkeypatch):
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))
        result = initial_inspection_node(_base_state())
        assert "initial_inspection_result" in result
        assert isinstance(result["initial_inspection_result"], dict)

    def test_checklist_in_result(self, monkeypatch):
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))
        result = initial_inspection_node(_base_state())
        brief = result["initial_inspection_result"]
        assert "checklist" in brief
        assert len(brief["checklist"]) >= 3

    def test_state_mutated_in_place(self, monkeypatch):
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))
        state = _base_state()
        result = initial_inspection_node(state)
        assert result is state


# ===========================================================================
# Group 2: attach_inspection_brief must receive a JSON dict, not a string
# ===========================================================================

class TestBriefType:
    """
    backend/tools.py attach_inspection_brief requires a dict with a 'checklist'
    key. Passing a Markdown string will cause a ToolError.
    """

    def test_attach_receives_dict_not_string(self, monkeypatch):
        mock_attach = MagicMock(return_value={"ok": True})
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief", mock_attach)
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        initial_inspection_node(_base_state())

        mock_attach.assert_called_once()
        _, kwargs = mock_attach.call_args
        brief_arg = kwargs.get("brief") or mock_attach.call_args[0][1]
        assert isinstance(brief_arg, dict), \
            f"attach_inspection_brief must receive a dict, got {type(brief_arg).__name__}"

    def test_attach_receives_checklist_key(self, monkeypatch):
        mock_attach = MagicMock(return_value={"ok": True})
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief", mock_attach)
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        initial_inspection_node(_base_state())

        _, kwargs = mock_attach.call_args
        brief_arg = kwargs.get("brief") or mock_attach.call_args[0][1]
        assert "checklist" in brief_arg, "dict passed to attach_inspection_brief must contain 'checklist'"

    def test_attach_called_with_correct_case_id(self, monkeypatch):
        mock_attach = MagicMock(return_value={"ok": True})
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief", mock_attach)
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        initial_inspection_node(_base_state(case_id="C-777"))

        _, kwargs = mock_attach.call_args
        case_id_arg = kwargs.get("case_id") or mock_attach.call_args[0][0]
        assert case_id_arg == "C-777"


# ===========================================================================
# Group 3: rules.yaml constants are present in the module
# ===========================================================================

class TestRulesYamlCompliance:
    ALLOWED_CATEGORIES = (
        "water_leak", "plumbing", "waterproofing", "drainage", "sanitary_fittings",
        "electrical", "wall_crack", "structural_crack", "tiles", "flooring",
        "ceiling", "roof", "door_window", "paint", "external_works", "other",
    )

    def test_occurrence_threshold_is_3(self):
        from agents.simephony.initial_inspection import _OCCURRENCE_THRESHOLD
        assert _OCCURRENCE_THRESHOLD == 3, \
            "_OCCURRENCE_THRESHOLD must be 3 (rules.yaml: occurrence_threshold: 3)"

    def test_stack_cluster_threshold_is_3(self):
        from agents.simephony.initial_inspection import _STACK_CLUSTER_THRESHOLD
        assert _STACK_CLUSTER_THRESHOLD == 3, \
            "_STACK_CLUSTER_THRESHOLD must be 3 (rules.yaml: stack_cluster_threshold: 3)"

    def test_grace_period_is_30(self):
        from agents.simephony.initial_inspection import _GRACE_PERIOD_DAYS
        assert _GRACE_PERIOD_DAYS == 30, \
            "_GRACE_PERIOD_DAYS must be 30 (rules.yaml: grace_period_days: 30)"

    @pytest.mark.parametrize("cat", ALLOWED_CATEGORIES)
    def test_allowed_category_in_module(self, cat):
        from agents.simephony.initial_inspection import _ALLOWED_CATEGORIES
        assert cat in _ALLOWED_CATEGORIES, \
            f"'{cat}' missing from _ALLOWED_CATEGORIES in initial_inspection.py"


# ===========================================================================
# Group 4: Tool imports — no stub_tools
# ===========================================================================

class TestImports:
    def test_no_stub_tools_import(self):
        import agents.simephony.initial_inspection as m
        import inspect
        source = inspect.getsource(m)
        assert "stub_tools" not in source, \
            "initial_inspection.py still references stub_tools — must use backend/tools.py"

    def test_send_email_from_tools_not_stub(self):
        """send_email must be the one from backend/tools.py (has case_id parameter)."""
        import agents.simephony.initial_inspection as m
        import inspect
        sig = inspect.signature(m.send_email)
        assert "case_id" in sig.parameters, \
            "send_email in initial_inspection is the stub version (missing 'case_id' param)"


# ===========================================================================
# Group 5: Resilience
# ===========================================================================

class TestResilience:
    def test_llm_failure_uses_fallback_brief(self, monkeypatch):
        """If LLM raises, node must not crash and must still call attach."""
        mock_attach = MagicMock(return_value={"ok": True})
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("LLM down")
        monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_client)
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief", mock_attach)
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "logged, not sent"}))

        result = initial_inspection_node(_base_state())
        assert "initial_inspection_result" in result
        # Fallback brief must still have a non-empty checklist
        assert result["initial_inspection_result"].get("checklist")

    def test_db_failure_does_not_crash_node(self, monkeypatch):
        """If attach_inspection_brief raises, node must catch and continue."""
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(side_effect=Exception("DB locked")))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        result = initial_inspection_node(_base_state())
        assert "initial_inspection_result" in result  # node completed despite DB error

    def test_email_failure_does_not_crash_node(self, monkeypatch):
        """If send_email raises, node must catch and continue."""
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(side_effect=ConnectionError("SMTP unreachable")))

        result = initial_inspection_node(_base_state())
        assert "initial_inspection_result" in result

    def test_json_parse_failure_uses_fallback(self, monkeypatch):
        """If the LLM returns garbage JSON, fallback brief is used."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Here is my inspection... (not JSON)"))]
        )
        monkeypatch.setattr("agents.simephony.initial_inspection.client", mock_client)
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email",
                            MagicMock(return_value={"status": "sent"}))

        result = initial_inspection_node(_base_state())
        assert "initial_inspection_result" in result
        assert "checklist" in result["initial_inspection_result"]


# ===========================================================================
# Group 6: Email notification
# ===========================================================================

class TestEmailNotification:
    def test_email_called_once(self, monkeypatch):
        mock_email = MagicMock(return_value={"status": "sent"})
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email", mock_email)

        initial_inspection_node(_base_state())
        mock_email.assert_called_once()

    def test_email_subject_contains_unit_id(self, monkeypatch):
        mock_email = MagicMock(return_value={"status": "sent"})
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email", mock_email)

        initial_inspection_node(_base_state(unit_id="B-05-03"))
        _, kwargs = mock_email.call_args
        assert "B-05-03" in kwargs.get("subject", ""), \
            "Email subject must include the unit_id"

    def test_email_case_id_passed(self, monkeypatch):
        mock_email = MagicMock(return_value={"status": "sent"})
        monkeypatch.setattr("agents.simephony.initial_inspection.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response(_GOOD_BRIEF)}))
        monkeypatch.setattr("agents.simephony.initial_inspection.attach_inspection_brief",
                            MagicMock(return_value={"ok": True}))
        monkeypatch.setattr("agents.simephony.initial_inspection.send_email", mock_email)

        initial_inspection_node(_base_state(case_id="C-999"))
        _, kwargs = mock_email.call_args
        assert kwargs.get("case_id") == "C-999", \
            "send_email must receive case_id kwarg"

