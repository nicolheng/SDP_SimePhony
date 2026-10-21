# test_workflow.py
import base64
import json
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from agents.simephony.workflow import agent_app, route_event

IMAGE = "tests/data/test_cases/images/ceiling-water-leak.jpg"
INTAKE_JSON = json.dumps({"category": "water_leak", "location_in_unit": "bedroom ceiling",
                          "missing_info": [], "urgency": "normal"})
VISION_OK = json.dumps({"assessment": "looks_resolved", "observations": "Ceiling dry.", "matches_location": True})
VISION_UNCLEAR = json.dumps({"assessment": "unclear", "observations": "Blurry.", "matches_location": False})


def _run(state):
    final = None
    for ev in agent_app.stream(state, stream_mode="values"):
        final = ev
    return final


@pytest.fixture
def no_side_effects(escalation_db):
    # escalation goes through fake tools (tests/conftest.py escalation_db); only the email is patched here
    escalation_db.request.return_value = {"ok": True, "approval_id": "AP-1"}
    with patch("agents.simephony.backend_tools.notify_buyer",
               return_value={"ok": True, "message_id": "BM-1", "email_status": "logged, not sent"}) as mail:
        yield mail


def _repair_state(photo):
    return {
        "event": "repair.done", "case_id": "C-1", "unit_id": "A-12-08",
        "user_description": "Ceiling leak", "image_path": IMAGE,
        "intake_result": {"category": "water_leak", "location_in_unit": "bedroom ceiling"},
        "repair_note": "Resealed the joint", "repair_photo_path": photo,
        "current_status": "REPAIRED", "comms_result": {},
    }


def _reopen_state(closed_days_ago):
    return {
        "event": "case.reopened", "case_id": "C-1", "unit_id": "A-12-08",
        "user_description": "Leak is back", "image_path": IMAGE,
        "intake_result": {"category": "water_leak"},
        "current_status": "CLOSED", "reopen_photo_path": IMAGE, "reopen_count": 0,
        "closed_at": (datetime.now(timezone.utc) - timedelta(days=closed_days_ago)).isoformat(),
        "comms_result": {},
    }


def test_route_event_mapping():
    assert route_event({}) == "intake"
    assert route_event({"event": "case.created"}) == "intake"
    assert route_event({"event": "repair.done"}) == "verification"
    assert route_event({"event": "verification.submitted"}) == "verification_result"
    assert route_event({"event": "case.reopened"}) == "recurrence"


@pytest.mark.parametrize("event", ["signoff.completed", "inspection.approved", "typo.event"])
def test_unknown_event_ends_without_running_agents(fake_llm, no_side_effects, event):
    assert route_event({"event": event}) == "unhandled_event"
    final = _run({**_reopen_state(5), "event": event, "current_status": "VALID"})
    assert final["current_status"] == "VALID"  # nothing re-ran intake/triage/booking
    assert final.get("intake_result") == {"category": "water_leak"}
    assert fake_llm.calls == []
    no_side_effects.assert_not_called()


def test_repair_done_resolved_reaches_comms(fake_llm, tmp_path, no_side_effects):
    photo = tmp_path / "repair.jpg"
    photo.write_bytes(b"fakejpg")
    fake_llm.responses = [VISION_OK, "Look at the ceiling for stains.", "Your repair is done."]
    final = _run(_repair_state(str(photo)))
    assert final["verification_result"]["needs_technician_input"] is False
    assert final["current_status"] == "PENDING_SIGNOFF"
    assert final["comms_result"]["message"]
    no_side_effects.assert_called_once()


def test_repair_done_unclear_skips_comms(fake_llm, tmp_path, no_side_effects):
    photo = tmp_path / "repair.jpg"
    photo.write_bytes(b"fakejpg")
    fake_llm.responses = [VISION_UNCLEAR]
    final = _run(_repair_state(str(photo)))
    assert final["verification_result"]["needs_technician_input"] is True
    assert final["verification_result"]["technician_message"]
    assert not final["comms_result"]
    no_side_effects.assert_not_called()


