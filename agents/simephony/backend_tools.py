"""The agents' door to backend/tools.py (xiaowen's tools, CONTRACTS.md section 2).

CONTRACTS: agents add backend/ to sys.path and call tools.py directly. Doing it here keeps that in one
place, and gives tests one module to patch. Write tools return {ok: false, error} instead of raising
when a business rule blocks the action, so callers check `ok`.
"""
import os
import sys

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if _BACKEND not in sys.path:
    sys.path.append(_BACKEND)

import tools  # noqa: E402


def save_intake_result(case_id: str, intake: dict) -> dict:
    """Store the intake JSON on the case (-> SUBMITTED, or INFO_NEEDED with a follow-up question)."""
    return tools.save_intake_result(case_id, intake)


def save_similar_cases(case_id: str, links: list[dict], occurrence_count: int | None = None) -> dict:
    """Store related cases [{related_case_id, reason, score}] on the case page (replaces earlier links)."""
    return tools.save_similar_cases(case_id, links, occurrence_count=occurrence_count)


def set_triage_result(case_id: str, urgency: str, reason: str) -> dict:
    """Save triage's urgency on the case before booking (SUBMITTED / REOPENED / INFO_NEEDED)."""
    return tools.set_triage_result(case_id, urgency, reason)


def check_escalation(case_id: str) -> dict:
    """Earlier same-unit cases, stack units, pending approval for a case in the DB."""
    return tools.check_escalation(case_id)


def request_extra_inspection(case_id: str, reasons: list[str], keep_status: bool = False) -> dict:
    """Ask SDP to approve an extra inspection (approval row, SDP email): a reopen -> ESCALATION_PENDING;
    keep_status=True (new report) leaves the booked visit as it is."""
    return tools.request_extra_inspection(case_id, reasons, keep_status=keep_status)


def get_verification_protocol(category: str) -> dict:
    """Safe post-repair checks for a category from rules.yaml verification_protocols: {matched, steps}."""
    return tools.get_verification_protocol(category)


def start_verification(case_id: str, guide: dict) -> dict:
    """Save the buyer's check guide {intro, steps, ifFails} (REPAIRED -> PENDING_SIGNOFF in the DB)."""
    return tools.start_verification(case_id, guide)


def notify_buyer(case_id: str, title: str, body: str) -> dict:
    """Post the update to the buyer's in-app inbox and email it (subject "[case_id] title", outbox logged).
    The buyer is found from the case. Returns {ok, message_id, email_status}."""
    return tools.notify_buyer(case_id, title, body)


def get_booking_options(case_id: str, kind: str = "visit") -> dict:
    """Visit times with free qualified technicians for this case (rejected technicians left out):
    {preferred, alternatives: [{start, start_local, technicians: [{technician_id, name}]}], no_availability}."""
    return tools.get_booking_options(case_id, kind)


def assign_technician(case_id: str, technician_id: str, start: str, reason: str, urgency: str | None = None) -> dict:
    """Book the visit with a technician (VISIT_SCHEDULED; EXTRA_INSPECTION stays), booking PENDING until they accept."""
    return tools.assign_technician(case_id, technician_id, start, reason, urgency)


def attach_inspection_brief(case_id: str, brief: dict) -> dict:
    """After SDP approves: save the technician's pre-inspection brief (-> EXTRA_INSPECTION)."""
    return tools.attach_inspection_brief(case_id, brief)


def send_email(to: str, subject: str, body: str, case_id: str | None = None) -> dict:
    """Email via Gmail SMTP (EMAIL_ENABLED); always logged in the outbox."""
    return tools.send_email(to, subject, body, case_id)


def get_signoff_info(case_id: str) -> dict:
    """What the buyer's sign-off message needs: the saved guide, whether SDP has signed, the buyer's deadline."""
    case = tools.get_case(case_id)
    if case.get("ok") is False:
        return case
    verification = case.get("verification") or {}
    return {"ok": True, "status": case["status"], "developer_signed": bool(case.get("developer_signed_at")),
            "deadline_local": tools.fmt_datetime(tools.signoff_deadline(case)), "guide": verification.get("protocol")}


def get_reassignment_options(case_id: str) -> dict:
    """After a hand-over: colleagues who can take the job, same time first. {job, options: [...]}."""
    return tools.get_reassignment_options(case_id)


def reassign_job(case_id: str, technician_id: str, start: str) -> dict:
    """Give a handed-over job to one of those colleagues (they still accept it; the case keeps its status)."""
    return tools.reassign_job(case_id, technician_id, start)


def escalate_booking(case_id: str, reason: str) -> dict:
    """Nobody free: booking NEEDS_STAFF, SDP emailed to book manually (case status unchanged)."""
    return tools.escalate_booking(case_id, reason)


def category_repair_hours(category: str) -> float:
    """The category's normal repair duration (web app REPAIR_PLAN), before any case-specific estimate."""
    return tools._repair_plan(category)["hours"]


def set_repair_estimate(case_id: str, hours: int, reason: str) -> dict:
    """Save the case's repair duration (2, 4 or 8 h) and why; repair slots and booking then use it."""
    return tools.set_repair_estimate(case_id, hours, reason)
