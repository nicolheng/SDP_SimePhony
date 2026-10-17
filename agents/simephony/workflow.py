# agents/simephony/workflow.py
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END

# P1 Nodes (Sequential)
from .intake import intake_node
from .similar_defect import similar_defect_node
from .triage import triage_node

# P2 Nodes (Event-Driven Placeholders)
from .comms import comms_node
from .verification import verification_node
from .recurrence import recurrence_node

class AgentState(TypedDict):
    user_description: str
    image_path: Optional[str]
    unit_id: str
    intake_result: dict
    similar_cases_result: dict
    triage_result: dict
    missing_info: list
    current_status: str # Added for P2's event agents

# --- P1: Sequential Flow ---
workflow = StateGraph(AgentState)
workflow.add_node("intake", intake_node)
workflow.add_node("similar_defect", similar_defect_node)
workflow.add_node("triage", triage_node)

workflow.set_entry_point("intake")
workflow.add_edge("intake", "similar_defect")
workflow.add_edge("similar_defect", "triage")
workflow.add_edge("triage", END)

# --- P2: Event-Driven Nodes (Nicol will wire these up later) ---
workflow.add_node("comms", comms_node)
workflow.add_node("verification", verification_node)
workflow.add_node("recurrence", recurrence_node)
# TODO (P2): Add conditional edges here based on events (e.g., case.reopened -> recurrence)

agent_app = workflow.compile()