import pytest
from unittest.mock import patch, MagicMock

# --- Merged from tests/unit/test_booking_loop.py ---
# tests/test_booking_loop.py
import pytest
from agents.simephony.workflow import agent_app

def test_booking_reassignment_loop():
    # To test the loop, we need to make sure the first technician picked is T-PLUMB-2
    # In our stub_tools, T-PLUMB-2 is the one who rejects.
    # We can force this by mocking get_available_slots to return T-PLUMB-2 first.
    
    from unittest.mock import patch
    
    mock_slots = {
        "slots": [
            {"slot_id": "S-REJECT", "technician_id": "T-PLUMB-2", "start": "2026-10-22T10:00:00+08:00", "block": "A"},
            {"slot_id": "S-ACCEPT", "technician_id": "T-PLUMB-1", "start": "2026-10-22T11:00:00+08:00", "block": "A"},
        ]
    }
    
    with patch("agents.simephony.booking.get_available_slots", return_value=mock_slots):
        state = {
            "unit_id": "A-12-08",
            "user_description": "Water is leaking into the electrical sockets",
            "intake_result": {"category": "plumbing", "severity_hint": "HIGH"},
            "similar_cases_result": {}, 
            "triage_result": {"assigned_skill": "plumbing", "urgency": "HIGH"}, 
            "booking_result": {}, 
            "comms_result": {}, 
            "initial_inspection_result": {}, 
            "missing_info": [], 
            "current_status": "SUBMITTED",
            "reassignment_count": 0,
            "tried_technicians": []
        }
        
        final_state = None
        for event in agent_app.stream(state, stream_mode="values"):
            final_state = event
            
        # Assertions:
        # 1. Reassignment count should be 1
        assert final_state["reassignment_count"] == 1
        # 2. Tried technicians should include T-PLUMB-2
        assert "T-PLUMB-2" in final_state["tried_technicians"]
        # 3. Final assigned technician should be T-PLUMB-1
        assert final_state["booking_result"]["assigned_technician"] == "T-PLUMB-1"
        # 4. Final status should be ASSIGNED
        assert final_state["current_status"] == "ASSIGNED"


# --- Merged from tests/unit/test_booking_smart.py ---
# tests/test_booking_smart.py
import pytest
from agents.simephony.booking import booking_node

def test_booking_high_urgency_picks_earliest():
    # High urgency: Should pick S-1 (22nd) even if it's in Block B (User is Block A)
    state = {
        "unit_id": "A-12-08",
        "triage_result": {"assigned_skill": "plumbing", "urgency": "HIGH"},
        "current_status": "SUBMITTED"
    }
    result = booking_node(state)
    assert result["booking_result"]["slot_id"] == "S-1"

def test_booking_normal_urgency_picks_efficient_block():
    # Normal urgency: Should pick S-2 (23rd) because it's in Block A, 
    # even though S-1 (22nd) is earlier but in Block B.
    state = {
        "unit_id": "A-12-08",
        "triage_result": {"assigned_skill": "plumbing", "urgency": "NORMAL"},
        "current_status": "SUBMITTED"
    }
    result = booking_node(state)
    assert result["booking_result"]["slot_id"] == "S-2"



def test_booking_no_slots_escalates():
    from unittest.mock import patch
    state = {
        "unit_id": "A-12-08",
        "triage_result": {"assigned_skill": "plumbing", "urgency": "NORMAL"},
        "current_status": "SUBMITTED"
    }
    with patch("agents.simephony.booking.get_available_slots", return_value={"slots": []}):
        result = booking_node(state)
    assert result["current_status"] == "ESCALATION_PENDING"


# --- Audit additions ---
from unittest.mock import patch

SLOTS = {"slots": [
    {"slot_id": "S-LATE", "technician_id": "T-PLUMB-1", "start": "2026-10-25T09:00:00+08:00", "block": "A"},
    {"slot_id": "S-EARLY", "technician_id": "T-PLUMB-3", "start": "2026-10-21T09:00:00+08:00", "block": "B"},
    {"slot_id": "S-MID", "technician_id": "T-PLUMB-4", "start": "2026-10-23T09:00:00+08:00", "block": "A"},
]}


def _state(**kw):
    s = {"unit_id": "A-12-08", "case_id": "C-7", "current_status": "SUBMITTED",
         "triage_result": {"assigned_skill": "plumbing", "urgency": "normal"}}
    s.update(kw)
    return s


def test_booking_passes_real_case_id():
    with patch("agents.simephony.booking.assign_technician", return_value={"ok": True}) as assign:
        booking_node(_state())
    assert assign.call_args.kwargs["case_id"] == "C-7"


