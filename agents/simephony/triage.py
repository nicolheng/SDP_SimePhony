from .stub_tools import get_available_slots, assign_technician

def triage_node(state: dict) -> dict:
    """P2 (Nicol) owns this. Assign technician based on rules.yaml and availability."""
    # TODO (P2 - Nicol): Replace this mock with real rules.yaml reading and Qwen reasoning.
    # You have access to get_available_slots and assign_technician from stub_tools.
    skill = "plumbing" # Mocked for now, P2 will read from rules.yaml later
    block = state.get("unit_id", "A-12-08").split("-")[0]
    
    slots_data = get_available_slots(skill=skill, block=block)
    slots = slots_data.get("slots", [])
    
    if not slots:
        state["triage_result"] = {"error": "No available slots"}
        return state

    best_slot = slots[0]
    assignment = assign_technician(
        case_id="C-NEW", 
        technician_id=best_slot["technician_id"], 
        slot_id=best_slot["slot_id"], 
        reason="Best match for skill and earliest availability"
    )
    
    state["triage_result"] = {
        "urgency": state["intake_result"].get("severity_hint", "NORMAL"),
        "assigned_technician": best_slot["technician_id"],
        "slot_id": best_slot["slot_id"],
        "assignment_ok": assignment.get("ok", False)
    }
    return state