# comms.message_for_kind: the web app asks for a buyer message by kind (backend/demo_api/workflow.notify_buyer);
# CommsAgent drafts it (LLM + guardrails + fixed text) and returns (title, body) without sending it.
import pytest

from agents.simephony.comms import message_for_kind

CASE = {"case_id": "C-1", "status": "VISIT_SCHEDULED", "category": "water_leak", "sub_category": "Ceiling leak",
        "location_in_unit": "Master bedroom", "summary": "Ceiling leak in master bedroom", "verdict_note": None,
        "repair_hours": None, "follow_up_question": None}
SLOT = "Thu, 22 Oct, 9:00 am"


def _msg(fake_llm, kind, reply="Thank you.", case=None, **extra):
    fake_llm.responses = [reply]
    return message_for_kind(kind, {**CASE, **(case or {})}, extra)


@pytest.mark.parametrize("kind, case, extra, title, tail", [
    ("received", {}, {"slot": SLOT}, "We've received your report", f"Requested visit time: {SLOT}."),
    ("info_needed", {"status": "INFO_NEEDED", "follow_up_question": "Which room is this in?"}, {},
     "We need a little more information", "Which room is this in?"),
    ("valid", {"status": "VALID", "repair_hours": 4}, {"note": "Joint leaking."}, "Defect confirmed: please book a repair",
     "The repair will take about 4 hours. Please choose a repair time in the app."),
    ("repair_booked", {"status": "REPAIR_BOOKED"}, {"slot": SLOT, "duration": "4 hours"}, "Repair booked",
     f"Repair time: {SLOT} (about 4 hours)."),
    ("confirmed", {}, {"job": "inspection visit", "slot": SLOT}, "Technician confirmed",
     f"Your inspection visit is confirmed for {SLOT}."),
    ("verify", {"status": "PENDING_SIGNOFF"}, {}, "Repair done",
     "The developer reviews the repair first. We will let you know when you can check it and sign off."),
    ("ready_signoff", {"status": "PENDING_SIGNOFF"}, {"deadline": "Sat, 31 Oct, 5:00 pm", "guide": "Look.\nTouch."},
     "Please check the repair and sign off", "Look.\nTouch."),
    ("closed", {"status": "CLOSED"}, {}, "Your case is closed", "Your case is now closed."),
    ("reopened", {"status": "REOPENED"}, {}, "Case reopened", "We will update you on the next step shortly."),
    ("revisit", {}, {"slot": SLOT}, "Technician revisit booked", f"Revisit time: {SLOT}."),
    ("extra_inspection", {"status": "EXTRA_INSPECTION"}, {"slot": SLOT}, "Detailed inspection scheduled",
     f"Inspection time: {SLOT}."),
    ("reassigned", {}, {"job": "repair", "slot": SLOT, "same_time": False}, "Your technician has changed",
     f"Your repair has moved to {SLOT}."),
])
def test_each_kind_has_its_title_and_fixed_text(fake_llm, kind, case, extra, title, tail):
    got_title, body = _msg(fake_llm, kind, case=case, **extra)
    assert got_title == title
    assert body.endswith(tail)


def test_escalated_reopen_uses_the_inspection_message(fake_llm):
    title, body = _msg(fake_llm, "escalated", "Our team is arranging a more detailed inspection.",
                       case={"status": "ESCALATION_PENDING"})
    assert title == "Your case is being reviewed"


def test_new_report_sent_to_sdp_adds_the_review_line(fake_llm):
    _, body = _msg(fake_llm, "received", slot=SLOT, escalated=True)
    assert "our team is also reviewing" in body


def test_invalid_keeps_closing_line(fake_llm):
    _, body = _msg(fake_llm, "invalid", "Not a developer defect.", case={"status": "INVALID"},
                   note="Condensation from the aircond.")
    assert body.endswith("If the problem gets worse or changes, please submit a new report.")


def test_guardrail_still_applies(fake_llm):
    fake_llm.responses = ["We admit fault and will refund you.", "We are sorry for our mistake."]
    title, body = message_for_kind("received", CASE, {"slot": SLOT})
    assert "refund" not in body.lower() and "mistake" not in body.lower()
    assert body.endswith(f"Requested visit time: {SLOT}.")


def test_no_names_or_ids_reach_the_model(fake_llm):
    _msg(fake_llm, "reassigned", case={"technician_id": "T-02"}, job="repair", slot=SLOT, same_time=True,
         previous="Hafiz Osman")
    prompt = fake_llm.calls[0][-1]["content"]
    assert "T-02" not in prompt and "Hafiz" not in prompt


def test_unknown_kind_raises(fake_llm):
    with pytest.raises(KeyError):
        message_for_kind("typo", CASE, {})


def test_hours_from_the_db_read_naturally(fake_llm):
    # the DB stores repair_hours as 2.0; the web app's duration already says "about"
    _, valid = _msg(fake_llm, "valid", case={"status": "VALID", "repair_hours": 2.0})
    assert valid.endswith("The repair will take about 2 hours. Please choose a repair time in the app.")
    _, booked = _msg(fake_llm, "repair_booked", case={"status": "REPAIR_BOOKED"}, slot=SLOT, duration="about 2 hours")
    assert booked.endswith(f"Repair time: {SLOT} (about 2 hours).")


def test_repair_booked_is_fixed_text_only(fake_llm):
    # Live qwen wrote "We'll be in touch with the exact time soon" right above the fixed repair time.
    _, body = _msg(fake_llm, "repair_booked", case={"status": "REPAIR_BOOKED"}, slot=SLOT, duration="2 hours")
    assert body == f"Your repair is booked.\n\nRepair time: {SLOT} (about 2 hours)."
    assert fake_llm.calls == []


def test_detailed_inspection_is_fixed_text_only(fake_llm):
    # Live qwen wrote "Your team has scheduled…" (it is our team).
    _, body = _msg(fake_llm, "extra_inspection", case={"status": "EXTRA_INSPECTION"}, slot=SLOT)
    assert body == f"Our team has arranged a detailed inspection of your case.\n\nInspection time: {SLOT}."
    assert fake_llm.calls == []
