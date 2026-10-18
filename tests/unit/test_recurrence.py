
import pytest
from agents.simephony.recurrence import recurrence_node

def test_recurrence_escalation(sample_state):
    state = sample_state.copy()
    state["reopen_count"] = 2 
    result = recurrence_node(state)
    assert result["reopen_count"] == 3
    assert result["current_status"] == "ESCALATION_PENDING"

def test_recurrence_normal_reopen(sample_state):
    state = sample_state.copy()
    state["reopen_count"] = 0
    result = recurrence_node(state)
    assert result["reopen_count"] == 1
    assert result["current_status"] == "REOPENED"

def test_vertical_stack_logic():
    state = {
        "unit_id": "1201",
        "cluster_detected": True,
        "reopen_count": 1
    }
    result = recurrence_node(state)
    # assert result["current_status"] == "ESCALATION_PENDING" # To be implemented
