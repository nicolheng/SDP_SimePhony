"""Case workflow for the web app (routes.py): each action runs in one transaction on data/simephony.db.

Every database change goes through backend/tools.py, the one place with the business rules; the tools join
this request's transaction (tools.use_connection), so a failed step rolls the whole action back. API contexts
use rule-based stand-ins and queue enabled LangGraph agents for post-commit execution; direct workflow callers
can still run the agents inline. This module also sends buyer / technician notifications.
"""
import json
import logging
import sqlite3

import db
import tools

from . import agents, ai_agents, config
from .analytics import dlp_days_left, dlp_expiry
from .timeutil import add_days, demo_now, fmt_date, fmt_datetime, norm, parse

UPLOADS_DIR = tools.UPLOADS_DIR
signoff_deadline = tools.signoff_deadline
log = logging.getLogger("simephony.workflow")


class WorkflowError(ValueError):
    """A request that can't be carried out (shown to the user)."""


# ---------- request context ----------


class Ctx:
    """Per-request view of the database: units, workers, bookings and the demo clock."""

    def __init__(self, conn: sqlite3.Connection, defer_agents: bool = False):
        self.conn = conn
        self.defer_agents = defer_agents
        self.deferred_agent_steps: list[dict] = []
        self.deferred_rain_cases: list[str] = []
        self.deferred_calendar_cases: list[str] = []
        self.deferred_reports: list[str] = []
        self.deferred_answers: list[tuple[str, str]] = []  # (case_id, answer): agents run after the request (only mode)
        # USE_AI_AGENTS=only and a web click: buyer messages (CommsAgent) and the repair estimate run after the click
        # is saved, so the button doesn't wait for the model. Jobs: ("message", case_id, kind, extra) | ("estimate", case_id)
        # | ("extra_inspection", case_id, approval_id).
        self.after_click: list[tuple] = []
        from agents.simephony.llm_client import ai_only
        self.async_ai = defer_agents and ai_only() and ai_agents.enabled("comms")
        self.pending_agent_fallbacks: list[dict] = []
        self.pending_agent_telemetry: dict[str, dict] = {}
        row = conn.execute("SELECT value FROM app_meta WHERE key = 'clock_offset_days'").fetchone()
        self.offset_days = float(row["value"]) if row else 0.0
        self.now = demo_now(conn)
        self.units = {r["unit_id"]: dict(r) for r in conn.execute("SELECT * FROM units")}
        self.workers = [
            {**dict(r), "skills": json.loads(r["skills"]), "blocks": json.loads(r["blocks"]), "kind": r["kind"] or "technician"}
            for r in conn.execute("SELECT * FROM technicians")
        ]
        self._cases: list[dict] | None = None
        self._bookings: list[dict] | None = None

    # lookups
    def worker(self, worker_id: str | None) -> dict | None:
        return next((w for w in self.workers if w["technician_id"] == worker_id), None)

    def worker_label(self, worker_id: str | None) -> str:
        w = self.worker(worker_id)
        return "—" if not w else f"{w['name']} ({w['company']})" if w.get("company") else w["name"]

    def all_cases(self) -> list[dict]:
        if self._cases is None:
            self._cases = [
                {**dict(r), "created_at": norm(r["created_at"]), "closed_at": norm(r["closed_at"])}
                for r in self.conn.execute("SELECT case_id, unit_id, category, sub_category, status, summary, reopen_count, created_at, closed_at FROM cases")
            ]
        return self._cases

    def bookings(self) -> list[dict]:
        if self._bookings is None:
            self._bookings = [
                {"technician_id": r["technician_id"], "case_id": r["case_id"], "kind": r["kind"], "start": parse(r["start_at"]), "end": parse(r["end_at"])}
                # Finished jobs (visit_done / repair_done) are records only; they don't block anyone's time.
                for r in self.conn.execute("SELECT * FROM slots WHERE case_id IS NOT NULL AND kind NOT GLOB '*_done'")
            ]
        return self._bookings

    def photo_kinds(self, case_id: str) -> set[str]:
        return {r["kind"] for r in self.conn.execute("SELECT kind FROM case_photos WHERE case_id = ?", (case_id,))}

    def invalidate(self) -> None:
        self._cases = None
        self._bookings = None

    def defer_agent_step(self, name: str, **args) -> None:
        self.deferred_agent_steps.append({"name": name, **args})


# ---------- reads and the tools bridge ----------


def load_case(ctx: Ctx, case_id: str) -> dict:
    row = ctx.conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
    if not row:
        raise WorkflowError(f"Case {case_id} not found.")
    c = dict(row)
    for k in ("created_at", "closed_at", "verdict_at", "repaired_at", "buyer_signed_at", "developer_signed_at", "signoff_reminder_at", "auto_closed_at", "signoff_overdue_at", "handed_over_at", "handover_prev_slot", "preferred_visit_at"):
        c[k] = norm(c.get(k))
    return c


def latest_verification(ctx: Ctx, case_id: str) -> dict | None:
    r = ctx.conn.execute("SELECT * FROM verifications WHERE case_id = ? ORDER BY created_at DESC, verification_id DESC LIMIT 1", (case_id,)).fetchone()
    return dict(r) if r else None


def _tool(ctx: Ctx, fn, *args, **kwargs):
    """Call a tools.py function inside this request's transaction. A refused action ({ok: false}) becomes a
    WorkflowError, which routes.py shows to the user and rolls the whole request back."""
    with tools.use_connection(ctx.conn):
        result = fn(*args, **kwargs)
    ctx.invalidate()
    if isinstance(result, dict) and result.get("ok") is False:
        raise WorkflowError(result["error"])
    if fn in (tools.assign_technician, tools.book_repair, tools.reassign_job):
        case_id = args[0] if args else kwargs.get("case_id")
        if case_id:
            from calendar_service import is_configured

            if is_configured() and case_id not in ctx.deferred_calendar_cases:
                ctx.deferred_calendar_cases.append(case_id)
    return result


