import json
import sys
import os

# ---------------------------------------------------------------------------
# sys.path fix — backend is a sibling of the agents folder.
# ---------------------------------------------------------------------------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))

# Direct import from the real backend tools (no stub fallback — tools.py is ready).
from tools import find_similar_cases

from .llm_client import client, MODEL_TEXT

# rules.yaml: escalation.occurrence_threshold = 3
_OCCURRENCE_THRESHOLD = 3


def similar_defect_node(state: dict) -> dict:
    """P1: Analyze history for recurrences using backend/tools.py (real database)."""
    category = state["intake_result"].get("category", "other")
    unit_id = state.get("unit_id", "A-12-08")

    # Call the real find_similar_cases from backend/tools.py.
    # The function accepts a 'filters' dict and returns a list of dicts.
    try:
        history_data = find_similar_cases(filters={"unit_id": unit_id, "category": category})
        # Only count cases that are not INVALID (counts_toward_escalation flag from tools.py).
        past_case_count = sum(1 for c in history_data if c.get("counts_toward_escalation", True))
    except Exception as e:
        print(f"⚠️ Real DB query failed: {e}. Defaulting to 0 past cases.")
        past_case_count = 0
        history_data = []

    # Total occurrences = past non-INVALID cases + the current submission.
    total_occurrences = past_case_count + 1

    # Let the AI explain the cluster in plain text.
    messages = [
        {
            "role": "system",
            "content": 'You are a defect analysis expert. Output ONLY valid JSON: {"cluster_reason": "string"}'
        },
        {
            "role": "user",
            "content": (
                f"Unit {unit_id} has had {past_case_count} past cases of '{category}'. "
                f"The user says: '{state['user_description']}'. Explain why this may indicate a cluster."
            )
        }
    ]

    try:
        response = client.chat.completions.create(model=MODEL_TEXT, messages=messages, temperature=0.1)
        raw_text = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        ai_reason = json.loads(raw_text).get("cluster_reason", "System detected multiple past cases in the database.")
    except Exception:
        ai_reason = "System detected multiple past cases in the database."

    # Enforce the business rule in Python — never trust the AI for threshold decisions.
    # rules.yaml: escalation.occurrence_threshold = 3
    if total_occurrences >= _OCCURRENCE_THRESHOLD:
        recommendation = "flag_for_extra_inspection"
    else:
        recommendation = "normal_triage"

    state["similar_cases_result"] = {
        "past_case_count": past_case_count,
        "total_occurrences": total_occurrences,
        "ai_analysis": {
            "is_recurring": total_occurrences > 1,
            "recurrence_count": total_occurrences,
            "cluster_reason": ai_reason,
            "recommendation": recommendation
        }
    }
    return state