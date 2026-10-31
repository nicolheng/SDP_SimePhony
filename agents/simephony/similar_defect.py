import sys
import os

# ---------------------------------------------------------------------------
# sys.path fix — backend is a sibling of the agents folder.
# ---------------------------------------------------------------------------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))

# Direct import from the real backend tools (no stub fallback — tools.py is ready).
from tools import find_similar_cases

from .llm_client import client, MODEL_TEXT
from .structured_output import StructuredOutputError, chat_json
from agents.telemetry import record_llm_telemetry

# rules.yaml: escalation.occurrence_threshold = 3
_OCCURRENCE_THRESHOLD = 3


def _save_links(case_id: str | None, history: list[dict], occurrences: int) -> str | None:
    """Store the related cases on the case (shown on the case page) via tools.save_similar_cases.
    INVALID cases are linked but not counted. Returns the error, or None."""
    from . import backend_tools
    if not case_id or case_id == "C-NEW":
        return "No case in the DB to link against"
    links = [{"related_case_id": c["case_id"], "reason": c.get("reason") or "Related case", "score": c.get("score")}
             for c in history]
    try:
        saved = backend_tools.save_similar_cases(case_id, links, occurrence_count=occurrences)
    except Exception as e:
        saved = {"ok": False, "error": str(e)}
    if saved.get("ok") is False:
        print(f"⚠️ [SIMILAR] links for {case_id} not saved: {saved.get('error')}")
        return saved.get("error")
    return None


def similar_defect_node(state: dict) -> dict:
    """P1: Analyze history for recurrences using backend/tools.py (real database)."""
    category = state["intake_result"].get("category", "other")
    unit_id = state.get("unit_id", "A-12-08")

    # Call the real find_similar_cases from backend/tools.py.
    # The function accepts a 'filters' dict and returns a list of dicts.
    try:
        history_data = find_similar_cases(filters={"unit_id": unit_id, "category": category}, top_k=50)
        # The new case is already in the DB: it is not one of its own earlier cases.
        history_data = [c for c in history_data if c.get("case_id") != state.get("case_id")]
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
            "content": (
                "You are a defect analysis expert. Explain whether the supplied case history suggests a "
                "recurring defect cluster. Do not make escalation decisions; the application applies those "
                "rules. Output ONLY valid JSON with cluster_reason and confidence_score. The confidence_score "
                "must be between 0.0 and 1.0 and reflect your certainty in the explanation, based only on "
                "the provided history and report. Use a lower score when evidence is limited or ambiguous. "
                'Schema: {"cluster_reason": "string", "confidence_score": 0.9}'
            )
        },
        {
            "role": "user",
            "content": (
                f"Unit {unit_id} has had {past_case_count} past cases of '{category}'. "
                f"The user says: '{state['user_description']}'. Explain why this may indicate a cluster."
            )
        }
    ]

    confidence_score = None
    try:
        data = chat_json(
            client,
            MODEL_TEXT,
            messages,
            {
                "type": "object",
                "required": ["cluster_reason", "confidence_score"],
                "properties": {
                    "cluster_reason": {"type": "string"},
                    "confidence_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                },
                "additionalProperties": False,
            },
            temperature=0.1,
        )
        parsed = data["parsed"]
        confidence_score = float(parsed["confidence_score"])
        record_llm_telemetry(
            data["model"],
            data["timing_ms"],
            data["tokens"],
            confidence_score=confidence_score,
        )
        ai_reason = parsed["cluster_reason"]
    except StructuredOutputError:
        raise
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
        "save_error": (None if state.get("decide_only")  # decide_only: the caller saves the links
                       else _save_links(state.get("case_id"), history_data, total_occurrences)),
        "related": [{"case_id": c["case_id"], "unit_id": c.get("unit_id"), "reason": c.get("reason") or "Related case",
                     "score": c.get("score"), "at": c.get("created_at")} for c in history_data],
        "cluster_reason": ai_reason,
        "confidence_score": confidence_score,
        "ai_analysis": {
            "is_recurring": total_occurrences > 1,
            "recurrence_count": total_occurrences,
            "cluster_reason": ai_reason,
            "confidence_score": confidence_score,
            "recommendation": recommendation
        }
    }
    return state