# agents/simephony/booking.py
from .llm_client import get_client, get_models
from .stub_tools import get_available_slots, assign_technician

def booking_node(state: dict) -> dict:
    """P2 (Nicol) owns this. Handles the logistics of finding and assigning a technician."""
    # 1. Handle Reassignment State Updates
    reassign_count = state.get("reassignment_count", 0)
    tried_techs = state.get("tried_technicians", [])
    
    booking_res = state.get("booking_result", {})
    if booking_res.get("assignment_ok") is False:
        failed_tech = booking_res.get("assigned_technician")
        if failed_tech and failed_tech not in tried_techs:
            tried_techs.append(failed_tech)
            reassign_count += 1
            print(f"🔄 [BOOKING] Technician {failed_tech} rejected. Reassigning... (Attempt {reassign_count})")
    
    # 2. Retrieve the triage verdict from state
    triage_result = state.get("triage_result", {})
    required_skill = triage_result.get("assigned_skill", "general")
    urgency = str(triage_result.get("urgency", "normal")).lower()
    
    # 3. Get technician availability
    block = state.get("unit_id", "A-12-08").split("-")[0]
    try:
        all_slots = sorted(get_available_slots(skill=required_skill, block=block).get("slots", []),
                           key=lambda s: s.get("start", ""))
    except Exception as e:
        print(f"⚠️ [BOOKING] Slot lookup failed: {e}")
        all_slots = []
    
    # Filter out technicians who already rejected this case
    available_slots = [s for s in all_slots if s["technician_id"] not in tried_techs]
    
    if not available_slots:
        print("❌ [BOOKING] No more available technicians. Escalating.")
        state["booking_result"] = {"error": "No more available technicians. Escalating to SDP staff."}
        state["tried_technicians"] = tried_techs
        state["reassignment_count"] = reassign_count
        state["current_status"] = "ESCALATION_PENDING"
        return state

    # 4. Smart Slot Selection
    if urgency == "high":
        chosen_slot = available_slots[0]
    else:
        same_block_slots = [s for s in available_slots if s.get("block") == block]
        chosen_slot = same_block_slots[0] if same_block_slots else available_slots[0]
    
    # 5. Assign Technician
    print(f"🛠️ [BOOKING] Trying technician {chosen_slot['technician_id']} for slot {chosen_slot['slot_id']}")
    assignment = assign_technician(
        case_id=state.get("case_id", "C-NEW"), 
        technician_id=chosen_slot["technician_id"], 
        slot_id=chosen_slot["slot_id"], 
        reason=f"Matched skill {required_skill} and availability"
    )
    
    # 6. Handle Alternatives
    alternatives = [s for s in available_slots if s["slot_id"] != chosen_slot["slot_id"]][:3]

    state["booking_result"] = {
        "assigned_technician": chosen_slot["technician_id"],
        "slot_id": chosen_slot["slot_id"],
        "assignment_ok": assignment.get("ok", False),
        "alternatives": alternatives,
        "booking_status": "PENDING_TECH_CONFIRM",
        "reassignment_count": reassign_count
    }
    
    state["tried_technicians"] = tried_techs
    state["reassignment_count"] = reassign_count
    state["current_status"] = "ASSIGNED"
    
    return state
