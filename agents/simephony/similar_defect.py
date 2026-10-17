import json
from .llm_client import client, MODEL_TEXT
from .stub_tools import find_similar_cases

def similar_defect_node(state: dict) -> dict:
    """P1: Analyze history for recurrences using stub tools."""
    category = state["intake_result"].get("category", "other")
    unit_id = state.get("unit_id", "A-12-08")
    
    history_data = find_similar_cases(unit_id=unit_id, category=category)
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are a defect analysis expert. Given the current intake and historical cases, "
                "determine if this is a recurring issue. Output ONLY valid JSON: "
                '{"is_recurring": boolean, "recurrence_count": integer, "cluster_reason": "string", "recommendation": "string"}'
            )
        },
        {
            "role": "user",
            "content": f"Current Intake: {json.dumps(state['intake_result'])}\n\nHistorical Data: {json.dumps(history_data)}"
        }
    ]
    
    response = client.chat.completions.create(model=MODEL_TEXT, messages=messages, temperature=0.1)
    raw_text = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
    
    try:
        analysis = json.loads(raw_text)
    except json.JSONDecodeError:
        analysis = {"is_recurring": False, "recurrence_count": 0, "cluster_reason": "Parse error", "recommendation": "Normal triage"}

    state["similar_cases_result"] = {**history_data, "ai_analysis": analysis}
    return state