def step(ctx: Ctx, case_id: str | None, agent: str, message: str) -> None:
    telemetry = ctx.pending_agent_telemetry.pop(agent, None)
    _tool(ctx, tools.log_agent_step, case_id, agent, message, telemetry)


def notify_buyer(ctx: Ctx, case_id: str, kind: str, **extra) -> None:
    """CommsAgent stand-in: the template for this situation, posted in the app and emailed. On a web click in
    USE_AI_AGENTS=only it is queued instead and written right after the click is saved (run_after_click)."""
    if ctx.async_ai:
        ctx.after_click.append(("message", case_id, kind, extra))
        return
    title, body = ai_agents.comms(ctx, kind, load_case(ctx, case_id), extra)
    _tool(ctx, tools.notify_buyer, case_id, title, body)


def notify_tech(ctx: Ctx, case_id: str, subject: str, body: str, worker_id: str | None = None) -> None:
    if worker_id or load_case(ctx, case_id).get("technician_id"):
        _tool(ctx, tools.notify_technician, case_id, subject, body, worker_id)


ACCEPT_JOB = "Please accept the job in the app, or hand it over to a colleague if you can't make it."


def _defect(c: dict) -> str:
    """The technician email's defect line: "Defect: Ceiling leak (master bedroom ceiling), case C-0017." """
    where = f" ({c['location_in_unit']})" if c.get("location_in_unit") else ""
    return f"Defect: {c.get('summary') or config.CATEGORY_LABEL.get(c.get('category'), 'reported defect')}{where}, case {c['case_id']}."


def _intake_json(result: dict) -> dict:
    """The intake stand-in's result in the AI Intake JSON shape that tools.save_intake_result stores."""
    return {k: result.get(k) for k in ("category", "sub_category", "location_in_unit", "summary", "urgency", "missing_info")} | {
        "follow_up_question": result.get("follow_up_question") or ""}


def _bookable(ctx: Ctx, slot: str | None) -> str | None:
    """The buyer's chosen time, if it can still be booked (it may have passed while they answered a question)."""
    return norm(slot) if slot and norm(slot) in agents.upcoming_slots(ctx.now) else None


def _route_to_human_review(ctx: Ctx, case_id: str, decision: dict) -> None:
    _tool(
        ctx,
        tools.flag_case_for_human_review,
        case_id,
        decision.get("review_step", "AI agent"),
        decision.get("review_reason") or "AI abstained and routed the case to human review.",
        float(decision.get("confidence_score") or 0.0),
    )


# ---------- buyer ----------


def submit_report(ctx: Ctx, unit_id: str, buyer_id: str, description: str, photo: str | None, slot: str | None) -> dict:
    if not description.strip():
        raise WorkflowError("Please describe the problem.")
    if not ctx.conn.execute("SELECT 1 FROM buyers WHERE buyer_id = ? AND unit_id = ?", (buyer_id, unit_id)).fetchone():
        raise WorkflowError("Unknown buyer or unit.")
    left = dlp_days_left(ctx.units[unit_id].get("vp_date"), ctx.now)
    if left is not None and left < 0:
        raise WorkflowError(f"The defect liability period for {unit_id} ended on {fmt_date(dlp_expiry(ctx.units[unit_id]['vp_date']) + 'T12:00:00+08:00')}, "
                            "so new defects can no longer be reported here. Please contact the developer directly.")
    if ctx.defer_agents and ai_agents.ai_only():
        # USE_AI_AGENTS=only: save the report now and let the agents work after the request returns
        # (process_new_report), so the buyer's progress screen shows each step as it really finishes.
        non_defect = agents.intake(description, bool(photo)).get("non_defect")
        if non_defect:
            return {"nonDefect": non_defect}
        case_id = _tool(ctx, tools.create_case, unit_id, buyer_id, description, slot, photo)["case_id"]
        ctx.deferred_reports.append(case_id)
        return {"caseId": case_id}
    result = ai_agents.intake(ctx, description, photo)
    if "non_defect" in result:
        return {"nonDefect": result["non_defect"]}
    case_id = _tool(ctx, tools.create_case, unit_id, buyer_id, description, slot, photo)["case_id"]
    ai_agents.record_pending_fallbacks(ctx, case_id)
    if _save_intake(ctx, case_id, result):
        _continue_new_case(ctx, case_id)
    return {"caseId": case_id}


def _save_intake(ctx: Ctx, case_id: str, result: dict) -> bool:
    """Save IntakeAgent's result on a new report. True when the case goes on to booking; False when it waits for
    SDP review or for the buyer's answer to a follow-up question."""
    status = _tool(ctx, tools.save_intake_result, case_id, _intake_json(result))["status"]
    c = load_case(ctx, case_id)
    step(ctx, case_id, "IntakeAgent", f"Category: {config.CATEGORY_LABEL.get(c['category'])} › {c['sub_category']}; location: {c['location_in_unit'] or 'missing'}; urgency: {c['urgency']}")
    if result.get("needs_human_review"):
        _route_to_human_review(ctx, case_id, result)
        return False
    if status == "INFO_NEEDED":
        step(ctx, case_id, "IntakeAgent", f"Missing info ({', '.join(result['missing_info'])}): asking a follow-up question")
        notify_buyer(ctx, case_id, "info_needed")
        return False
    return True


