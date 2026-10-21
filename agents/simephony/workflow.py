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
from .verification import signoff_ready_node, verification_node, verification_result_node
from .recurrence import new_case_escalation_node, recurrence_node, reopen_escalation_node
from .repair_estimate import repair_estimate_node
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
    event: str # case.created | verdict.recorded | repair.done | verification.submitted | case.reopened | booking.rejected
    case_id: str
    verdict_note: str
    repair_note: str
    repair_photo_path: Optional[str]
    closed_at: str # ISO timestamp, timezone-aware
    reopen_photo_path: Optional[str]
    reopen_description: str # what the buyer wrote when reopening
    reopen_count: int
    verification_outcome: str # FIXED | NOT_FIXED | CANNOT_VERIFY
    verification_status: str
    new_case_escalation: dict # new report: extra inspection asked of SDP too (keep_status)
    signoff_deadline_local: str # buyer's sign-off deadline once SDP has signed (developer.signed)
    verification_result: dict
    recurrence_result: dict
    repair_estimate: dict # hours + reason after a VALID verdict

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
workflow.add_node("signoff_ready", signoff_ready_node)
workflow.add_node("recurrence", recurrence_node)
workflow.add_node("reopen_escalation", reopen_escalation_node)
workflow.add_node("new_case_escalation", new_case_escalation_node)
workflow.add_node("repair_estimate", repair_estimate_node)
workflow.add_node("initial_inspection", initial_inspection_node)

def prepare_new_case(state: dict) -> dict:
    """Past-grace reopen: start a fresh case from the reopen photo, dropping the old case's results."""
    state.update({
        "user_description": state.get("reopen_description") or state.get("user_description", ""),
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
    if state.get("event") in (None, "", "case.created"):
        return "new_case_escalation"  # a repeat defect on a new report also goes to SDP; the visit stays booked
    return "comms"

def route_event(state: AgentState) -> str:
    event = state.get("event")
    if not event or event == "case.created":
        return "intake"
    return {
        "repair.done": "verification",
        "verification.submitted": "verification_result",
        "case.reopened": "recurrence",
        "booking.rejected": "booking",  # technician turned the visit down in the app: book someone else
        "verdict.recorded": "repair_estimate",  # VALID: estimate the repair time, then tell the buyer
        "developer.signed": "signoff_ready",  # SDP signed the repair off: send the buyer the check guide
        "inspection.approved": "initial_inspection",  # SDP approved the extra inspection: brief, then book it
    }.get(event, "unhandled_event")


def unhandled_event(state: dict) -> dict:
    """An event this graph has no agent for (e.g. verdict.recorded): change nothing, contact no one."""
    print(f"[WORKFLOW] No agent handles event {state.get('event')!r}; state left unchanged")
    return state


workflow.add_node("unhandled_event", unhandled_event)

def after_verification(state: AgentState):
    result = state.get("verification_result") or {}
    if result.get("rejected_reason") or result.get("needs_technician_input"):
        return END  # technician message stays in state for the technician app; no buyer email
    return "comms"

def after_initial_inspection(state: AgentState):
    if (state.get("initial_inspection_result") or {}).get("save_error"):
        return END  # brief refused (e.g. no approved request): nothing booked, nobody told
    return "booking"  # book the detailed inspection (EXTRA_INSPECTION keeps its status)

def after_signoff_ready(state: AgentState):
    if (state.get("verification_result") or {}).get("rejected_reason"):
        return END  # SDP hasn't signed yet (or the case moved on): nothing to tell the buyer
    return "comms"

def after_verification_result(state: AgentState):
    result = state.get("verification_result") or {}
    if result.get("rejected_reason"):
        return END  # wrong status, unknown outcome or NOT_FIXED without a photo: no buyer email
    if result.get("next_event") == "case.reopened":
        return "reopen_escalation"  # NOT_FIXED reopened the case: check escalation before telling the buyer
    return "comms"

def after_recurrence(state: AgentState):
    action = state.get("recurrence_result", {}).get("action")
    if action == "NEW_CASE":
        return "prepare_new_case"
    if action == "REOPENED":
        return "triage"  # below the escalation threshold: book a revisit (xiaowen's flow)
    return "comms"  # escalated to SDP, or the reopen was rejected

workflow.set_conditional_entry_point(route_event)
workflow.add_edge("intake", "similar_defect")
workflow.add_edge("similar_defect", "triage")
workflow.add_edge("triage", "booking")
workflow.add_conditional_edges("booking", should_reassign)
workflow.add_conditional_edges("verification", after_verification)
workflow.add_conditional_edges("verification_result", after_verification_result)
workflow.add_conditional_edges("signoff_ready", after_signoff_ready)
workflow.add_conditional_edges("initial_inspection", after_initial_inspection)
workflow.add_conditional_edges("recurrence", after_recurrence)
workflow.add_edge("prepare_new_case", "intake")
workflow.add_conditional_edges("reopen_escalation", after_recurrence)
workflow.add_edge("repair_estimate", "comms")
workflow.add_edge("new_case_escalation", "comms")
workflow.add_edge("comms", END)
workflow.add_edge("unhandled_event", END)

# 5. Compile the graph
agent_app = workflow.compile()

# 6. Testing block
if __name__ == "__main__":
    example_state = {
        "unit_id": "A-12-08",
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": "tests/data/test_cases/images/water_leak_again.jpg",
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
