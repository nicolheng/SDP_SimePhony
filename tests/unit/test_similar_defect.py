# tests/unit/test_similar_defect.py
"""
Unit tests for agents/simephony/similar_defect.py (P1 SimilarDefectAgent).

Strategy
--------
- `find_similar_cases` (backend/tools.py) is mocked so tests run offline.
- `client.chat.completions.create` is mocked to return deterministic JSON.
- Tests assert on the Python escalation logic, NOT on LLM output.
  The rules.yaml threshold (occurrence_threshold = 3) is the primary subject.
"""

import json
import pytest
from unittest.mock import MagicMock, patch

from agents.simephony.similar_defect import similar_defect_node, _OCCURRENCE_THRESHOLD


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _llm_response(cluster_reason: str = "Recurring issue detected.") -> MagicMock:
    content = json.dumps({"cluster_reason": cluster_reason, "confidence_score": 0.9})
    return MagicMock(choices=[MagicMock(message=MagicMock(content=content))])


def _make_case(case_id: str, status: str = "CLOSED") -> dict:
    return {
        "case_id": case_id,
        "unit_id": "A-12-08",
        "category": "water_leak",
        "status": status,
        "counts_toward_escalation": status != "INVALID",
    }


def _base_state(**overrides) -> dict:
    return {
        "user_description": "Ceiling bocor lagi",
        "unit_id": "A-12-08",
        "intake_result": {"category": "water_leak"},
        **overrides,
    }


# ===========================================================================
# Group 1: Output contract
# ===========================================================================

class TestOutputContract:
    def test_always_sets_similar_cases_result(self, monkeypatch):
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        result = similar_defect_node(_base_state())
        assert "similar_cases_result" in result

    def test_result_has_required_keys(self, monkeypatch):
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        scr = similar_defect_node(_base_state())["similar_cases_result"]
        assert "past_case_count" in scr
        assert "total_occurrences" in scr
        assert "ai_analysis" in scr
        assert "recommendation" in scr["ai_analysis"]
        assert "is_recurring" in scr["ai_analysis"]

    def test_state_is_mutated_in_place(self, monkeypatch):
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        state = _base_state()
        result = similar_defect_node(state)
        assert result is state


# ===========================================================================
# Group 2: Escalation threshold logic (rules.yaml: occurrence_threshold = 3)
# ===========================================================================

class TestEscalationThreshold:
    """
    The Python code — NOT the LLM — decides the recommendation.
    total_occurrences = past_case_count + 1 (current case).
    """

    def _run(self, monkeypatch, past_cases: list) -> dict:
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            lambda **_: past_cases)
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        return similar_defect_node(_base_state())["similar_cases_result"]

    def test_zero_past_cases_normal_triage(self, monkeypatch):
        scr = self._run(monkeypatch, [])
        assert scr["past_case_count"] == 0
        assert scr["total_occurrences"] == 1
        assert scr["ai_analysis"]["recommendation"] == "normal_triage"
        assert scr["ai_analysis"]["is_recurring"] is False

    def test_one_past_case_normal_triage(self, monkeypatch):
        scr = self._run(monkeypatch, [_make_case("C-001")])
        assert scr["total_occurrences"] == 2
        assert scr["ai_analysis"]["recommendation"] == "normal_triage"
        assert scr["ai_analysis"]["is_recurring"] is True

    def test_two_past_cases_normal_triage(self, monkeypatch):
        """2 past + 1 current = 3 → crosses threshold → flag_for_extra_inspection."""
        scr = self._run(monkeypatch, [_make_case("C-001"), _make_case("C-002")])
        assert scr["total_occurrences"] == 3
        # At exactly threshold → flag
        assert scr["ai_analysis"]["recommendation"] == "flag_for_extra_inspection"

    def test_three_past_cases_flag_inspection(self, monkeypatch):
        """3 past + 1 current = 4 → well above threshold."""
        scr = self._run(monkeypatch, [_make_case(f"C-00{i}") for i in range(3)])
        assert scr["total_occurrences"] == 4
        assert scr["ai_analysis"]["recommendation"] == "flag_for_extra_inspection"

    def test_threshold_constant_matches_rules_yaml(self):
        """_OCCURRENCE_THRESHOLD must equal 3 (rules.yaml: occurrence_threshold: 3)."""
        assert _OCCURRENCE_THRESHOLD == 3, \
            "similar_defect._OCCURRENCE_THRESHOLD does not match rules.yaml occurrence_threshold: 3"


