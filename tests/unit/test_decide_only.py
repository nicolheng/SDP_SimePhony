# decide_only: the web app (backend/demo_api/workflow.py) does the DB writes itself, so when it calls an agent
# the agent only returns its decision. Every write the agent would make is skipped; the decision is in the state.
import json
from unittest.mock import MagicMock

import pytest

from agents.simephony import backend_tools


@pytest.fixture
def writes(monkeypatch):
    fakes = {name: MagicMock(return_value={"ok": True}) for name in (
        "save_intake_result", "save_similar_cases", "assign_technician", "start_verification",
        "attach_inspection_brief", "send_email", "notify_buyer", "flag_case_for_human_review")}
    for name, fake in fakes.items():
        monkeypatch.setattr(backend_tools, name, fake)
    return fakes


def test_intake_decide_only_does_not_save(fake_llm, writes):
    from agents.simephony.intake import intake_node
    out = intake_node({"case_id": "C-1", "user_description": "Ceiling bocor in the bedroom", "decide_only": True})
    writes["save_intake_result"].assert_not_called()
    assert out["intake_result"]["category"] == "water_leak"


def test_similar_decide_only_returns_links_without_saving(fake_llm, writes, monkeypatch):
    from agents.simephony import similar_defect
    monkeypatch.setattr(similar_defect, "find_similar_cases", lambda **kw: [
        {"case_id": "H-0001", "unit_id": "A-12-08", "reason": "same unit", "score": 1.0, "status": "CLOSED",
         "created_at": "2026-05-01T00:00:00Z", "counts_toward_escalation": True}])
    out = similar_defect.similar_defect_node({"case_id": "C-1", "unit_id": "A-12-08", "user_description": "leak",
                                              "intake_result": {"category": "water_leak"}, "decide_only": True})
    writes["save_similar_cases"].assert_not_called()
    r = out["similar_cases_result"]
    assert r["confidence_score"] == 0.9
    assert r["related"] == [{"case_id": "H-0001", "unit_id": "A-12-08", "reason": "same unit", "score": 1.0,
                             "at": "2026-05-01T00:00:00Z"}]
    assert r["cluster_reason"]


def test_booking_decide_only_proposes_without_booking(booking_db):
    from agents.simephony.booking import booking_node
    out = booking_node({"case_id": "C-1", "current_status": "SUBMITTED", "decide_only": True,
                        "triage_result": {"assigned_skill": "plumbing", "urgency": "normal"}})
    assert booking_db.assigned == []
    r = out["booking_result"]
    assert r["assigned_technician"] == "T-PLUMB-1" and r["start"] == "2026-10-22T01:00:00.000Z"
    assert r["booking_status"] == "PROPOSED" and "Ali Hassan" in r["reason"]
    assert out["current_status"] == "SUBMITTED"


def test_verification_decide_only_returns_guide_without_saving(fake_llm, writes, tmp_path):
    from agents.simephony.verification import verification_node
    photo = tmp_path / "after.jpg"
    photo.write_bytes(b"jpg")
    fake_llm.responses = [json.dumps({
        "assessment": "looks_resolved",
        "observations": "Dry.",
        "matches_location": True,
        "confidence_score": 0.95,
    })]
    out = verification_node({"case_id": "C-1", "current_status": "REPAIRED", "decide_only": True,
                             "intake_result": {"category": "electrical", "location_in_unit": "kitchen"},
                             "repair_note": "Replaced the socket.", "repair_photo_path": str(photo)})
    writes["start_verification"].assert_not_called()
    guide = out["verification_result"]["guide"]
    assert guide["intro"] and guide["steps"] and "Still not fixed" in guide["ifFails"]


def test_inspection_decide_only_returns_brief_without_saving(fake_llm, writes):
    from agents.simephony.initial_inspection import initial_inspection_node
    out = initial_inspection_node({"case_id": "C-1", "unit_id": "A-12-08", "current_status": "ESCALATION_PENDING",
                                   "decide_only": True, "intake_result": {"category": "water_leak"}})
    writes["attach_inspection_brief"].assert_not_called()
    writes["send_email"].assert_not_called()
    assert out["initial_inspection_result"]["checklist"]
    assert out["current_status"] == "ESCALATION_PENDING"