def test_case_reopened_routes_to_recurrence(fake_llm, no_side_effects):
    final = _run(_reopen_state(10))
    assert final["recurrence_result"]["action"] == "REOPENED"
    assert final["reopen_count"] == 1
    assert final["current_status"] == "REOPENED"
    assert final["comms_result"]["message"]


def test_past_grace_reopen_runs_new_case_chain(fake_llm, no_side_effects, tmp_path):
    original = tmp_path / "original.jpg"
    original.write_bytes(b"ORIGINAL-PHOTO-BYTES")
    reopen = tmp_path / "reopen.jpg"
    reopen.write_bytes(b"REOPEN-PHOTO-BYTES")
    state = _reopen_state(60)
    state.update({
        "image_path": str(original), "reopen_photo_path": str(reopen),
        "reopen_count": 1,
        # stale booking from the old case: must not exclude T-PLUMB-3 on the new case
        "booking_result": {"assigned_technician": "T-PLUMB-3", "assignment_ok": False},
        "tried_technicians": [], "reassignment_count": 0,
        "verification_result": {"protocol": "old guide"}, "verification_status": "verified",
        "triage_result": {"urgency": "HIGH"},
    })
    # intake, similar_defect, triage: triage is scripted so the shared fake LLM's keyword fallback
    # ("water leak" -> "high urgency") doesn't decide the urgency for this test
    fake_llm.responses = [INTAKE_JSON, '{"cluster_reason": "No earlier cases."}', "normal"]
    final = _run(state)
    assert final["recurrence_result"]["action"] == "NEW_CASE"
    # intake's vision call got the reopen photo, not the old case photo
    intake_images = [p["image_url"]["url"] for p in fake_llm.calls[0][-1]["content"] if p["type"] == "image_url"]
    assert intake_images == ["data:image/jpeg;base64," + base64.b64encode(b"REOPEN-PHOTO-BYTES").decode()]
    assert final["image_path"] == str(reopen)
    assert final["case_id"] == "C-NEW"
    assert final["reopen_count"] == 0
    assert final["intake_result"]["category"] == "water_leak"
    assert final["triage_result"]["urgency"] != "HIGH"
    # stale booking state from the old case is cleared; "C-NEW" isn't in the DB yet (the web app's
    # create_case issues the real id), so nothing is booked or sent for it
    assert final["tried_technicians"] == []
    assert "not in the DB" in final["booking_result"]["error"]
    assert final["verification_result"] == {}
    assert final["current_status"] == "SUBMITTED"
    assert final["comms_result"]["delivery"] == "no_case"
    no_side_effects.assert_not_called()


def test_past_grace_new_case_uses_buyers_reopen_description(fake_llm, no_side_effects):
    state = {**_reopen_state(60), "user_description": "Old: ceiling leak in bedroom",
             "reopen_description": "Water dripping again near the window"}
    fake_llm.responses = [INTAKE_JSON]
    final = _run(state)
    assert final["user_description"] == "Water dripping again near the window"
    intake_text = [p["text"] for p in fake_llm.calls[0][-1]["content"] if p["type"] == "text"][0]
    assert "Water dripping again near the window" in intake_text
    assert "Old: ceiling leak" not in intake_text


def test_past_grace_new_case_keeps_old_description_when_buyer_gave_none(fake_llm, no_side_effects):
    state = {**_reopen_state(60), "user_description": "Ceiling leak in bedroom"}
    fake_llm.responses = [INTAKE_JSON]
    assert _run(state)["user_description"] == "Ceiling leak in bedroom"


def _signoff_state(outcome, status="PENDING_SIGNOFF"):
    return {
        "event": "verification.submitted", "case_id": "C-1", "unit_id": "A-12-08",
        "intake_result": {"category": "water_leak"}, "current_status": status,
        "verification_outcome": outcome, "verification_result": {"protocol": "guide"},
        "comms_result": {},
    }


def test_verification_submitted_fixed_reaches_comms(fake_llm, no_side_effects):
    fake_llm.responses = ["Thank you for confirming the repair."]
    final = _run(_signoff_state("FIXED"))
    assert final["current_status"] == "CLOSED"
    assert final["verification_status"] == "verified"
    assert final["comms_result"]["message"]
    no_side_effects.assert_called_once()


