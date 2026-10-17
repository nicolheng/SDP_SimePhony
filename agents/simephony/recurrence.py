import yaml
from .stub_tools import find_similar_cases

def recurrence_node(state: dict) -> dict:
    """Analyzes previous cases, counts recurrences, raises extra inspection request."""
    # 1. Get recurrence thresholds from rules.yaml
    try:
        with open("rules.yaml", "r") as f:
            rules = yaml.safe_load(f)
    except Exception:
        # Fallback to default
        rules = {"escalation": {"occurrence_threshold": 3}}

    threshold = rules.get("escalation", {}).get("occurrence_threshold", 3)
    
    # 2. Increment reopen count
    current_count = state.get("reopen_count", 0)
    new_count = current_count + 1
    state["reopen_count"] = new_count
    
    # 3. Check for escalation
    if new_count >= threshold:
        state["current_status"] = "ESCALATION_PENDING"
        # In a real app, we would call request_extra_inspection here
    else:
        state["current_status"] = "REOPENED"
        
    return state