def process_new_report(case_id: str, answer: str | None = None) -> None:
    """USE_AI_AGENTS=only: the agents for a report submit_report saved, run after that request has returned.
    IntakeAgent's result is committed on its own, then the booking and buyer message, then the related cases,
    so the progress screen (3-second refresh) sees each step end. SimilarDefectAgent comes last because only the
    case page shows its links: the buyer's visit is booked about 7 s sooner. If intake or booking fails, the case
    is held for SDP review with the error as the reason, instead of being left at Submitted.
    Buyer messages (CommsAgent) are written after each save, not inside it: one slow model call (40 s on a bad
    Gemini moment) must not hide a follow-up question or a booking the screen could already show. A failed
    message is noted in the case trace (run_after_click) and doesn't hold the case.
    answer: the buyer's answer to the follow-up question; it is taken as given (no second question)."""
    try:
        with db.get_conn() as conn:
            ctx = _messages_after_save(Ctx(conn))
            c = load_case(ctx, case_id)
            if c["status"] != "SUBMITTED":
                return
            result = ai_agents.intake(ctx, c["description"] or "", None, bool(ctx.photo_kinds(case_id)), case_id)
            if answer is not None:
                result = {**_accept_answer(result, answer), "needs_human_review": False}
            go_on = _save_intake(ctx, case_id, result)
            if answer is not None:
                step(ctx, case_id, "IntakeAgent", f"Follow-up answered: location {load_case(ctx, case_id)['location_in_unit'] or 'as described'}")
        run_after_click(list(ctx.after_click))  # intake is saved: e.g. "We need a little more information"
        if not go_on:
            return
        with db.get_conn() as conn:
            ctx = _messages_after_save(Ctx(conn))
            if load_case(ctx, case_id)["status"] != "SUBMITTED":
                return  # someone acted on the case meanwhile
            _book_new_case(ctx, case_id)
        run_after_click(list(ctx.after_click))  # the booking is saved: "We've received your report"
    except Exception as e:
        log.exception("AI agents could not finish new report %s", case_id)
        held = tools.flag_case_for_human_review(case_id, "AI agents", f"The AI agents could not finish this report: {e}", 0.0)
        if held.get("ok") is False:
            log.error("Could not hold report %s for review: %s", case_id, held.get("error"))
        return
    finally:
        _send_queued_emails(case_id)
    try:
        # The booking's calendar invitation (GOOGLE_CALENDAR_CREATE_EVENT): routes.py only sends the request's own
        for booked_case_id in ctx.deferred_calendar_cases:
            from calendar_service import create_booking_invitation

            create_booking_invitation(booked_case_id)
    except Exception:
        log.exception("Could not send the calendar invitation for report %s", case_id)
    try:
        with db.get_conn() as conn:
            ctx = Ctx(conn)
            if load_case(ctx, case_id)["status"] in ("CLOSED", "INVALID"):
                return
            _link_similar_cases(ctx, case_id)
    except Exception as e:
        # The visit is already booked: a failed link must not hold the case and release it.
        log.exception("SimilarDefectAgent could not link related cases for report %s", case_id)
        tools.log_agent_step(case_id, "SimilarDefectAgent", f"Could not link related cases: {e}")


def _messages_after_save(ctx: Ctx) -> Ctx:
    """Queue buyer messages on ctx.after_click (as a web click does in only mode) for run_after_click."""
    ctx.async_ai = True
    return ctx


def run_after_click(jobs: list[tuple]) -> None:
    """The AI work a click queued (Ctx.after_click), in order, each committed on its own so the buyer's inbox fills
    in as it goes. A failure is logged and shown in the case trace; it never undoes the click."""
    for job in jobs:
        case_id = job[1]
        try:
            with db.get_conn() as conn:
                ctx = Ctx(conn)
                if job[0] == "estimate":
                    ai_agents.repair_estimate(ctx, load_case(ctx, case_id))
                elif job[0] == "extra_inspection":
                    start_extra_inspection(ctx, case_id, job[2])
                elif job[0] == "repair_booking":
                    book_repair_now(ctx, case_id)
                else:
                    notify_buyer(ctx, case_id, job[2], **job[3])
        except Exception as e:
            log.exception("AI step after the click failed for %s: %s", case_id, job[0])
            try:
                with db.get_conn() as conn:
                    agent, what = {"estimate": ("RepairEstimateAgent", "repair estimate"),
                                   "repair_booking": ("TriageAgent", "repair booking"),
                                   "extra_inspection": ("InitialInspectionAgent", "inspection brief and booking")
                                   }.get(job[0], ("CommsAgent", f"buyer message ({job[2]})"))
                    step(Ctx(conn), case_id, agent, f"Could not finish the {what}: {type(e).__name__}: {str(e)[:200]}")
            except Exception:
                log.exception("Could not record the failed AI step for %s", case_id)
    if jobs:
        _send_queued_emails(jobs[0][1])


def _send_queued_emails(case_id: str) -> None:
    """Send the emails a background step queued: the request's own delivery ran before it."""
    try:
        tools.deliver_queued_emails()
    except Exception:
        log.exception("Could not send the emails queued for report %s", case_id)


def answer_follow_up(ctx: Ctx, case_id: str, answer: str, photo: str | None, slot: str | None) -> None:
    """The buyer answers once: their answer is taken as given (it fills what was missing) and the case moves on to
    booking, even if the IntakeAgent is still unsure. The technician's inspection visit checks the details."""
    if ctx.defer_agents and ai_agents.ai_only():
        # USE_AI_AGENTS=only: save the answer now; IntakeAgent and the booking run after the request returns
        # (process_new_report), so the Send button doesn't wait about 15 s for the models.
        _tool(ctx, tools.answer_follow_up, case_id, answer, photo, slot, resume=True)
        ctx.deferred_answers.append((case_id, answer))
        return
    description = _tool(ctx, tools.answer_follow_up, case_id, answer, photo, slot)["description"]
    result = _accept_answer(ai_agents.intake(ctx, description, None, bool(ctx.photo_kinds(case_id)), case_id), answer)
    _tool(ctx, tools.save_intake_result, case_id, _intake_json(result))
    unsure = " (IntakeAgent unsure; the inspection visit will confirm)" if result.get("needs_human_review") else ""
    step(ctx, case_id, "IntakeAgent", f"Follow-up answered: location {load_case(ctx, case_id)['location_in_unit'] or 'as described'}{unsure}")
    _continue_new_case(ctx, case_id)


