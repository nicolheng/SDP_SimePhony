# tests/test_triage.py
from agents.simephony.triage import triage_node

def test_triage_assigns_correct_skill_and_tech():
    # Setup state
    state = {
        "unit_id": "A-12-08",
        "intake_result": {
            "category": "electrical",
            "severity_hint": "HIGH"
        },
        "triage_result": {}
    }
    
    # Execute
    result = triage_node(state)
    
    # Assert
    assert "triage_result" in result
    assert "assigned_technician" in result["triage_result"]
    assert result["triage_result"]["assigned_technician"].startswith("T-ELEC")
    assert result["triage_result"]["assignment_ok"] is True

if __name__ == "__main__":
    test_triage_assigns_correct_skill_and_tech()
    print("✅ Test passed!")
