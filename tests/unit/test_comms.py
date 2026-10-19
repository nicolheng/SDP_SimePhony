# tests/unit/test_comms.py
import pytest
from unittest.mock import patch
from agents.simephony.comms import comms_node

def test_dynamic_recipient():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "ASSIGNED",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
    }
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        mock_get_unit.return_value = {"buyer": {"email": "real_resident@example.com"}}
        comms_node(state)
        mock_get_unit.assert_called_once_with("A-12-08")
        _, kwargs = mock_send_email.call_args
        assert kwargs["to"] == "real_resident@example.com"

def test_dynamic_case_id():
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
        _, kwargs = mock_send_email.call_args
        assert kwargs["case_id"] == "C-999"

def test_technical_translation():
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
        assert "15mm copper pipe elbow" not in message.lower()
        assert "pressure tested 5 bar" not in message.lower()
        assert any(word in message.lower() for word in ["fixed", "resolved", "repair"])

def test_guardrail_still_active():
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
        assert "admit" not in message
        assert "poor quality" not in message
        assert "fault" not in message

def test_comms_handles_valid_status():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-1",
        "current_status": "VALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"}
    }
    with patch("agents.simephony.comms.get_unit"), patch("agents.simephony.comms.send_email"):
        result = comms_node(state)
        assert "comms_result" in result
        message = result["comms_result"]["message"].lower()
        assert any(word in message for word in ["booked", "next step", "scheduling", "appointment", "repair"])

def test_comms_handles_invalid_status():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-2",
        "current_status": "INVALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {}
    }
    with patch("agents.simephony.comms.get_unit"), patch("agents.simephony.comms.send_email"):
        result = comms_node(state)
        assert "comms_result" in result
        message = result["comms_result"]["message"].lower()
        print(message)
        assert any(word in message for word in ["rejected", "not a defect", "closed", "unable to confirm"])