def _accept_answer(result: dict, answer: str) -> dict:
    """Intake after a follow-up answer: whatever is still missing is taken from the answer, with no second question."""
    location = result.get("location_in_unit") or ""
    if not location and "location_in_unit" in (result.get("missing_info") or []):
        location = answer.strip().rstrip(".")[:80]
    summary = result.get("summary") or ""
    if location and not result.get("location_in_unit") and summary and " in " not in summary:
        summary = f"{summary} in {location.lower()}"
    return {**result, "location_in_unit": location, "summary": summary, "missing_info": [], "follow_up_question": None}


def _continue_new_case(ctx: Ctx, case_id: str, reviewed: bool = False) -> None:
    """SimilarDefectAgent then TriageAgent: link related cases and book the inspection visit."""
    _link_similar_cases(ctx, case_id)
    _book_new_case(ctx, case_id, reviewed)


def _link_similar_cases(ctx: Ctx, case_id: str) -> None:
    """SimilarDefectAgent: save the related cases shown on the case page. Escalation does not read these links:
    tools.check_escalation counts from the cases themselves, so booking can come first (process_new_report)."""
    c = load_case(ctx, case_id)
    sim = ai_agents.similar(ctx, c)
    _tool(ctx, tools.save_similar_cases, case_id, [{"related_case_id": r["case_id"], "reason": r["reason"]} for r in sim["refs"]], sim["occurrence"])
    step(ctx, case_id, "SimilarDefectAgent",
         f"Found {len(sim['refs'])} related case(s); recurrence_count={sim['occurrence']} in this unit; {len(sim['stack_units'])} other unit(s) in the stack"
         if sim["refs"] else "No related cases: treated as a new defect")
    if sim.get("cluster_reason") and sim["refs"]:
        step(ctx, case_id, "SimilarDefectAgent", sim["cluster_reason"])


def _book_new_case(ctx: Ctx, case_id: str, reviewed: bool = False) -> None:
    """TriageAgent: book the inspection visit, at the buyer's chosen time (kept in preferred_visit_at) if a
    technician is free then. On the 3rd occurrence in the unit or a stack cluster, SDP is also asked for an
    extra inspection; the visit still goes ahead (keep_status)."""
    c = load_case(ctx, case_id)
    preferred = _bookable(ctx, c["preferred_visit_at"])
    t = agents.triage(ctx, c, preferred) if reviewed else ai_agents.triage(ctx, c, preferred)
    if t.get("needs_human_review"):
        _route_to_human_review(ctx, case_id, t)
        return
    _tool(ctx, tools.assign_technician, case_id, t["technician_id"], t["slot"], t["reason"])
    step(ctx, case_id, "TriageAgent", t["reason"])
    esc = _tool(ctx, tools.check_escalation, case_id)
    escalated = esc["should_escalate"] and not esc.get("pending_approval_id")
    if escalated:
        _tool(ctx, tools.request_extra_inspection, case_id, esc["reasons"], keep_status=True)
        step(ctx, case_id, "RecurrenceAgent", f"Repeat defect on a new report: extra inspection requested; visit kept. {' '.join(esc['reasons'])}")
    notify_buyer(ctx, case_id, "received", slot=fmt_datetime(t["slot"]), escalated=escalated)
    repeat = "\n\nThis defect has been reported in the unit before, so SDP has also been asked to approve a detailed inspection." if escalated else ""
    notify_tech(ctx, case_id, "New inspection visit: please accept",
                f"You have a new inspection visit at {c['unit_id']} on {fmt_datetime(t['slot'])}.\n\n{_defect(c)} "
                f"Urgency: {c.get('urgency') or 'normal'}.{repeat}\n\n{ACCEPT_JOB}")


def book_repair(ctx: Ctx, case_id: str, start: str) -> None:
    r = _tool(ctx, tools.book_repair, case_id, start)
    c = load_case(ctx, case_id)
    plan = config.REPAIR_PLAN.get(c["category"], config.REPAIR_PLAN["other"])
    w = ctx.worker(r["technician_id"])
    step(ctx, case_id, "TriageAgent", f"{plan['trade']} repair ({r['duration']}) allocated to {ctx.worker_label(r['technician_id'])}, "
         f"{'specialist subcontractor' if w['kind'] == 'subcontractor' else 'in-house technician'}, first available at {fmt_datetime(r['start'])}")
    notify_tech(ctx, case_id, "Repair booked: please accept",
                f"A {plan['trade'].lower()} repair at {c['unit_id']} has been booked for you on {fmt_datetime(r['start'])}, "
                f"estimated {r['duration']}.\n\n{_defect(c)} The defect was confirmed as valid at the inspection visit.\n\n{ACCEPT_JOB}")
    notify_buyer(ctx, case_id, "repair_booked", slot=fmt_datetime(r["start"]), duration=r["duration"])