def test_verification_submitted_on_closed_case_ends_without_email(fake_llm, no_side_effects):
    final = _run(_signoff_state("NOT_FIXED", status="CLOSED"))
    assert final["current_status"] == "CLOSED"
    assert final["verification_result"]["rejected_reason"]
    assert not final["comms_result"]
    no_side_effects.assert_not_called()


@pytest.mark.parametrize("outcome", [None, "MAYBE"])
def test_verification_submitted_unknown_outcome_ends_without_email(fake_llm, no_side_effects, outcome):
    final = _run(_signoff_state(outcome))
    assert final["current_status"] == "PENDING_SIGNOFF"
    assert final["verification_result"]["rejected_reason"]
    assert not final["comms_result"]
    no_side_effects.assert_not_called()


def test_repair_done_on_invalid_case_ends_without_email(fake_llm, tmp_path, no_side_effects):
    photo = tmp_path / "repair.jpg"
    photo.write_bytes(b"fakejpg")
    state = _repair_state(str(photo))
    state["current_status"] = "INVALID"
    final = _run(state)
    assert final["current_status"] == "INVALID"
    assert final["verification_result"]["rejected_reason"]
    assert not final["comms_result"]
    assert fake_llm.calls == []
    no_side_effects.assert_not_called()


def test_repair_done_resolved_email_contains_guide(fake_llm, tmp_path, no_side_effects):
    photo = tmp_path / "repair.jpg"
    photo.write_bytes(b"fakejpg")
    fake_llm.responses = [VISION_OK, "Look at the ceiling for stains.", "Please check your repair below."]
    final = _run(_repair_state(str(photo)))
    body = no_side_effects.call_args.kwargs["body"]
    assert final["verification_result"]["protocol"] in body


def test_default_event_runs_new_case_chain(fake_llm, no_side_effects):
    fake_llm.responses = [INTAKE_JSON]
    final = _run({"user_description": "Ceiling leaks", "unit_id": "A-12-08",
                  "current_status": "SUBMITTED", "comms_result": {}})
    assert final["intake_result"]["category"] == "water_leak"
    assert final["triage_result"]
    assert final["comms_result"]["message"]


# --- Original manual demo script (needs the real Ollama model); no longer runs on import ---
def run_live_demo():
    image_path = "tests/data/test_cases/images/test_wall_break.jpeg"

    if not os.path.exists(image_path):
        print(f" Error: Please check if '{image_path}' exists!")
        exit()

    initial_state = {
        "user_description": "Dinding bocor in master bedroom, dah pernah kena last month.",
        "image_path": image_path, # Use the variable here
        "unit_id": "A-12-08",
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED"
    }

    print("🚀 Starting LangGraph Workflow Test...\n")

    # CHANGE THIS LINE: Use "updates" instead of "values"
    for event in agent_app.stream(initial_state, stream_mode="updates"):
    
        # In "updates" mode, the key of the dictionary is the NODE NAME
        node_name = list(event.keys())[0] 
        node_output = event[node_name]

        print(f"✅ Node completed: {node_name.upper()}")
    
        if node_name == "intake":
            # Look inside the intake_result for the category
            print("   -> Intake Category:", node_output.get("intake_result", {}).get("category", "Unknown"))
            print("   -> Missing Info:", node_output.get("missing_info", []))
        
        elif node_name == "similar_defect":
            # Look inside the ai_analysis for recurrence
            analysis = node_output.get("similar_cases_result", {}).get("ai_analysis", {})
            print("   -> Is Recurring?", analysis.get("is_recurring"))
            print("   -> Reason:", analysis.get("cluster_reason"))
        
        elif node_name == "triage":
            # Look inside triage_result for the technician
            print("   -> Assigned Tech:", node_output.get("triage_result", {}).get("assigned_technician"))
            print("   -> Urgency:", node_output.get("triage_result", {}).get("urgency"))
        
        print("-" * 40)

    print(" Workflow finished successfully!")


