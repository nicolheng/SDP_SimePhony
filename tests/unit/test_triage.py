
import pytest
from unittest.mock import patch
from agents.simephony.triage import triage_node

def test_triage_urgency_escalation(sample_state):
    state = sample_state.copy()
    state["user_description"] = "The ceiling is literally collapsing and water is everywhere!"
    state["intake_result"] = {"severity_hint": "NORMAL"}
    result = triage_node(state)
    assert "triage_result" in result

def test_triage_no_slots(sample_state):
    with patch(agents.simephony.triage.get_available_slots, return_value=[]):
        state = sample_state.copy()
        result = triage_node(state)
        assert "triage_result" in result
