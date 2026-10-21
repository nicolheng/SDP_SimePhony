# RepairEstimateAgent: LLM extracts scope facts from the technician's note; fixed rules turn them into hours.
import json

import pytest

from agents.simephony.repair_estimate import hours_for, repair_estimate_node


def _facts(area="medium", parts=False, spots=False, drying=False):
    return {"area": area, "parts_to_replace": parts, "multiple_spots": spots, "needs_drying_or_curing": drying}


@pytest.mark.parametrize("base,facts,recurring,hours", [
    (4, _facts(), False, 4),                                      # water leak, nothing special
    (4, _facts(area="small"), False, 2),                          # small patch
    (4, _facts(area="large", parts=True, drying=True), False, 8), # big job: a full day
    (4, _facts(), True, 8),                                       # recurring: extra time to find the cause
    (2, _facts(parts=True, drying=True), False, 4),               # door: at most double its normal time
    (2, _facts(area="small"), False, 2),                          # never below one 2-hour block
    (1.5, _facts(), False, 2),                                    # electrical: rounded up to a 2-hour block
    (1.5, _facts(parts=True), True, 4),
    (8, _facts(area="small", parts=False), False, 8),             # structural: at least half its time (2 blocks -> 3)
])
def test_hours_rules(base, facts, recurring, hours):
    assert hours_for(base, facts, recurring) == hours


def _state(**extra):
    return {"case_id": "C-1", "current_status": "VALID", "intake_result": {"category": "water_leak"},
            "verdict_note": "Pipe joint above wardrobe leaking; about 1 m2 of ceiling board soaked, needs replacing and repainting.",
            **extra}


def test_node_saves_estimate_with_reason(fake_llm, monkeypatch):
    from unittest.mock import MagicMock
    from agents.simephony import backend_tools
    save = MagicMock(return_value={"ok": True, "repair_hours": 8})
    monkeypatch.setattr(backend_tools, "set_repair_estimate", save)
    fake_llm.responses = [json.dumps(_facts(area="large", parts=True, drying=True))]
    r = repair_estimate_node(_state())["repair_estimate"]
    assert r["hours"] == 8 and r["error"] is None
    assert "replace" in r["reason"].lower() and "drying" in r["reason"].lower()
    save.assert_called_once_with("C-1", 8, r["reason"])
    assert "Pipe joint above wardrobe" in fake_llm.calls[0][-1]["content"]  # facts come from the technician's note


def test_bad_llm_answer_falls_back_to_normal_time(fake_llm):
    fake_llm.responses = ["I think about three hours"]
    r = repair_estimate_node(_state())["repair_estimate"]
    assert r["hours"] == 4  # water_leak normal time
    assert "standard time" in r["reason"].lower()


def test_llm_error_falls_back_to_normal_time(fake_llm):
    fake_llm.client.chat.completions.create.side_effect = RuntimeError("ollama down")
    assert repair_estimate_node(_state())["repair_estimate"]["hours"] == 4


def test_invalid_verdict_is_not_estimated(fake_llm):
    out = repair_estimate_node(_state(current_status="INVALID"))
    assert out["repair_estimate"]["skipped"]
    assert fake_llm.calls == []


def test_tools_refusal_is_recorded(fake_llm, monkeypatch):
    from agents.simephony import backend_tools
    monkeypatch.setattr(backend_tools, "set_repair_estimate", lambda *a: {"ok": False, "error": "Case 'C-1' not found"})
    fake_llm.responses = [json.dumps(_facts())]
    assert "not found" in repair_estimate_node(_state())["repair_estimate"]["error"]


def _hours_with(fake_llm, monkeypatch, **state):
    from agents.simephony import backend_tools
    monkeypatch.setattr(backend_tools, "set_repair_estimate", lambda *a: {"ok": True})
    fake_llm.responses = [json.dumps(_facts())]
    return repair_estimate_node(_state(**state))["repair_estimate"]


def test_first_case_in_unit_is_not_recurring(fake_llm, monkeypatch, escalation_db):
    # SimilarDefect's total_occurrences counts the new case itself (2 for a first report): not trusted here.
    escalation_db.earlier = 0
    r = _hours_with(fake_llm, monkeypatch, similar_cases_result={"total_occurrences": 2})
    assert r["hours"] == 4 and "come back" not in r["reason"]
    assert escalation_db.calls == ["C-1"]


def test_earlier_cases_in_unit_make_it_recurring(fake_llm, monkeypatch, escalation_db):
    escalation_db.earlier = 2
    r = _hours_with(fake_llm, monkeypatch)
    assert r["hours"] == 8 and "come back" in r["reason"]


def test_reopened_case_is_recurring(fake_llm, monkeypatch, escalation_db):
    r = _hours_with(fake_llm, monkeypatch, reopen_count=1)
    assert r["hours"] == 8


def test_history_lookup_error_is_not_recurring(fake_llm, monkeypatch, escalation_db):
    from agents.simephony import backend_tools
    monkeypatch.setattr(backend_tools, "check_escalation", lambda c: {"ok": False, "error": "not found"})
    assert _hours_with(fake_llm, monkeypatch)["hours"] == 4
