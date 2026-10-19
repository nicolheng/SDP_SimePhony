from datetime import datetime, timedelta, timezone

from .escalation import check_escalation
from .rules import load_rules
from .stub_tools import request_extra_inspection


def _result(accepted: bool, reason: str, action: str, occurrence: int,
            cluster_size: int = 0, reasons: list | None = None, approval_id: str | None = None) -> dict:
    return {
        "accepted": accepted, "reason": reason, "occurrence": occurrence,
        "cluster_size": cluster_size, "escalation_reasons": reasons or [],
        "approval_id": approval_id, "action": action,
    }


def recurrence_node(state: dict, now: datetime | None = None) -> dict:
    """Reopen gate + escalation for a CLOSED case (CONTRACTS section 7, RecurrenceAgent rules)."""
    now = now or datetime.now(timezone.utc)
    count = state.get("reopen_count", 0)
    occurrence = count + 1
    status = state.get("current_status")

    def reject(reason: str, action: str = "REJECTED") -> dict:
        state["recurrence_result"] = _result(False, reason, action, occurrence)
        return state

    if status == "INVALID":
        return reject("INVALID cases cannot be reopened; submit a new report")
    if status != "CLOSED":
        return reject(f"Only CLOSED cases can be reopened (status is {status})")
    if not state.get("reopen_photo_path"):
        return reject("A new photo is required to reopen a case")

    grace = timedelta(days=load_rules()["grace_period_days"])
    closed_at = datetime.fromisoformat(state["closed_at"])
    if now - closed_at > grace:
        return reject("Grace period has passed; submit a new case", "NEW_CASE")

    state["reopen_count"] = count + 1
    occurrence = state["reopen_count"] + 1
    category = (state.get("intake_result") or {}).get("category")
    esc = check_escalation(state["case_id"], state["unit_id"], category, occurrence)

    if esc["escalate"]:
        approval = request_extra_inspection(state["case_id"], esc["reasons"])
        state["current_status"] = "ESCALATION_PENDING"
        state["recurrence_result"] = _result(
            True, "Reopened and escalated for extra inspection", "ESCALATED",
            occurrence, esc["cluster_size"], esc["reasons"], approval.get("approval_id"))
    else:
        state["current_status"] = "REOPENED"
        state["recurrence_result"] = _result(
            True, "Reopened within grace period", "REOPENED", occurrence, esc["cluster_size"])
    return state
