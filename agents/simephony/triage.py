import yaml
from .llm_client import get_client, get_models
from .stub_tools import get_available_slots, assign_technician

def triage_node(state: dict) -> dict:
    """P2 (Nicol) owns this. Assign technician based on rules.yaml and availability."""
    client = get_client()
    _, text_model = get_models()

    # 1. Read rules.yaml
    try:
        with open("rules.yaml", "r") as f:
            rules = yaml.safe_load(f)
    except Exception as e:
        state["triage_result"] = {"error": f"Failed to read rules.yaml: {str(e)}"}
        return state

    # 2. AI Urgency Assessment (Override intake hint if high risk is detected)
    user_desc = state.get("user_description", "")
    intake_severity = state.get("intake_result", {}).get("severity_hint", "NORMAL")
    
    urgency_prompt = (
        f"You are a safety triage expert. Analyze this property defect description: '{user_desc}'.\n"
        f"The initial intake severity was {intake_severity}.\n"
        f"Refer to these high-urgency rules: {rules.get('urgency', {}).get('high', [])}.\n"
        "Determine if the urgency should be upgraded to HIGH, remain the same, or be lowered. "
        "Respond with exactly one word: HIGH, MEDIUM, LOW, or NORMAL."
    )
    
    try:
        urgency_resp = client.chat.completions.create(
            model=text_model,
            messages=[{"role": "user", "content": urgency_prompt}],
            temperature=0.0
        )
        urgency = urgency_resp.choices[0].message.content.strip().upper()
        if urgency not in ["HIGH", "MEDIUM", "LOW", "NORMAL"]:
            urgency = intake_severity
    except Exception:
        urgency = intake_severity

    # 3. Map category to skill
    category = state.get("intake_result", {}).get("category", "other")
    skills = rules.get("category_to_skill", {}).get(category, ["general"])
    skill = skills[0] 
    
    block = state.get("unit_id", "A-12-08").split("-")[0]
    
    # 4. Get available slots for that skill
    slots_data = get_available_slots(skill=skill, block=block)
    slots = slots_data.get("slots", [])
    
    if not slots:
        state["triage_result"] = {"error": "No available slots for skill: " + skill}
        return state

    # 5. Slot Selection Logic
    preferred_slot_id = state.get("preferred_slot_id")
    chosen_slot = None
    
    if preferred_slot_id:
        # Try to find the preferred slot in the available list
        chosen_slot = next((s for s in slots if s["slot_id"] == preferred_slot_id), None)
    
    # Fallback to the first available slot if preferred is missing or unavailable
    if not chosen_slot:
        chosen_slot = slots[0]

    # 6. Assign the technician
    assignment = assign_technician(
        case_id="C-NEW", 
        technician_id=chosen_slot["technician_id"], 
        slot_id=chosen_slot["slot_id"], 
        reason=f"Matched skill {skill} and availability"
    )
    
    # 7. Generate Justification
    justification_prompt = (
        f"Explain in one professional sentence why this technician was assigned.\n"
        f"Defect: {category}, Urgency: {urgency}, Technician: {chosen_slot['technician_id']}, "
        f"Slot: {chosen_slot['start']}. Mention the risk if urgency is HIGH."
    )
    
    try:
        just_resp = client.chat.completions.create(
            model=text_model,
            messages=[{"role": "user", "content": justification_prompt}],
            temperature=0.1
        )
        justification = just_resp.choices[0].message.content.strip()
    except Exception:
        justification = f"Assigned {chosen_slot['technician_id']} for {category} repair."

    # 8. Provide Alternatives (Top 3 available slots)
    # We filter out the chosen slot and take the top 3.
    alternatives = [s for s in slots if s["slot_id"] != chosen_slot["slot_id"]][:3]

    state["triage_result"] = {
        "urgency": urgency,
        "assigned_technician": chosen_slot["technician_id"],
        "slot_id": chosen_slot["slot_id"],
        "assignment_ok": assignment.get("ok", False),
        "assigned_skill": skill,
        "justification": justification,
        "alternatives": alternatives
    }
    return state
