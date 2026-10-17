import yaml
from .stub_tools import get_available_slots, assign_technician

def triage_node(state: dict) -> dict:
    """P2 (Nicol) owns this. Assign technician based on rules.yaml and availability."""
    # 1. Read rules.yaml
    try:
        with open("rules.yaml", "r") as f:
            rules = yaml.safe_load(f)
    except Exception as e:
        state["triage_result"] = {"error": f"Failed to read rules.yaml: {str(e)}"}
        return state

    # 2. Map category to skill
    category = state.get("intake_result", {}).get("category", "other")
    skills = rules.get("category_to_skill", {}).get(category, ["general"])
    skill = skills[0] # Use the primary skill
    
    block = state.get("unit_id", "A-12-08").split("-")[0]
    
    # 3. Get available slots for that skill
    slots_data = get_available_slots(skill=skill, block=block)
    slots = slots_data.get("slots", [])
    
    if not slots:
        state["triage_result"] = {"error": "No available slots for skill: " + skill}
        return state

    # 4. Assign the best slot (first available)
    best_slot = slots[0]
    assignment = assign_technician(
        case_id="C-NEW", 
        technician_id=best_slot["technician_id"], 
        slot_id=best_slot["slot_id"], 
        reason=f"Matched skill {skill} and earliest availability"
    )
    
    state["triage_result"] = {
        "urgency": state["intake_result"].get("severity_hint", "NORMAL"),
        "assigned_technician": best_slot["technician_id"],
        "slot_id": best_slot["slot_id"],
        "assignment_ok": assignment.get("ok", False),
        "assigned_skill": skill
    }
    return state
