from .rules import load_rules
from .llm_client import get_client, get_models

def triage_node(state: dict) -> dict:
    """P2 (Nicol) owns this. Determines urgency and required skill for a defect."""
    client = get_client()
    _, text_model = get_models()

    # 1. Read rules.yaml
    try:
        rules = load_rules()
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
    
    # 4. Save Verdict to Database (Planned)
    # TODO: Call a tool like `update_case_triage(case_id, urgency, triage_reason)`
    # For now, we just log that we would save it.
    print(f"💾 [DB SAVE] Case {state.get('case_id', 'C-NEW')}: Urgency={urgency}, Skill={skill}")

    state["triage_result"] = {
        "urgency": urgency,
        "assigned_skill": skill,
        "category": category,
        "justification": f"Assigned {skill} based on {category} and {urgency} urgency."
    }
    
    return state
