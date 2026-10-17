# tests/test_recurrence.py
from agents.simephony.recurrence import recurrence_node

def test_recurrence_increments_count():
    state = {
        "reopen_count": 1,
        "current_status": "CLOSED"
    }
    result = recurrence_node(state)
    assert result["reopen_count"] == 2

def test_recurrence_triggers_escalation():
    # Threshold is 3
    state = {
        "reopen_count": 2,
        "current_status": "CLOSED"
    }
    result = recurrence_node(state)
    assert result["reopen_count"] == 3
    assert result["current_status"] == "ESCALATION_PENDING"

if __name__ == "__main__":
    test_recurrence_increments_count()
    print("✅ test_recurrence_increments_count passed!")
    test_recurrence_triggers_escalation()
    print("✅ test_recurrence_triggers_escalation passed!")