if __name__ == "__main__":
    run_live_demo()


# --- PR C: NOT_FIXED reopens the case and runs the escalation check ---
def _not_fixed_state(reopen_count):
    return {**_signoff_state("NOT_FIXED"), "reopen_photo_path": IMAGE, "reopen_count": reopen_count}


def test_not_fixed_reopens_and_emails_buyer(fake_llm, no_side_effects):
    fake_llm.responses = ["Your case has been reopened."]
    final = _run(_not_fixed_state(0))
    assert final["current_status"] == "REOPENED"
    assert final["reopen_count"] == 1
    assert final["recurrence_result"]["action"] == "REOPENED"
    no_side_effects.assert_called_once()


def test_not_fixed_on_third_occurrence_escalates(fake_llm, no_side_effects):
    fake_llm.responses = ["We are arranging a more detailed inspection."]
    with patch("agents.simephony.recurrence.request_extra_inspection", return_value={"approval_id": "AP-9"}) as ri:
        final = _run(_not_fixed_state(1))
    assert final["current_status"] == "ESCALATION_PENDING"
    assert final["recurrence_result"]["approval_id"] == "AP-9"
    ri.assert_called_once()


def test_not_fixed_without_photo_ends_without_email(fake_llm, no_side_effects):
    final = _run(_signoff_state("NOT_FIXED"))
    assert final["current_status"] == "PENDING_SIGNOFF"
    assert "photo" in final["verification_result"]["rejected_reason"]
    no_side_effects.assert_not_called()


# --- booking.rejected: a technician turned the visit down in the app; book someone else ---
def test_booking_rejected_event_rebooks_and_tells_buyer(fake_llm, no_side_effects, booking_db):
    fake_llm.responses = ["A technician has been assigned to your case."]
    state = {"event": "booking.rejected", "case_id": "C-1", "unit_id": "A-12-08", "current_status": "SUBMITTED",
             "intake_result": {"category": "water_leak"}, "user_description": "Ceiling leak",
             "triage_result": {"assigned_skill": "plumbing", "urgency": "normal"}, "comms_result": {}}
    assert route_event(state) == "booking"
    final = _run(state)
    assert final["current_status"] == "ASSIGNED"
    assert booking_db.assigned[-1]["case_id"] == "C-1"
    assert fake_llm.calls and "intake" not in str(fake_llm.calls[0])  # no intake/triage re-run
    no_side_effects.assert_called_once()


# --- verdict.recorded: technician's verdict -> repair time estimate (VALID) -> buyer update ---
def test_valid_verdict_estimates_repair_time_then_tells_buyer(fake_llm, no_side_effects):
    import json as _json
    fake_llm.responses = [_json.dumps({"area": "medium", "parts_to_replace": True, "multiple_spots": False,
                                       "needs_drying_or_curing": False}),
                          "Our technician confirmed the defect. Please book a repair."]
    state = {"event": "verdict.recorded", "case_id": "C-1", "unit_id": "A-12-08", "current_status": "VALID",
             "intake_result": {"category": "water_leak"}, "verdict_note": "Joint leaking; replace the elbow.",
             "comms_result": {}}
    assert route_event(state) == "repair_estimate"
    final = _run(state)
    assert final["repair_estimate"]["hours"] == 8  # water leak 4 h + parts to replace -> 3 blocks -> a day
    # the estimate reaches the buyer as fixed text, with the booking step
    assert final["comms_result"]["message"].endswith(
        "The repair will take about 8 hours. Please choose a repair time in the app.")
    no_side_effects.assert_called_once()


def test_invalid_verdict_skips_estimate_and_tells_buyer(fake_llm, no_side_effects):
    fake_llm.responses = ["Our technician found this is not a developer defect."]
    final = _run({"event": "verdict.recorded", "case_id": "C-1", "current_status": "INVALID",
                  "intake_result": {"category": "water_leak"}, "verdict_note": "Condensation.", "comms_result": {}})
    assert final["repair_estimate"]["skipped"]
    assert len(fake_llm.calls) == 1
    no_side_effects.assert_called_once()
