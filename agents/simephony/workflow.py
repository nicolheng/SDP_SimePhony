import os
import json
import base64
from typing import TypedDict, Optional, Any
from openai import OpenAI
from langgraph.graph import StateGraph, END

from .intake import intake_node
from .similar_defect import similar_defect_node
from .triage import triage_node
from .booking import booking_node
from .comms import comms_node
from .verification import verification_node, verification_result_node
from .recurrence import recurrence_node
from .initial_inspection import initial_inspection_node

# 1. Setup Qwen Client (Points to local Ollama by default)
client = OpenAI(
    base_url=os.getenv("QWEN_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("QWEN_API_KEY", "ollama")
)
MODEL_VL = os.getenv("QWEN_MODEL_VL", "llava-llama3")
MODEL_TEXT = os.getenv("QWEN_MODEL_TEXT", "qwen2.5:7b") 

# 2. Define the State (The "Memory" passed between agents)
class AgentState(TypedDict):
    user_description: str
    image_path: Optional[str]
    unit_id: str
    intake_result: dict
    similar_cases_result: dict
    triage_result: dict
    booking_result: dict
    comms_result: dict
    initial_inspection_result: dict
    missing_info: list[str]
    current_status: str # Case status (e.g., SUBMITTED, ASSIGNED, etc.)
    reassignment_count: int # Number of times a technician rejected the booking
    tried_technicians: list[str] # List of technicians who already rejected the case
    # Event-driven fields
    event: str # case.created | repair.done | verification.submitted | case.reopened
    case_id: str
    verdict_note: str
    repair_note: str
    repair_photo_path: Optional[str]
    closed_at: str # ISO timestamp, timezone-aware
    reopen_photo_path: Optional[str]
    reopen_count: int
    verification_outcome: str # FIXED | NOT_FIXED | CANNOT_VERIFY
    verification_status: str
    verification_result: dict
    recurrence_result: dict

# 3. Build the LangGraph
workflow = StateGraph(AgentState)

# Nodes
workflow.add_node("intake", intake_node)
workflow.add_node("similar_defect", similar_defect_node)
workflow.add_node("triage", triage_node)
workflow.add_node("booking", booking_node)
workflow.add_node("comms", comms_node)
workflow.add_node("verification", verification_node)
workflow.add_node("verification_result", verification_result_node)
workflow.add_node("recurrence", recurrence_node)
workflow.add_node("initial_inspection", initial_inspection_node)

def prepare_new_case(state: dict) -> dict:
    """Past-grace reopen: start a fresh case from the reopen photo, dropping the old case's results."""
    state.update({
        "image_path": state.get("reopen_photo_path"),
        "case_id": "C-NEW",
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "booking_result": {},
        "comms_result": {},
        "initial_inspection_result": {},
        "missing_info": [],
        "verification_result": {},
        "verification_outcome": "",
        "verification_status": "",
        "verdict_note": "",
        "repair_note": "",
        "repair_photo_path": None,
        "closed_at": "",
        "tried_technicians": [],
        "reassignment_count": 0,
        "reopen_count": 0,
        "event": "case.created",
        "current_status": "SUBMITTED",
    })
    return state  # recurrence_result is kept so the NEW_CASE decision stays visible


workflow.add_node("prepare_new_case", prepare_new_case)

# 4. Define the edges
def should_reassign(state: AgentState):
    booking_res = state.get("booking_result", {})
    if booking_res.get("assignment_ok") is False:
        return "booking"
    return "comms"

def route_event(state: AgentState) -> str:
    return {
        "repair.done": "verification",
        "verification.submitted": "verification_result",
        "case.reopened": "recurrence",
    }.get(state.get("event"), "intake")

def after_verification(state: AgentState):
    result = state.get("verification_result") or {}
    if result.get("rejected_reason") or result.get("needs_technician_input"):
        return END  # technician message stays in state for the technician app; no buyer email
    return "comms"

def after_verification_result(state: AgentState):
    if (state.get("verification_result") or {}).get("rejected_reason"):
        return END  # wrong status or unknown outcome: no buyer email
    return "comms"

def after_recurrence(state: AgentState):
    if state.get("recurrence_result", {}).get("action") == "NEW_CASE":
        return "prepare_new_case"
    return "comms"

workflow.set_conditional_entry_point(route_event)
workflow.add_edge("intake", "similar_defect")
workflow.add_edge("similar_defect", "triage")
workflow.add_edge("triage", "booking")
workflow.add_conditional_edges("booking", should_reassign)
workflow.add_conditional_edges("verification", after_verification)
workflow.add_conditional_edges("verification_result", after_verification_result)
workflow.add_conditional_edges("recurrence", after_recurrence)
workflow.add_edge("prepare_new_case", "intake")
workflow.add_edge("comms", END)

# 5. Compile the graph
agent_app = workflow.compile()

# 6. Testing block
if __name__ == "__main__":
    example_state = {
        "unit_id": "A-12-08",
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": "tests/test_cases/images/water_leak_again.jpg",
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "booking_result": {},
        "comms_result": {},
        "initial_inspection_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED"
    }
    
    print("🚀 Running Workflow Test...")
    final_state = None
    try:
        for event in agent_app.stream(example_state, stream_mode="values"):
            final_state = event
            
        if final_state:
            print("\n✅ Workflow Completed Successfully!")
            print(json.dumps(final_state.get("comms_result", {}), indent=2))
    except Exception as e:
        print(f"\n❌ Workflow Failed: {e}")
