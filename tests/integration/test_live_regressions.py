# Real-model checks for what the 21 Oct live demo run caught (qwen2.5:7b + llava-llama3 via Ollama).
# Run: pytest -m live_llm tests/integration/test_live_regressions.py   (slow: the vision model loads per call)
import os

import pytest

pytestmark = pytest.mark.live_llm

IMAGES = os.path.join(os.path.dirname(__file__), "..", "data", "test_cases", "images")
SLIPS = ("t-0", "t-plumb", "hafiz", "dear ", "hello", "subject:", "final sign-off")
VALID_SLIPS = SLIPS + ("schedul", "shortly", "soon", "begin")  # the repair isn't booked yet at VALID


def _body_ok(body: str, slips=SLIPS):
    low = body.lower()
    assert not [w for w in slips if w in low], body


def test_intake_reads_manglish_leak():
    from agents.simephony.intake import intake_node
    out = intake_node({"user_description": "Ceiling bocor lagi in the bedroom, this is the third time!",
                       "image_path": os.path.join(IMAGES, "water_leak_again.jpg")})["intake_result"]
    assert out["category"] == "water_leak"
    assert "bedroom" in (out["location_in_unit"] or "").lower()
    assert out["mentions_previous_issue"] is True


@pytest.mark.parametrize("desc, category, expected", [
    ("Water is dripping from the master bedroom ceiling above the wardrobe.", "water_leak", "normal"),
    ("Water pools around the floor trap in the common bathroom and doesn't drain.", "drainage", "normal"),
    ("Water leaking from the ceiling right onto the light fitting, it sparked once.", "water_leak", "high"),
])
def test_triage_only_raises_urgency_for_a_real_rule(desc, category, expected):
    from agents.simephony.triage import triage_node
    out = triage_node({"user_description": desc, "intake_result": {"category": category, "urgency": "normal"}})
    assert out["triage_result"]["urgency"] == expected, out["triage_result"]["justification"]


def _send(**state):
    from agents.simephony.comms import comms_node
    return comms_node({"case_id": "C-X", "intake_result": {"category": "water_leak"}, **state})["comms_result"]["message"]


def test_comms_valid_asks_buyer_to_book_with_fixed_step():
    body = _send(current_status="VALID", repair_estimate={"hours": 8},
                 verdict_note="Leaking pipe joint above the wardrobe; about 1 m2 of ceiling board soaked.")
    model_part, step = body.rsplit("\n\n", 1)
    assert step == "The repair will take about 8 hours. Please choose a repair time in the app."
    _body_ok(model_part, VALID_SLIPS)
    assert "1 m2" not in body and "square" not in body.lower()


@pytest.mark.parametrize("state", [
    {"current_status": "ASSIGNED", "booking_result": {"assigned_technician": "T-01", "technician_name": "Hafiz Osman"}},
    {"current_status": "REOPENED", "event": "case.reopened", "recurrence_result": {"action": "REOPENED"}},
    {"current_status": "CLOSED", "verification_status": "verified"},
])
def test_comms_messages_have_no_ids_greetings_or_subject_lines(state):
    body = _send(**state)
    _body_ok(body)
    assert not body.lower().startswith(("hi ", "hey "))
    if state["current_status"] == "CLOSED":
        assert "closed" in body.lower()


def test_similar_defect_counts_only_earlier_cases(seed_db):
    import tools
    from agents.simephony.similar_defect import similar_defect_node
    case = tools.create_case("A-12-08", "B-0118", "Ceiling bocor lagi in the bedroom")["case_id"]
    out = similar_defect_node({"case_id": case, "unit_id": "A-12-08", "user_description": "Ceiling bocor lagi",
                               "intake_result": {"category": "water_leak"}})["similar_cases_result"]
    assert out["past_case_count"] == 3  # H-0001, H-0002, C-0014; not the new case itself


def test_repair_estimate_first_case_is_not_called_recurring(seed_db):
    from agents.simephony.repair_estimate import repair_estimate_node
    out = repair_estimate_node({"case_id": "C-0003", "current_status": "VALID", "intake_result": {"category": "door_window"},
                                "verdict_note": "Door hinge loose, needs a new hinge fitted."})["repair_estimate"]
    assert out["hours"] in (2, 4, 8) and out["error"] is None
    assert "come back" not in out["reason"]
