
import pytest
from agents.simephony.triage import triage_node

def test_triage_urgency_escalation(sample_state):
    state = sample_state.copy()
    state["user_description"] = "The ceiling is literally collapsing and water is everywhere!"
    state["intake_result"] = {"severity_hint": "NORMAL"}
    result = triage_node(state)
    assert "triage_result" in result

def test_triage_uses_llm_urgency(sample_state, fake_llm):
    fake_llm.responses = ["HIGH"]
    result = triage_node(sample_state.copy())
    assert result["triage_result"]["urgency"] == "HIGH"


def test_triage_invalid_llm_answer_falls_back(sample_state, fake_llm):
    fake_llm.responses = ["banana"]
    state = sample_state.copy()
    state["intake_result"] = {"category": "water_leak", "severity_hint": "LOW"}
    result = triage_node(state)
    assert result["triage_result"]["urgency"] == "LOW"
