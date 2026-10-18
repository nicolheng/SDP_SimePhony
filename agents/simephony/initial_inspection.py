import json
import sys
import os

# 1. Fix the path to import from the sibling 'backend' folder
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))
from tools import attach_inspection_brief

# 2. Local imports
from .stub_tools import send_email
from .llm_client import client, MODEL_TEXT

def initial_inspection_node(state: dict) -> dict:
    """Generate a comprehensive inspection brief for a recurring defect."""
    
    # Extract necessary information from state
    unit_id = state.get("unit_id", "UNKNOWN")
    intake_result = state.get("intake_result", {})
    similar_cases_result = state.get("similar_cases_result", {})
    
    # System prompt for Qwen 2.5
    system_prompt = (
        "You are a 'Senior Property Inspector'. Your goal is to create a comprehensive inspection brief for a technician visiting a site with a recurring defect. "
        "Output ONLY valid JSON matching this exact schema: "
        '{"timeline": "string", "photo_comparison_notes": "string", "neighboring_units_to_check": ["string"], "likely_components": ["string"], "checklist": ["string"]}'
    )

    user_input = (
        f"Unit: {unit_id}\n"
        f"Current Intake: {json.dumps(intake_result)}\n"
        f"Similar Cases History: {json.dumps(similar_cases_result)}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL_TEXT,
            messages=messages,
            temperature=0.1,
        )
        raw_text = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        inspection_brief_json = json.loads(raw_text)
    except Exception as e:
        print(f"⚠️ LLM failed to generate brief: {e}")
        inspection_brief_json = {
            "timeline": "Unknown",
            "photo_comparison_notes": "Check all areas",
            "neighboring_units_to_check": [],
            "likely_components": ["General inspection"],
            "checklist": ["Verify defect", "Take photos", "Report findings"]
        }

    # Convert JSON output to a readable Markdown string
    markdown_string = (
        f"# 🔍 Inspection Brief for Unit {unit_id}\n\n"
        f"### 📅 Timeline\n{inspection_brief_json.get('timeline', 'N/A')}\n\n"
        f"### 📸 Photo Comparison Notes\n{inspection_brief_json.get('photo_comparison_notes', 'N/A')}\n\n"
        f"### 🏘️ Neighboring Units to Check\n" + "\n".join([f"- {u}" for u in inspection_brief_json.get('neighboring_units_to_check', [])]) + "\n\n"
        f"### 🔧 Likely Components\n" + "\n".join([f"- {c}" for c in inspection_brief_json.get('likely_components', [])]) + "\n\n"
        f"### ✅ Checklist\n" + "\n".join([f"- [ ] {c}" for c in inspection_brief_json.get('checklist', [])])
    )

    # Save the JSON to state
    state["initial_inspection_result"] = inspection_brief_json

    # Attach the inspection brief to the case (Safety net included)
    try:
        # Using a dummy case_id for testing, in real flow this comes from state
        attach_inspection_brief(case_id="TEST-001", brief=markdown_string)
        print("✅ Successfully attached brief to database.")
    except Exception as e:
        print(f"⚠️ Failed to attach inspection brief (Expected if DB is locked/missing): {e}")

    # Send an email to the technician (Safety net included)
    try:
        send_email(
            to="tech@example.com",
            subject=f"🚨 Extra Inspection Required: Unit {unit_id}",
            body=markdown_string
        )
        print("✅ Successfully triggered email send.")
    except Exception as e:
        print(f"⚠️ Failed to send email (Expected if SMTP not configured): {e}")

    return state