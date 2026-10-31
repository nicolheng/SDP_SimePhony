import json
import sys
import os

# ---------------------------------------------------------------------------
# sys.path fix — backend is a sibling of the agents folder.
# ---------------------------------------------------------------------------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))

# All imports come directly from backend/tools.py.
from . import backend_tools


# Through backend_tools (so tests can fake the DB writes); module-level names kept for P1's tests.
def attach_inspection_brief(case_id: str, brief: dict) -> dict:
    return backend_tools.attach_inspection_brief(case_id, brief)


def send_email(to: str, subject: str, body: str, case_id: str | None = None) -> dict:
    return backend_tools.send_email(to, subject, body, case_id)

from .llm_client import client, MODEL_TEXT
from .structured_output import StructuredOutputError, chat_json

# ---------------------------------------------------------------------------
# rules.yaml constants (mirrored here for prompt enforcement).
# Keep in sync with /rules.yaml whenever that file changes.
# ---------------------------------------------------------------------------
_ALLOWED_CATEGORIES = (
    "water_leak", "plumbing", "waterproofing", "drainage", "sanitary_fittings",
    "electrical", "wall_crack", "structural_crack", "tiles", "flooring",
    "ceiling", "roof", "door_window", "paint", "external_works", "other"
)
_OCCURRENCE_THRESHOLD = 3        # rules.yaml: escalation.occurrence_threshold
_STACK_CLUSTER_THRESHOLD = 3     # rules.yaml: escalation.stack_cluster_threshold
_GRACE_PERIOD_DAYS = 30          # rules.yaml: grace_period_days


