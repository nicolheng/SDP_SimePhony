# tests/test_comms.py
from agents.simephony.comms import comms_node

def test_comms_handles_valid_status():
    state = {
        "current_status": "VALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"}
    }
    result = comms_node(state)
    assert "comms_result" in result
    message = result["comms_result"]["message"].lower()
    # Qwen might use different words, but it should mention the booking or next steps
    assert any(word in message for word in ["booked", "next step", "scheduling", "appointment"])

def test_comms_handles_invalid_status():
    state = {
        "current_status": "INVALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {}
    }
    result = comms_node(state)
    assert "comms_result" in result
    message = result["comms_result"]["message"].lower()
    assert any(word in message for word in ["rejected", "not a defect", "closed", "unable to confirm"])

if __name__ == "__main__":
    test_comms_handles_valid_status()
    print("✅ test_comms_handles_valid_status passed!")
    test_comms_handles_invalid_status()
    print("✅ test_comms_handles_invalid_status passed!")
