"""Shared confidence threshold and human-review routing for decision agents."""

from . import backend_tools

CONFIDENCE_THRESHOLD = 0.7


def flag_for_human_review(
    state: dict,
    step: str,
    confidence_score: float,
    *,
    rule_conflict: bool = False,
    abstain_reason: str | None = None,
) -> dict:
    reasons = []
    if confidence_score < CONFIDENCE_THRESHOLD:
        reasons.append(f"low confidence (score: {confidence_score:.2f})")
    if rule_conflict:
        reasons.append("rule conflict")
    if abstain_reason:
        reasons.append(abstain_reason)
    if not reasons:
        return state

    reason = "AI abstained due to " + " / ".join(reasons) + ". Routed to human review."
    state["needs_human_review"] = True
    state["review_reason"] = reason
    state["current_status"] = "PENDING_REVIEW"
    if state.get("case_id") and state.get("case_id") != "C-NEW" and not state.get("decide_only"):
        result = backend_tools.flag_case_for_human_review(
            state["case_id"], step, reason, confidence_score
        )
        if result.get("ok") is False:
            state["review_save_error"] = result["error"]
    return state
