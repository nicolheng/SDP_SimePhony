# tests/test_verification.py
from agents.simephony.verification import verification_node

def test_verification_provides_correct_protocol():
    state = {
        "intake_result": {"category": "water_leak"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
        "current_status": "REPAIRED"
    }
    result = verification_node(state)
    assert "verification_result" in result
    protocol = result["verification_result"].get("protocol", "")
    assert "water" in protocol.lower() or "leak" in protocol.lower()

def test_verification_handles_unknown_category():
    state = {
        "intake_result": {"category": "unknown"},
        "current_status": "REPAIRED"
    }
    result = verification_node(state)
    assert "verification_result" in result
    assert len(result["verification_result"].get("protocol", "")) > 10

if __name__ == "__main__":
    test_verification_provides_correct_protocol()
    print("✅ test_verification_provides_correct_protocol passed!")
    test_verification_handles_unknown_category()
    print("✅ test_verification_handles_unknown_category passed!")
