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
            "user_description": "Leaking pipe",
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

