# test_workflow.py
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
def no_side_effects():
    with patch("agents.simephony.comms.send_email") as mail,          patch("agents.simephony.escalation.get_stack_cases", return_value=[]),          patch("agents.simephony.recurrence.request_extra_inspection",
               return_value={"approval_id": "AP-1"}):
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


def test_past_grace_reopen_runs_new_case_chain(fake_llm, no_side_effects):
    fake_llm.responses = [INTAKE_JSON]
    final = _run(_reopen_state(60))
    assert final["recurrence_result"]["action"] == "NEW_CASE"
    assert final["intake_result"]["category"] == "water_leak"
    assert final["triage_result"]
    assert final["comms_result"]["message"]


def test_default_event_runs_new_case_chain(fake_llm, no_side_effects):
    fake_llm.responses = [INTAKE_JSON]
    final = _run({"user_description": "Ceiling leaks", "unit_id": "A-12-08",
                  "current_status": "SUBMITTED", "comms_result": {}})
    assert final["intake_result"]["category"] == "water_leak"
    assert final["triage_result"]
    assert final["comms_result"]["message"]


# --- Original manual demo script (needs the real Ollama model); no longer runs on import ---
def run_live_demo():
    image_path = "tests/test_cases/images/test_wall_break.jpeg"

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
