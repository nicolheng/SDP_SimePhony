# tests/unit/test_comms_dynamic.py
import pytest
from unittest.mock import patch, MagicMock
from agents.simephony.comms import comms_node

def test_dynamic_recipient():
    """Test that the agent fetches the buyer email from get_unit instead of using a hardcoded one."""
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "ASSIGNED",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
    }
    
    # Mock get_unit to return a specific buyer email
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        
        mock_get_unit.return_value = {"buyer": {"email": "real_resident@example.com"}}
        
        comms_node(state)
        
        # Verify get_unit was called with the correct unit_id
        mock_get_unit.assert_called_once_with("A-12-08")
        
        # Verify send_email was called with the REAL email, not the hardcoded one
        _, kwargs = mock_send_email.call_args
        assert kwargs["to"] == "real_resident@example.com"

def test_dynamic_case_id():
    """Test that the agent uses the case_id from the state."""
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-999",
        "current_status": "ASSIGNED",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
    }
    
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        
        mock_get_unit.return_value = {"buyer": {"email": "test@test.com"}}
        
        comms_node(state)
        
        # Verify send_email was called with the actual case_id from state
        _, kwargs = mock_send_email.call_args
        assert kwargs["case_id"] == "C-999"

def test_technical_translation():
    """Test that technical notes are translated into resident-friendly language."""
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "VALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
        "verdict_note": "Replaced leaking 15mm copper pipe elbow, pressure tested 5 bar, no leaks detected."
    }
    
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        
        mock_get_unit.return_value = {"buyer": {"email": "test@test.com"}}
        
        result = comms_node(state)
        message = result["comms_result"]["message"]
        
        # The message should NOT contain the raw technical jargon
        assert "15mm copper pipe elbow" not in message.lower()
        assert "pressure tested 5 bar" not in message.lower()
        # It SHOULD contain a professional summary
        assert "fixed" in message.lower() or "resolved" in message.lower() or "repair" in message.lower()

def test_guardrail_still_active():
    """Test that translated messages are still filtered for liability."""
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "INVALID",
        "intake_result": {"category": "wall_crack"},
        "triage_result": {"assigned_technician": "T-CIVIL-1"},
        "verdict_note": "We admit the concrete was poor quality, but it is within tolerance."
    }
    
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        
        mock_get_unit.return_value = {"buyer": {"email": "test@test.com"}}
        
        result = comms_node(state)
        message = result["comms_result"]["message"].lower()
        
        # The result should NOT contain liability admissions
        assert "admit" not in message
        assert "poor quality" not in message
        assert "fault" not in message
