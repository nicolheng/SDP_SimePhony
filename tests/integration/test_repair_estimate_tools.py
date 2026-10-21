# Case-specific repair time: tools.set_repair_estimate + the repair slots / booking that read it (temp seed.db).
import json

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
CASE = "C-0003"  # A-4-01 door/window, VALID in seed.db; category plan = 2 hours


def _tools():
    import tools
    return tools


def test_estimate_changes_repair_slots_case_page_and_booking():
    tools = _tools()
    before = tools.get_booking_options(CASE, "repair")
    assert before["plan"]["hours"] == 2 and len(before["options"][0]["slots"]) == 1

    saved = tools.set_repair_estimate(CASE, 4, "Rehang the door and replace the hinges.")
    assert saved == {"ok": True, "repair_hours": 4}

    after = tools.get_booking_options(CASE, "repair")
    assert after["plan"]["hours"] == 4
    assert after["plan"]["estimate_reason"] == "Rehang the door and replace the hinges."
    assert len(after["options"][0]["slots"]) == 2  # two 2-hour blocks
    assert tools.get_case(CASE)["repair_plan"]["hours"] == 4
    booked = tools.book_repair(CASE, after["options"][0]["start"])
    assert booked["ok"] is True and booked["repair_hours"] == 4


@pytest.mark.parametrize("hours", [1, 3, 6, 12])
def test_only_whole_blocks_up_to_a_day(hours):
    r = _tools().set_repair_estimate(CASE, hours, "x")
    assert r["ok"] is False and "2, 4 or 8" in r["error"]


def test_only_while_the_case_is_valid():
    r = _tools().set_repair_estimate("C-0009", 4, "x")  # SUBMITTED
    assert r["ok"] is False and "VALID" in r["error"]


def test_estimator_agent_saves_its_estimate(fake_llm):
    from agents.simephony.repair_estimate import repair_estimate_node
    fake_llm.responses = [json.dumps({"area": "medium", "parts_to_replace": True, "multiple_spots": False,
                                      "needs_drying_or_curing": False})]
    out = repair_estimate_node({"case_id": CASE, "current_status": "VALID", "intake_result": {"category": "door_window"},
                                "verdict_note": "Hinges bent, door scrapes the frame; replace both hinges."})
    assert out["repair_estimate"]["hours"] == 4
    plan = _tools().get_case(CASE)["repair_plan"]
    assert plan["hours"] == 4 and "replace" in plan["estimate_reason"].lower()