def initial_inspection_node(state: dict) -> dict:
    """Generate a structured inspection brief for a recurring defect (rules.yaml compliant)."""

    unit_id = state.get("unit_id", "UNKNOWN")
    intake_result = state.get("intake_result", {})
    similar_cases_result = state.get("similar_cases_result", {})
    category = intake_result.get("category", "other")
    urgency = intake_result.get("urgency", "normal")

    categories_str = ", ".join(f"'{c}'" for c in _ALLOWED_CATEGORIES)

    system_prompt = (
        "You are a Senior Property Inspector generating a pre-inspection brief for a technician. "
        "The brief covers a RECURRING defect that has triggered the escalation rule. "
        "Output ONLY valid JSON matching this exact schema:\n\n"
        "{\n"
        '  "timeline": [{"at": "string", "text": "string"}],\n'
        '  "photoComparison": "string",\n'
        '  "neighbouringUnits": [{"unitId": "string", "cases": integer, "last": "string"}],\n'
        '  "likelyComponents": ["string"],\n'
        '  "checklist": ["string"]\n'
        "}\n\n"

        "━━━ RULES (rules.yaml — DO NOT DEVIATE) ━━━\n"
        f"1. Valid categories: {categories_str}.\n"
        f"   The defect category you are briefing is: '{category}'. "
        "   Do NOT rename or invent sub-categories outside the list above.\n"
        f"2. Escalation is triggered when occurrence_count >= {_OCCURRENCE_THRESHOLD} in the same unit "
        f"   or >= {_STACK_CLUSTER_THRESHOLD} distinct units in the same stack.\n"
        f"3. Grace period is {_GRACE_PERIOD_DAYS} days — note if the recurrence falls within or outside this window.\n"
        f"4. If urgency = '{urgency}' and it is 'high', the checklist MUST include an item flagging "
        "   that this case requires immediate human review and MUST NOT be auto-closed.\n"
        "5. The 'checklist' array MUST contain at least 3 items and MUST NOT be empty — "
        "   this field is required by the database schema.\n"
        "6. Use only factual information from the context provided. Do not invent case IDs, unit IDs, "
        "   technician names, or dates that are not in the input.\n"
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
        inspection_brief_json = chat_json(
            client,
            MODEL_TEXT,
            messages,
            {
                "type": "object",
                "required": ["timeline", "photoComparison", "neighbouringUnits",
                             "likelyComponents", "checklist"],
                "properties": {
                    "timeline": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["at", "text"],
                            "properties": {"at": {"type": "string"}, "text": {"type": "string"}},
                            "additionalProperties": False,
                        },
                    },
                    "photoComparison": {"type": "string"},
                    "neighbouringUnits": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["unitId", "cases", "last"],
                            "properties": {
                                "unitId": {"type": "string"},
                                "cases": {"type": "integer"},
                                "last": {"type": "string"},
                            },
                            "additionalProperties": False,
                        },
                    },
                    "likelyComponents": {"type": "array", "items": {"type": "string"}},
                    "checklist": {"type": "array", "items": {"type": "string"}, "minItems": 3},
                },
                "additionalProperties": False,
            },
            temperature=0.1,
        )
    except StructuredOutputError:
        inspection_brief_json = {
            "timeline": [{"at": "unknown", "text": "Could not generate timeline"}],
            "photoComparison": "Check all areas against previous photos.",
            "neighbouringUnits": [],
            "likelyComponents": ["General inspection required"],
            "checklist": ["Verify defect", "Take photos", "Report findings"],
        }
        state["_structured_output_error"] = True
    except Exception as e:
        print(f"⚠️ LLM failed to generate brief: {e}")
        inspection_brief_json = {
            "timeline": [{"at": "unknown", "text": "Could not generate timeline"}],
            "photoComparison": "Check all areas against previous photos.",
            "neighbouringUnits": [],
            "likelyComponents": ["General inspection required"],
            "checklist": ["Verify defect", "Take photos", "Report findings"]
        }

    # Save the structured JSON to state.
    state["initial_inspection_result"] = inspection_brief_json

    # -----------------------------------------------------------------------
    # Persist the brief to the database.
    # attach_inspection_brief (backend/tools.py) expects a JSON dict with a
    # 'checklist' key — NOT a Markdown string.
    # -----------------------------------------------------------------------
    case_id = state.get("case_id")
    if state.get("decide_only"):  # the caller (the web app) attaches the brief and tells the technician
        state["initial_inspection_result"] = {**inspection_brief_json, "save_error": None}
        return state
    try:
        saved = attach_inspection_brief(case_id=case_id, brief=inspection_brief_json)
    except Exception as e:
        saved = {"ok": False, "error": str(e)}
    save_error = saved.get("error") if isinstance(saved, dict) and saved.get("ok") is False else None
    if save_error:
        # e.g. no approved request: the case is not moved to EXTRA_INSPECTION, so nothing is booked
        print(f"⚠️ [INSPECTION] brief for {case_id} not attached: {save_error}")
    else:
        print("✅ Successfully attached brief to database.")
        state["current_status"] = "EXTRA_INSPECTION"
    state["initial_inspection_result"] = {**inspection_brief_json, "save_error": save_error}

    # -----------------------------------------------------------------------
    # Email notification via the real send_email in backend/tools.py.
    # -----------------------------------------------------------------------
    # Build a human-readable Markdown summary for the email body only.
    checklist_md = "\n".join(f"- [ ] {c}" for c in inspection_brief_json.get("checklist", []))
    components_md = "\n".join(f"- {c}" for c in inspection_brief_json.get("likelyComponents", []))
    email_body = (
        f"# 🔍 Inspection Brief for Unit {unit_id}\n\n"
        f"**Category:** {category}  |  **Urgency:** {urgency}\n\n"
        f"### 📸 Photo Comparison\n{inspection_brief_json.get('photoComparison', 'N/A')}\n\n"
        f"### 🔧 Likely Components\n{components_md}\n\n"
        f"### ✅ Checklist\n{checklist_md}"
    )

    try:
        send_email(
            to=os.getenv("SDP_STAFF_EMAIL", "tech@example.com"),
            subject=f"🚨 Extra Inspection Required: Unit {unit_id} ({case_id})",
            body=email_body,
            case_id=case_id,
        )
        print("✅ Successfully triggered email send.")
    except Exception as e:
        print(f"⚠️ Failed to send email (expected if SMTP not configured): {e}")

    return state