def book_repair_now(ctx: Ctx, case_id: str) -> None:
    """The buyer no longer picks a repair time (#79): once a defect is VALID, the repair is booked at the first time
    a qualified worker is free for the whole job; the worker still accepts or hands it over. Nobody free in the next
    2 weeks: SDP is asked to book it by hand (booking_status NEEDS_STAFF). On a web click in USE_AI_AGENTS=only it
    runs right after the click, behind the repair estimate whose hours it books."""
    if ctx.async_ai:
        ctx.after_click.append(("repair_booking", case_id))
        return
    if load_case(ctx, case_id)["status"] != "VALID":
        return  # someone acted on the case meanwhile
    options = _tool(ctx, tools.get_booking_options, case_id, "repair")["options"]
    if not options:
        _tool(ctx, tools.escalate_booking, case_id, "no qualified worker is free for the repair in the next 2 weeks")
        step(ctx, case_id, "TriageAgent", "No worker free for the repair in the next 2 weeks: flagged to SDP to book by hand")
        return
    book_repair(ctx, case_id, options[0]["start"])


def submit_verification(ctx: Ctx, case_id: str, result: str, note: str, photo: str | None) -> None:
    r = _tool(ctx, tools.record_verification, case_id, result, note, photo)
    step(ctx, case_id, "VerificationAgent", f"Recorded result {result}{' with photo evidence' if photo else ''}")
    if result == "FIXED":
        # Verified only; the case closes when the buyer signs off the whole unit
        c = load_case(ctx, case_id)
        notify_tech(ctx, case_id, "Buyer confirmed your repair",
                    f"The buyer at {c['unit_id']} has checked your repair and confirmed it is fixed.\n\n{_defect(c)}\n\n"
                    "No further action is needed from you. Thank you for the repair.")
    elif result == "NOT_FIXED":
        _after_reopen(ctx, case_id, note or "Buyer verification failed: still not fixed")


def rate_case(ctx: Ctx, case_id: str, rating: int, comment: str) -> None:
    _tool(ctx, tools.record_rating, case_id, rating, comment)


def rate_unit(ctx: Ctx, unit_id: str, rating: int, comment: str) -> None:
    """One rating for the buyer's latest unit sign-off (saved on each defect it closed)."""
    _tool(ctx, tools.record_unit_rating, unit_id, rating, comment)


def decide_review(ctx: Ctx, case_id: str, approve: bool, note: str) -> None:
    """SDP staff approve or reject a case an AI agent held for review. An approved case carries on from the held
    step with the rule-based agents (a person has checked it, so it is not held again)."""
    r = _tool(ctx, tools.resolve_review, case_id, approve, note)
    c = load_case(ctx, case_id)
    said = f': "{note}"' if note else "."
    if not approve:
        if r["status"] == "INVALID":
            _tool(ctx, tools.notify_buyer, case_id, "Update on your report",
                  f"Case {case_id} ({c['summary']}). Our team reviewed your report and it is not covered as a defect{said} "
                  "This case is now closed. If the problem changes, please submit a new report.")
        elif r["status"] == "CLOSED":
            _tool(ctx, tools.notify_buyer, case_id, "Update on your reopened case",
                  f"Case {case_id} ({c['summary']}). Our team reviewed your reopen request and the case stays closed{said} "
                  "Please contact us if you have any questions.")
        else:  # VALID: the repair is redone
            _tool(ctx, tools.notify_buyer, case_id, "Your repair needs another visit",
                  f"Case {case_id} ({c['summary']}). Our team checked the repair and it needs more work. "
                  "We're booking another repair and will send you the time.")
            book_repair_now(ctx, case_id)
        return
    if r["status"] == "SUBMITTED":
        _continue_new_case(ctx, case_id, reviewed=True)
    elif r["status"] == "REOPENED":
        esc = _tool(ctx, tools.check_escalation, case_id)
        if esc["should_escalate"] and not esc.get("pending_approval_id"):
            _tool(ctx, tools.request_extra_inspection, case_id, esc["reasons"])
            notify_buyer(ctx, case_id, "escalated")
        else:
            _book_revisit(ctx, case_id, agents.triage(ctx, c, None), esc["occurrence_count"], "Reopened after SDP review")
    elif r["status"] == "REPAIRED":
        guide = agents.verification_guide(c)
        _tool(ctx, tools.start_verification, case_id, guide)
        step(ctx, case_id, "VerificationAgent",
             f"Standard {config.CATEGORY_LABEL.get(c['category'], '').lower()} checklist after SDP review; {len(guide['steps'])} checks for the buyer")
        # SDP has just checked the repair photos, so approving the held check is the developer's sign-off:
        # the buyer can check and sign off straight away, without a second SDP click.
        developer_signoff(ctx, case_id)
    elif r["status"] == "VALID":
        _tool(ctx, tools.notify_buyer, case_id, "Your repair is being arranged",
              f"Case {case_id} ({c['summary']}). Our team has checked your case. We're booking the repair and will send you the time.")
        book_repair_now(ctx, case_id)


def developer_signoff(ctx: Ctx, case_id: str) -> None:
    """SDP approves one repair. The buyer can check it straight away; they sign off the unit (#71) once SDP has
    approved every open defect in it, so the sign-off deadline is only given in the last approval's message."""
    _tool(ctx, tools.record_signoff, case_id, "developer")
    unit = tools.unit_signoff_state(ctx.conn, load_case(ctx, case_id)["unit_id"])
    if unit["canVerify"]:
        notify_buyer(ctx, case_id, "ready_signoff", deadline=fmt_date(unit["deadline"]), count=len(unit["caseIds"]),
                     unit=unit["unitId"])
    else:  # the buyer can check this one now; the unit sign-off waits for the others
        notify_buyer(ctx, case_id, "ready_signoff", partial=True, unit=unit["unitId"])


