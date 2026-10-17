# tests/test_triage.py
from agents.simephony.triage import triage_node

def test_triage_assigns_correct_skill_and_tech():
    state = {
        "unit_id": "A-12-08",
        "user_description": "Standard wall crack in bedroom",
        "intake_result": {
            "category": "wall_crack",
            "severity_hint": "LOW"
        },
        "triage_result": {}
    }
    result = triage_node(state)
    assert "triage_result" in result
    assert "assigned_technician" in result["triage_result"]
    assert result["triage_result"]["assignment_ok"] is True

def test_triage_overrides_urgency_for_high_risk():
    state = {
        "unit_id": "A-12-08",
        "user_description": "There is a water leak and it is very close to the electrical socket!",
        "intake_result": {
            "category": "water_leak",
            "severity_hint": "MEDIUM"
        },
        "triage_result": {}
    }
    result = triage_node(state)
    assert result["triage_result"]["urgency"] == "HIGH", f"Expected HIGH urgency due to electrical risk, got {result["triage_result"].get("urgency")}"

def test_triage_provides_justification():
    state = {
        "unit_id": "A-12-08",
        "user_description": "Standard wall crack in bedroom",
        "intake_result": {
            "category": "wall_crack",
            "severity_hint": "LOW"
        },
        "triage_result": {}
    }
    result = triage_node(state)
    assert "justification" in result["triage_result"]
    assert len(result["triage_result"]["justification"]) > 10

def test_triage_provides_alternatives_when_preferred_unavailable():
    state = {
        "unit_id": "A-12-08",
        "user_description": "Standard wall crack",
        "intake_result": {
            "category": "wall_crack",
            "severity_hint": "LOW"
        },
        "triage_result": {},
        "preferred_slot_id": "S-NONE"
    }
    result = triage_node(state)
    assert "alternatives" in result["triage_result"]
    assert len(result["triage_result"]["alternatives"]) == 3

if __name__ == "__main__":
    try:
        test_triage_assigns_correct_skill_and_tech()
        print("✅ test_triage_assigns_correct_skill_and_tech passed!")
    except AssertionError as e:
        print(f"❌ test_triage_assigns_correct_skill_and_tech failed: {e}")

    try:
        test_triage_overrides_urgency_for_high_risk()
        print("✅ test_triage_overrides_urgency_for_high_risk passed!")
    except AssertionError as e:
        print(f"❌ test_triage_overrides_urgency_for_high_risk failed: {e}")

    try:
        test_triage_provides_justification()
        print("✅ test_triage_provides_justification passed!")
    except AssertionError as e:
        print(f"❌ test_triage_provides_justification failed: {e}")

    try:
        test_triage_provides_alternatives_when_preferred_unavailable()
        print("✅ test_triage_provides_alternatives_when_preferred_unavailable passed!")
    except AssertionError as e:
        print(f"❌ test_triage_provides_alternatives_when_preferred_unavailable failed: {e}")