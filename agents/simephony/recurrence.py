from datetime import datetime, timedelta, timezone

from .backend_tools import request_extra_inspection
from .escalation import check_escalation
from .rules import load_rules


MYT = timezone(timedelta(hours=8))  # grace period counts calendar days in Malaysia time


def _myt_date(dt: datetime):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)  # naive timestamps are UTC
    return dt.astimezone(MYT).date()


def _result(accepted: bool, reason: str, action: str, occurrence: int,
            cluster_size: int = 0, reasons: list | None = None, approval_id: str | None = None,
            code: str | None = None, issue_id: str | None = None, error: str | None = None) -> dict:
    return {
        "accepted": accepted, "reason": reason, "occurrence": occurrence,
        "cluster_size": cluster_size, "escalation_reasons": reasons or [],
        "approval_id": approval_id, "action": action,
        "code": code,  # why a reopen was refused, for the buyer reply (comms REOPEN_REJECTED)
        "issue_id": issue_id,  # systemic issue the extra-inspection request is linked to (e.g. SI-002)
        "error": error,  # why escalation could not be checked or requested, for the trace
    }


def recurrence_node(state: dict, now: datetime | None = None) -> dict:
    """Reopen gate + escalation for a CLOSED case (CONTRACTS section 7, RecurrenceAgent rules)."""
    now = now or datetime.now(timezone.utc)
    count = state.get("reopen_count", 0)
    occurrence = count + 1
    status = state.get("current_status")

    def reject(reason: str, code: str, action: str = "REJECTED") -> dict:
        state["recurrence_result"] = _result(False, reason, action, occurrence, code=code)
        return state

    if status == "INVALID":
        return reject("INVALID cases cannot be reopened; submit a new report", "invalid_case")
    if status != "CLOSED":
        return reject(f"Only CLOSED cases can be reopened (status is {status})", "not_closed")
    if not state.get("reopen_photo_path"):
        return reject("A new photo is required to reopen a case", "no_photo")

    if not state.get("closed_at"):
        # Bad data on a CLOSED case: refuse this reopen instead of stopping the whole graph run.
        print(f"[RECURRENCE] Case {state.get('case_id')} is CLOSED but has no closed_at; reopen refused")
        return reject("closed_at required to reopen a CLOSED case", "no_closed_date")
    grace_days = load_rules()["grace_period_days"]
    closed_at = datetime.fromisoformat(state["closed_at"])
    if (_myt_date(now) - _myt_date(closed_at)).days > grace_days:
        return reject("Grace period has passed; submit a new case", "past_grace", "NEW_CASE")

    state["reopen_count"] = count + 1
    return _escalate_or_reopen(state, "Reopened within grace period")


def reopen_escalation_node(state: dict) -> dict:
    """Escalation check for a case the buyer's failed check already reopened (verification NOT_FIXED).
    The reopen is already counted in reopen_count, so there is no gate and no second increment."""
    return _escalate_or_reopen(state, "Reopened after the buyer's check failed")


def new_case_escalation_node(state: dict) -> dict:
    """A new report on its 3rd occurrence in the unit, or in a stack cluster: ask SDP for an extra inspection
    too, keeping the visit just booked (keep_status). If SDP approves, that visit becomes the detailed
    inspection; if SDP rejects, it simply goes ahead. Same rules as a reopen (escalation.check_escalation)."""
    result = {"escalated": False, "approval_id": None, "issue_id": None, "reasons": [], "error": None}
    case_id = state.get("case_id")
    if case_id and case_id != "C-NEW":
        esc = check_escalation(case_id, 0)
        result.update(reasons=esc["reasons"], error=esc.get("error"))
        if esc["escalate"]:
            try:
                approval = request_extra_inspection(case_id, esc["reasons"], keep_status=True)
            except Exception as e:
                approval = {"ok": False, "error": str(e)}
            if approval.get("ok") is False:
                print(f"[RECURRENCE] Extra inspection for new case {case_id} refused: {approval.get('error')}")
                result["error"] = approval.get("error")
            else:
                result.update(escalated=True, approval_id=approval.get("approval_id"), issue_id=approval.get("issue_id"))
    state["new_case_escalation"] = result
    return state


def _escalate_or_reopen(state: dict, reason: str) -> dict:
    esc = check_escalation(state["case_id"], state.get("reopen_count", 0))
    occurrence = esc["occurrence"]

    if esc["escalate"]:
        approval = request_extra_inspection(state["case_id"], esc["reasons"])
        if approval.get("ok") is not False:
            state["current_status"] = "ESCALATION_PENDING"
            state["recurrence_result"] = _result(
                True, "Reopened and escalated for extra inspection", "ESCALATED", occurrence, esc["cluster_size"],
                esc["reasons"], approval.get("approval_id"), issue_id=approval.get("issue_id"))
            return state
        # tools.py refused (e.g. the case changed status meanwhile): stay reopened, keep why for the trace
        print(f"[RECURRENCE] Extra inspection for {state['case_id']} refused: {approval.get('error')}")
        esc = {**esc, "error": approval.get("error")}

    state["current_status"] = "REOPENED"
    state["recurrence_result"] = _result(
        True, reason, "REOPENED", occurrence, esc["cluster_size"], esc["reasons"],
        esc.get("pending_approval_id"), error=esc.get("error"))
    return state