def sign_off_unit(ctx: Ctx, unit_id: str, note: str) -> None:
    """Buyer signs off the whole unit once (#74): every defect in it closes together."""
    r = _tool(ctx, tools.sign_off_unit, unit_id, note)
    g = config.GRACE_PERIOD_DAYS
    cases = [load_case(ctx, cid) for cid in r["closed"]]
    listed = "\n".join(f"- {c['case_id']}: {c['summary']}" for c in cases)
    _tool(ctx, tools.notify_buyer, cases[0]["case_id"], "Unit signed off",
          f"You signed off unit {unit_id}, so {'these repairs are' if len(cases) > 1 else 'this repair is'} now closed:\n"
          f"{listed}\n\nIf a problem comes back, you can reopen it within {g} days with a new photo.")


def reject_repair(ctx: Ctx, case_id: str, note: str) -> None:
    """SDP won't sign off the repair (e.g. the photo check showed the fault is still there): a new repair is booked
    automatically and the technician is told why."""
    _tool(ctx, tools.reject_repair, case_id, note)
    c = load_case(ctx, case_id)
    reason = " ".join(note.split())
    _tool(ctx, tools.notify_buyer, case_id, "Your repair needs another visit",
          f"Case {case_id} ({c['summary']}). Our team checked the repair and it needs more work: \"{reason}\" "
          "We're booking another repair and will send you the time.")
    notify_tech(ctx, case_id, "Repair not accepted",
                f"SDP did not accept the repair at {c['unit_id']}.\n\n{_defect(c)}\n"
                f'Reason: "{reason}"\n\nA new repair is being booked; you will be emailed if you are assigned.')
    book_repair_now(ctx, case_id)


def reopen_case(ctx: Ctx, case_id: str, description: str, photo: str | None) -> None:
    _tool(ctx, tools.reopen_case, case_id, description or "", photo or "")
    _after_reopen(ctx, case_id, description or "Problem came back")


def _after_reopen(ctx: Ctx, case_id: str, description: str) -> None:
    """RecurrenceAgent: escalate to SDP on the 3rd occurrence or a stack cluster, otherwise book a revisit."""
    c = load_case(ctx, case_id)
    notify_tech(ctx, case_id, "A case you repaired was reopened",
                f"The buyer at {c['unit_id']} has reopened a case you repaired.\n\n{_defect(c)}\n"
                f'Buyer says: "{description}"\n\n'
                "No action is needed yet. A revisit will be booked, or SDP will arrange a detailed inspection, and you will be emailed if you are assigned.")
    notify_buyer(ctx, case_id, "reopened")

    esc = _tool(ctx, tools.check_escalation, case_id)
    _tool(ctx, tools.save_similar_cases, case_id, None, esc["occurrence_count"])
    step(ctx, case_id, "RecurrenceAgent", f"Occurrences in unit: {esc['occurrence_count']}; stack units affected: {esc['stack_unit_count']}")
    if esc["should_escalate"]:
        _tool(ctx, tools.request_extra_inspection, case_id, esc["reasons"])
        notify_buyer(ctx, case_id, "escalated")
    else:
        t = ai_agents.triage(ctx, load_case(ctx, case_id), None)
        if t.get("needs_human_review"):
            _route_to_human_review(ctx, case_id, t)
            return
        _book_revisit(ctx, case_id, t, esc["occurrence_count"], description)


def _book_revisit(ctx: Ctx, case_id: str, t: dict, occurrence: int, description: str) -> None:
    c = load_case(ctx, case_id)
    _tool(ctx, tools.assign_technician, case_id, t["technician_id"], t["slot"], t["reason"])
    step(ctx, case_id, "TriageAgent", f"Below escalation threshold; revisit: {t['reason']}")
    notify_tech(ctx, case_id, "Revisit job",
                f"A repaired defect at {c['unit_id']} has come back, and a revisit is booked for you on {fmt_datetime(t['slot'])}.\n\n"
                f"{_defect(c)} This is occurrence {occurrence} of this defect in the unit, "
                f'so please find the root cause. Buyer says: "{description}"\n\n{ACCEPT_JOB}')
    notify_buyer(ctx, case_id, "revisit", slot=fmt_datetime(t["slot"]))


# ---------- technician / subcontractor ----------


def record_verdict(ctx: Ctx, case_id: str, outcome: str, note: str, photo: str | None, repair_hours: float | None = None) -> None:
    _tool(ctx, tools.record_verdict, case_id, outcome, note, photo, repair_hours)
    # The technician chose the expected repair duration: no RepairEstimateAgent run.
    if outcome == "VALID" and repair_hours is None:
        if ctx.async_ai:  # after the click, before the "please book a repair" message that quotes the hours
            ctx.after_click.append(("estimate", case_id))
        else:
            ai_agents.repair_estimate(ctx, load_case(ctx, case_id))  # saves repair_hours and its trace step (USE_AI_AGENTS)
    notify_buyer(ctx, case_id, "valid" if outcome == "VALID" else "invalid", note=note.strip())
    if outcome == "VALID":
        book_repair_now(ctx, case_id)


def mark_repaired(ctx: Ctx, case_id: str, note: str, photo: str | None) -> None:
    _tool(ctx, tools.mark_repaired, case_id, note, photo)
    c = load_case(ctx, case_id)
    guide, photo_note, review = ai_agents.verification_guide(ctx, c)
    if review and review.get("needs_human_review"):
        _route_to_human_review(ctx, case_id, review)
        return
    if guide is None:
        raise WorkflowError(f"Verification guide unavailable for case {case_id}.")
    _tool(ctx, tools.start_verification, case_id, guide)
    if photo_note:
        step(ctx, case_id, "VerificationAgent", photo_note)
    step(ctx, case_id, "VerificationAgent", f"Retrieved {config.CATEGORY_LABEL.get(c['category'], '').lower()} protocol; {len(guide['steps'])} case-specific checks for the buyer")
    notify_buyer(ctx, case_id, "verify")