# ===========================================================================
# Group 3: INVALID cases must NOT count toward escalation
# ===========================================================================

class TestInvalidCaseFiltering:
    def test_invalid_cases_excluded_from_count(self, monkeypatch):
        """
        tools.py sets counts_toward_escalation=False for INVALID cases.
        With 2 valid + 1 invalid past cases, total_occurrences should be 3
        (2 valid past + 1 current), NOT 4.
        """
        cases = [
            _make_case("C-001", status="CLOSED"),        # valid
            _make_case("C-002", status="CLOSED"),        # valid
            _make_case("C-003", status="INVALID"),       # must be excluded
        ]
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            lambda **_: cases)
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        scr = similar_defect_node(_base_state())["similar_cases_result"]
        assert scr["past_case_count"] == 2, "INVALID case was incorrectly counted"
        assert scr["total_occurrences"] == 3
        assert scr["ai_analysis"]["recommendation"] == "flag_for_extra_inspection"

    def test_all_invalid_cases_give_normal_triage(self, monkeypatch):
        cases = [_make_case(f"C-00{i}", status="INVALID") for i in range(5)]
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            lambda **_: cases)
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        scr = similar_defect_node(_base_state())["similar_cases_result"]
        assert scr["past_case_count"] == 0
        assert scr["ai_analysis"]["recommendation"] == "normal_triage"


# ===========================================================================
# Group 4: Tools import — no stub_tools fallback
# ===========================================================================

class TestImports:
    def test_no_stub_tools_import(self):
        """similar_defect.py must import find_similar_cases from tools, not stub_tools."""
        import agents.simephony.similar_defect as m
        import inspect
        source = inspect.getsource(m)
        assert "stub_tools" not in source, \
            "similar_defect.py still references stub_tools — must use backend/tools.py only"

    def test_find_similar_cases_is_real_tool(self):
        """The find_similar_cases symbol in similar_defect must not be the stub version."""
        import agents.simephony.similar_defect as m
        # The stub version takes positional args (unit_id, category); real one takes kwargs only
        import inspect
        sig = inspect.signature(m.find_similar_cases)
        params = list(sig.parameters.keys())
        # Real tool signature: (case_id=None, text=None, filters=None, top_k=5)
        assert "filters" in params, \
            "find_similar_cases doesn't look like the real tool from backend/tools.py"


# ===========================================================================
# Group 5: Resilience
# ===========================================================================

class TestResilience:
    def test_db_failure_falls_back_to_zero(self, monkeypatch):
        """If find_similar_cases raises, node must not crash."""
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases",
                            MagicMock(side_effect=RuntimeError("DB unavailable")))
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        result = similar_defect_node(_base_state())
        assert "similar_cases_result" in result
        assert result["similar_cases_result"]["past_case_count"] == 0

    def test_llm_failure_uses_fallback_reason(self, monkeypatch):
        """If the LLM call raises, cluster_reason must fall back to the static string."""
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("LLM is down")
        monkeypatch.setattr("agents.simephony.similar_defect.client", mock_client)
        scr = similar_defect_node(_base_state())["similar_cases_result"]
        assert "cluster_reason" in scr["ai_analysis"]
        assert scr["ai_analysis"]["cluster_reason"] != ""

    def test_missing_category_in_intake_uses_other(self, monkeypatch):
        """If intake_result has no category, 'other' is used without crashing."""
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        state = _base_state()
        state["intake_result"] = {}  # no category key
        result = similar_defect_node(state)
        assert "similar_cases_result" in result

    def test_missing_unit_id_uses_default(self, monkeypatch):
        """If unit_id is absent from state, a default is used without crashing."""
        monkeypatch.setattr("agents.simephony.similar_defect.find_similar_cases", lambda **_: [])
        monkeypatch.setattr("agents.simephony.similar_defect.client",
                            MagicMock(**{"chat.completions.create.return_value": _llm_response()}))
        state = {"user_description": "Bocor", "intake_result": {"category": "water_leak"}}
        result = similar_defect_node(state)
        assert "similar_cases_result" in result



