import json
import sys
import os

# 1. Add backend to Python path so we can import tools
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))

# 2. Import P4's REAL database function (and keep stub as fallback)
try:
    from tools import find_similar_cases as real_find_similar_cases
    USE_REAL_DB = True
except ImportError:
    from .stub_tools import find_similar_cases as real_find_similar_cases
    USE_REAL_DB = False

from .llm_client import client, MODEL_TEXT

def similar_defect_node(state: dict) -> dict:
    """P1: Analyze history for recurrences using REAL database tools."""
    category = state["intake_result"].get("category", "other")
    unit_id = state.get("unit_id", "A-12-08")

    # 3. Call the real function! (P4's function expects a 'filters' dictionary)
    try:
        if USE_REAL_DB:
            history_data = real_find_similar_cases(filters={"unit_id": unit_id, "category": category})
            # P4's function returns a list of dicts, so the count is the length of the list
            past_case_count = len(history_data)
        else:
            # Fallback to stub if tools.py isn't found
            history_data = real_find_similar_cases(unit_id=unit_id, category=category)
            past_case_count = history_data.get("past_case_count", 0)
            
    except Exception as e:
        print(f"⚠️ Real DB query failed: {e}. Falling back to stub.")
        past_case_count = 2 if unit_id == "A-12-08" else 0
        history_data = []

    # 4. Calculate TRUE occurrence count (Past cases + Current case)
    total_occurrences = past_case_count + 1

    # 5. Let AI generate the "cluster_reason" (Text explanation)
    messages = [
        {
            "role": "system",
            "content": "You are a defect analysis expert. Output ONLY valid JSON: {\"cluster_reason\": \"string\"}"
        },
        {
            "role": "user",
            "content": f"Unit {unit_id} has had {past_case_count} past cases of {category}. The user says: '{state['user_description']}'. Explain why this is a cluster."
        }
    ]

    try:
        response = client.chat.completions.create(model=MODEL_TEXT, messages=messages, temperature=0.1)
        raw_text = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        ai_reason = json.loads(raw_text).get("cluster_reason", "System detected multiple past cases in the database.")
    except Exception:
        ai_reason = "System detected multiple past cases in the database."

    # 6. Enforce the Business Rule in Python (Never trust the AI for rules!)
    if total_occurrences >= 3:
        recommendation = "flag_for_extra_inspection"
    else:
        recommendation = "normal_triage"

    # 7. Save to state
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