def test_booking_high_picks_earliest_when_slots_unsorted():
    with patch("agents.simephony.booking.get_available_slots", return_value=SLOTS):
        out = booking_node(_state(triage_result={"assigned_skill": "plumbing", "urgency": "high"}))
    assert out["booking_result"]["slot_id"] == "S-EARLY"


def test_booking_urgency_case_insensitive():
    with patch("agents.simephony.booking.get_available_slots", return_value=SLOTS):
        out = booking_node(_state(triage_result={"assigned_skill": "plumbing", "urgency": "HIGH"}))
    assert out["booking_result"]["slot_id"] == "S-EARLY"


def test_booking_normal_prefers_same_block_earliest():
    with patch("agents.simephony.booking.get_available_slots", return_value=SLOTS):
        out = booking_node(_state())
    assert out["booking_result"]["slot_id"] == "S-MID"      # block A, earlier than S-LATE


def test_booking_no_same_block_falls_back_to_first_slot():
    with patch("agents.simephony.booking.get_available_slots", return_value=SLOTS):
        out = booking_node(_state(unit_id="Z-1-1"))
    assert out["booking_result"]["slot_id"] == "S-EARLY"


def test_booking_malformed_unit_id_does_not_raise():
    out = booking_node(_state(unit_id="1201"))
    assert out["current_status"] == "ASSIGNED"


def test_booking_alternatives_max_three_excluding_chosen():
    many = {"slots": [{"slot_id": f"S-{i}", "technician_id": f"T-PLUMB-{i}",
                       "start": f"2026-10-2{i}T09:00:00+08:00", "block": "A"} for i in range(1, 7)]}
    with patch("agents.simephony.booking.get_available_slots", return_value=many):
        res = booking_node(_state())["booking_result"]
    assert len(res["alternatives"]) == 3
    assert res["slot_id"] not in [a["slot_id"] for a in res["alternatives"]]


def test_booking_result_shape():
    res = booking_node(_state(triage_result={"assigned_skill": "plumbing", "urgency": "high"}))["booking_result"]
    assert res["booking_status"] == "PENDING_TECH_CONFIRM"
    assert res["assignment_ok"] is True
    assert res["assigned_technician"]


def test_booking_missing_triage_defaults_to_general():
    with patch("agents.simephony.booking.get_available_slots", return_value={"slots": []}) as slots:
        booking_node({"unit_id": "A-12-08"})
    assert slots.call_args.kwargs["skill"] == "general"


def test_booking_slot_lookup_failure_escalates():
    with patch("agents.simephony.booking.get_available_slots", side_effect=RuntimeError("db down")):
        out = booking_node(_state())
    assert out["current_status"] == "ESCALATION_PENDING"


def test_booking_no_slots_keeps_error_and_counts():
    with patch("agents.simephony.booking.get_available_slots", return_value={"slots": []}):
        out = booking_node(_state(booking_result={"assignment_ok": False, "assigned_technician": "T-PLUMB-2"}))
    assert "Escalating" in out["booking_result"]["error"]
    assert out["tried_technicians"] == ["T-PLUMB-2"]
    assert out["reassignment_count"] == 1


def test_all_technicians_reject_ends_in_escalation_and_comms():
    from agents.simephony.workflow import agent_app
    slots = {"slots": [{"slot_id": "S-1", "technician_id": "T-PLUMB-2", "start": "2026-10-22T10:00:00+08:00", "block": "A"},
                       {"slot_id": "S-2", "technician_id": "T-PLUMB-5", "start": "2026-10-23T10:00:00+08:00", "block": "A"}]}
    state = {"unit_id": "A-12-08", "case_id": "C-9", "current_status": "SUBMITTED", "event": "case.created",
             "triage_result": {}, "booking_result": {}, "comms_result": {}, "tried_technicians": [], "reassignment_count": 0,
             "intake_result": {"category": "water_leak", "urgency": "normal"}, "user_description": "leak"}
    with patch("agents.simephony.booking.get_available_slots", return_value=slots), \
         patch("agents.simephony.booking.assign_technician", return_value={"ok": False}), \
         patch("agents.simephony.intake.intake_node", side_effect=lambda s: s), \
         patch("agents.simephony.comms.send_email") as mail:
        final = None
        for ev in agent_app.stream(state, stream_mode="values", config={"recursion_limit": 40}):
            final = ev
    assert final["current_status"] == "ESCALATION_PENDING"
    assert sorted(final["tried_technicians"]) == ["T-PLUMB-2", "T-PLUMB-5"]
    mail.assert_called_once()