# ---------------------------------------------------------------------------
# Live-run fix (21 Oct): the new case must not count as one of its own earlier cases
# ---------------------------------------------------------------------------
def test_current_case_is_not_counted_as_an_earlier_case(fake_llm):
    rows = [_make_case("C-0016", status="SUBMITTED"), _make_case("H-0001"), _make_case("H-0002")]
    with patch("agents.simephony.similar_defect.find_similar_cases", return_value=rows) as find:
        out = similar_defect_node(_base_state(case_id="C-0016"))
    r = out["similar_cases_result"]
    assert r["past_case_count"] == 2 and r["total_occurrences"] == 3
    assert find.call_args.kwargs["top_k"] >= 50  # the default top 5 would cap the count


def test_first_report_in_a_clean_unit_has_no_earlier_cases(fake_llm):
    with patch("agents.simephony.similar_defect.find_similar_cases",
               return_value=[_make_case("C-0015", status="SUBMITTED")]):
        out = similar_defect_node(_base_state(case_id="C-0015", unit_id="A-1-01"))
    assert out["similar_cases_result"]["past_case_count"] == 0
    assert out["similar_cases_result"]["ai_analysis"]["is_recurring"] is False


# ---------------------------------------------------------------------------
# Saving the links (tools.save_similar_cases) so the case page shows the related cases
# ---------------------------------------------------------------------------
def test_related_cases_are_saved_with_the_occurrence_count(fake_llm, monkeypatch):
    from agents.simephony import backend_tools
    save = MagicMock(return_value={"ok": True, "linked": 3})
    monkeypatch.setattr(backend_tools, "save_similar_cases", save)
    rows = [{**_make_case("H-0001"), "reason": "same unit", "score": 1.0},
            {**_make_case("H-0002", status="INVALID"), "reason": "same unit", "score": 1.0},
            {**_make_case("C-0014"), "reason": "same unit", "score": 1.0}]
    with patch("agents.simephony.similar_defect.find_similar_cases", return_value=rows):
        out = similar_defect_node(_base_state(case_id="C-0016"))
    case_id, links = save.call_args.args
    assert case_id == "C-0016"
    assert [l["related_case_id"] for l in links] == ["H-0001", "H-0002", "C-0014"]  # INVALID shown, not counted
    assert links[0] == {"related_case_id": "H-0001", "reason": "same unit", "score": 1.0}
    assert save.call_args.kwargs["occurrence_count"] == 3  # 2 counted earlier cases + this one
    assert out["similar_cases_result"]["save_error"] is None


@pytest.mark.parametrize("case_id", [None, "C-NEW"])
def test_nothing_saved_without_a_case_in_the_db(fake_llm, monkeypatch, case_id):
    from agents.simephony import backend_tools
    save = MagicMock()
    monkeypatch.setattr(backend_tools, "save_similar_cases", save)
    with patch("agents.simephony.similar_defect.find_similar_cases", return_value=[]):
        similar_defect_node(_base_state(case_id=case_id))
    save.assert_not_called()


def test_save_failure_is_recorded_not_raised(fake_llm, monkeypatch):
    from agents.simephony import backend_tools
    monkeypatch.setattr(backend_tools, "save_similar_cases", MagicMock(side_effect=RuntimeError("database is locked")))
    with patch("agents.simephony.similar_defect.find_similar_cases", return_value=[_make_case("H-0001")]):
        out = similar_defect_node(_base_state(case_id="C-0016"))
    assert "locked" in out["similar_cases_result"]["save_error"]