def accept_job(ctx: Ctx, case_id: str, worker_id: str) -> None:
    r = _tool(ctx, tools.respond_to_assignment, case_id, True, "", worker_id)
    notify_buyer(ctx, case_id, "confirmed", job=r["job"], slot=fmt_datetime(r["start"]) if r["start"] else "the booked time")


def hand_over(ctx: Ctx, case_id: str, worker_id: str, reason: str) -> dict:
    """The assigned worker can't make it (declined, or an emergency after accepting): the TriageAgent moves the job to the
    next available colleague, keeping the time if someone is free then, otherwise at the earliest free time."""
    before = load_case(ctx, case_id)
    r = _tool(ctx, tools.respond_to_assignment, case_id, False, reason, worker_id)
    if not r["handover_options"]:
        raise WorkflowError("No other qualified technician is free in the next 2 weeks. Please contact the SDP office.")
    opt = r["handover_options"][0]
    _tool(ctx, tools.reassign_job, case_id, opt["technician_id"], opt["start"])
    step(ctx, case_id, "TriageAgent", f"Hand-over: assigned next available colleague, {ctx.worker_label(opt['technician_id'])}")

    job, prev = r["job"], ctx.worker(worker_id)["name"]
    support = before.get("support_id")
    if before["status"] == "EXTRA_INSPECTION" and support and not opt["same_time"]:
        notify_tech(ctx, case_id, "Joint inspection moved",
                    f"The joint detailed inspection at {before['unit_id']} has moved to {fmt_datetime(opt['start'])}, "
                    f"because {prev} can't make it. It will now be led by {ctx.worker_label(opt['technician_id'])}.\n\n"
                    f"{_defect(before)}\n\nPlease make sure you are free at the new time.", worker_id=support)
    when = "at the same time" if opt["same_time"] else "at a new time"
    notify_tech(ctx, case_id, "Job handed over to you: please accept",
                f"{prev} can't make it, so a {job} at {before['unit_id']} has been handed over to you, {when}: "
                f"{fmt_datetime(opt['start'])}.\n\n{_defect(before)}\n\n{ACCEPT_JOB}")
    notify_buyer(ctx, case_id, "reassigned", job=job, previous=prev, slot=fmt_datetime(opt["start"]),
                 same_time=opt["same_time"], old_slot=fmt_datetime(r["start"]) if r["start"] else "")
    return {"technicianId": opt["technician_id"], "sameTime": opt["same_time"], "start": opt["start"]}


# ---------- SDP ----------


def decide_approval(ctx: Ctx, approval_id: str, approve: bool) -> None:
    case_id = _tool(ctx, tools.decide_approval, approval_id, approve)["case_id"]
    if not approve:
        if load_case(ctx, case_id)["status"] == "VALID":  # a new report's request leaves its visit as booked
            notify_buyer(ctx, case_id, "valid", note="Our team will repair this as a normal case")
            book_repair_now(ctx, case_id)
        return
    if ctx.async_ai:  # the brief (about 12 s of model time) and the booking run right after the click
        ctx.after_click.append(("extra_inspection", case_id, approval_id))
        return
    start_extra_inspection(ctx, case_id, approval_id)


def retry_extra_inspection(ctx: Ctx, approval_id: str) -> None:
    """SDP's "Try again" when the brief or booking failed after an approval (e.g. Ollama was down)."""
    a = ctx.conn.execute("SELECT case_id, status, decided_at FROM approvals WHERE approval_id = ?", (approval_id,)).fetchone()
    if a is None or a["status"] != "approved":
        raise WorkflowError("This extra inspection hasn't been approved.")
    b = ctx.conn.execute("SELECT created_at FROM inspection_briefs WHERE case_id = ?", (a["case_id"],)).fetchone()
    if b and a["decided_at"] and b["created_at"] >= a["decided_at"]:
        raise WorkflowError("The inspection brief is already ready.")
    if ctx.async_ai:
        ctx.after_click.append(("extra_inspection", a["case_id"], approval_id))
    else:
        start_extra_inspection(ctx, a["case_id"], approval_id)


def start_extra_inspection(ctx: Ctx, case_id: str, approval_id: str) -> None:
    """After SDP approves: InitialInspectionAgent writes the brief, TriageAgent books the joint inspection, and the
    technicians and buyer are told."""
    c = load_case(ctx, case_id)
    brief = ai_agents.initial_inspection(ctx, c, c.get("verdict_note"), latest_verification(ctx, case_id))
    _tool(ctx, tools.attach_inspection_brief, case_id, brief)

    # InitialInspectionAgent's brief is attached; TriageAgent books the joint inspection.
    c = load_case(ctx, case_id)
    t = ai_agents.triage(ctx, c, None)
    sub = agents.subcontractor_for(ctx, c)
    if sub and agents.busy(ctx, sub["technician_id"], t["slot"]):
        sub = None  # the subcontractor isn't free then; the in-house technician inspects alone
    _tool(ctx, tools.assign_technician, case_id, t["technician_id"], t["slot"], t["reason"], None, sub["technician_id"] if sub else None)
    tech = ctx.worker(t["technician_id"])
    checklist = "\n".join(f"{i + 1}. {x}" for i, x in enumerate(brief["checklist"]))
    row = ctx.conn.execute("SELECT reasons FROM approvals WHERE approval_id = ?", (approval_id,)).fetchone()
    why = " ".join(json.loads(row["reasons"] or "[]")) if row else ""
    why = f"SDP approved this detailed inspection. {why}".strip()
    partner = f", together with {ctx.worker_label(sub['technician_id'])}" if sub else ""
    notify_tech(ctx, case_id, "Extra inspection brief (you lead)",
                f"You are leading a detailed inspection at {c['unit_id']} on {fmt_datetime(t['slot'])}{partner}.\n\n"
                f"{_defect(c)}\n{why}\n\nPlease complete this checklist on site, then record the result in the app:\n{checklist}")
    if sub:
        step(ctx, case_id, "TriageAgent", f"Joint inspection: {tech['name']} (in-house, lead) with {ctx.worker_label(sub['technician_id'])} "
             f"({config.REPAIR_PLAN.get(c['category'], config.REPAIR_PLAN['other'])['trade']} subcontractor)")
        notify_tech(ctx, case_id, f"Joint extra inspection with {tech['name']}",
                    f"You are joining a detailed inspection at {c['unit_id']} on {fmt_datetime(t['slot'])}, "
                    f"led by {tech['name']} (in-house technician), who records the result.\n\n"
                    f"{_defect(c)}\n{why}\n\nChecklist for the visit:\n{checklist}",
                    worker_id=sub["technician_id"])
    notify_buyer(ctx, case_id, "extra_inspection", slot=fmt_datetime(t["slot"]))


# ---------- time rules & demo controls ----------


def sweep_signoffs(ctx: Ctx) -> None:
    """Buyer sign-off period: reminder, then auto-close or flag to SDP (tools.sweep_signoffs). Runs on every request."""
    _tool(ctx, tools.sweep_signoffs)


def skip_days(ctx: Ctx, days: float) -> None:
    """Demo control: move the demo clock forward, then apply the time rules."""
    ctx.offset_days += days
    ctx.now = add_days(ctx.now, days)
    ctx.conn.execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('clock_offset_days', ?)", (str(ctx.offset_days),))
    step(ctx, None, "DemoClock", f"Demo clock moved forward {days:g} days")
    sweep_signoffs(ctx)


def simulate_rain(ctx: Ctx) -> None:
    """Demo control: heavy rain brings new ceiling-leak reports from two units in stack A-08."""
    text = "Heavy rain last night, ceiling in master bedroom leaking again"
    use_ai = any(ai_agents.enabled(name) for name in ("intake", "similar", "triage"))
    for unit_id in ("A-13-08", "A-11-08"):
        if ctx.conn.execute("SELECT 1 FROM cases WHERE unit_id = ? AND status NOT IN ('CLOSED', 'INVALID')", (unit_id,)).fetchone():
            continue
        buyer = ctx.conn.execute("SELECT buyer_id FROM buyers WHERE unit_id = ?", (unit_id,)).fetchone()
        if not buyer:
            continue
        if ctx.defer_agents and use_ai:
            case_id = _tool(ctx, tools.create_case, unit_id, buyer["buyer_id"], text)["case_id"]
            step(ctx, case_id, "RainSimulator", f"Rain report saved for {unit_id}; AI intake, recurrence, and triage queued")
            ctx.deferred_rain_cases.append(case_id)
            continue
        r = agents.intake(text, True)
        case_id = _tool(ctx, tools.create_case, unit_id, buyer["buyer_id"], text)["case_id"]
        _tool(ctx, tools.save_intake_result, case_id, _intake_json({**r, "missing_info": [], "follow_up_question": ""}))
        step(ctx, case_id, "IntakeAgent", f"Rain: new report from {unit_id}")
        c = load_case(ctx, case_id)
        sim = agents.similar(ctx, c)
        _tool(ctx, tools.save_similar_cases, case_id, [{"related_case_id": x["case_id"], "reason": x["reason"]} for x in sim["refs"]], sim["occurrence"])
        step(ctx, case_id, "SimilarDefectAgent", f"Linked to {len(sim['refs'])} related case(s) in stack A-08")
        t = agents.triage(ctx, load_case(ctx, case_id), None)
        _tool(ctx, tools.assign_technician, case_id, t["technician_id"], t["slot"], t["reason"])
        step(ctx, case_id, "TriageAgent", t["reason"])


def process_rain_agents(case_id: str) -> None:
    """Apply enabled AI decisions to a rain report, committing each step for clients' periodic refresh."""
    try:
        with db.get_conn() as conn:
            ctx = Ctx(conn)
            case = load_case(ctx, case_id)
            if case["status"] != "SUBMITTED":
                return

            result = ai_agents.intake(ctx, case["description"] or "", None, True, case_id)
            intake_data = {**result, "missing_info": [], "follow_up_question": ""}
            _tool(ctx, tools.save_intake_result, case_id, _intake_json(intake_data))
            c = load_case(ctx, case_id)
            step(ctx, case_id, "IntakeAgent", f"AI intake: {config.CATEGORY_LABEL.get(c['category'], c['category'])} in {c['location_in_unit'] or 'reported location'}")
        with db.get_conn() as conn:
            ctx = Ctx(conn)
            case = load_case(ctx, case_id)
            if case["status"] != "SUBMITTED":
                return

            sim = ai_agents.similar(ctx, case)
            _tool(ctx, tools.save_similar_cases, case_id,
                  [{"related_case_id": item["case_id"], "reason": item["reason"]} for item in sim["refs"]],
                  sim["occurrence"])
            step(ctx, case_id, "SimilarDefectAgent",
                 f"Linked to {len(sim['refs'])} related case(s); recurrence_count={sim['occurrence']}")
        with db.get_conn() as conn:
            ctx = Ctx(conn)
            case = load_case(ctx, case_id)
            if case["status"] != "SUBMITTED":
                return

            triage_result = ai_agents.triage(ctx, case, None)
            _tool(ctx, tools.assign_technician, case_id, triage_result["technician_id"],
                  triage_result["slot"], triage_result["reason"])
            step(ctx, case_id, "TriageAgent", triage_result["reason"])
        for booked_case_id in ctx.deferred_calendar_cases:
            from calendar_service import create_booking_invitation

            create_booking_invitation(booked_case_id)
    except Exception:
        log.exception("Could not complete the AI workflow for rain report %s", case_id)
