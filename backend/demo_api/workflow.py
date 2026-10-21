"""Case workflow for the web app (routes.py): each action runs in one transaction on data/simephony.db.

Every database change goes through backend/tools.py, the one place with the business rules; the tools join
this request's transaction (tools.use_connection), so a failed step rolls the whole action back. This module
only orchestrates: it runs the agents (the LangGraph agents through ai_agents.py when USE_AI_AGENTS is on,
otherwise the rule-based stand-ins in agents.py) and sends the buyer / technician notifications.
"""
import json
import sqlite3

import tools

from . import agents, ai_agents, config
from .timeutil import add_days, demo_now, fmt_date, fmt_datetime, norm, parse

UPLOADS_DIR = tools.UPLOADS_DIR
signoff_deadline = tools.signoff_deadline


class WorkflowError(ValueError):
    """A request that can't be carried out (shown to the user)."""


# ---------- request context ----------


class Ctx:
    """Per-request view of the database: units, workers, bookings and the demo clock."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
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
    return result


def step(ctx: Ctx, case_id: str | None, agent: str, message: str) -> None:
    _tool(ctx, tools.log_agent_step, case_id, agent, message)


def notify_buyer(ctx: Ctx, case_id: str, kind: str, **extra) -> None:
    """CommsAgent stand-in: the template for this situation, posted in the app and emailed."""
    title, body = ai_agents.comms(ctx, kind, load_case(ctx, case_id), extra)
    _tool(ctx, tools.notify_buyer, case_id, title, body)


def notify_tech(ctx: Ctx, case_id: str, subject: str, body: str, worker_id: str | None = None) -> None:
    if worker_id or load_case(ctx, case_id).get("technician_id"):
        _tool(ctx, tools.notify_technician, case_id, subject, body, worker_id)


def _intake_json(result: dict) -> dict:
    """The intake stand-in's result in the AI Intake JSON shape that tools.save_intake_result stores."""
    return {k: result.get(k) for k in ("category", "sub_category", "location_in_unit", "summary", "urgency", "missing_info")} | {
        "follow_up_question": result.get("follow_up_question") or ""}


def _bookable(ctx: Ctx, slot: str | None) -> str | None:
    """The buyer's chosen time, if it can still be booked (it may have passed while they answered a question)."""
    return norm(slot) if slot and norm(slot) in agents.upcoming_slots(ctx.now) else None


# ---------- buyer ----------


def submit_report(ctx: Ctx, unit_id: str, buyer_id: str, description: str, photo: str | None, slot: str) -> dict:
    if not description.strip():
        raise WorkflowError("Please describe the problem.")
    if not ctx.conn.execute("SELECT 1 FROM buyers WHERE buyer_id = ? AND unit_id = ?", (buyer_id, unit_id)).fetchone():
        raise WorkflowError("Unknown buyer or unit.")
    result = ai_agents.intake(ctx, description, photo)
    if "non_defect" in result:
        return {"nonDefect": result["non_defect"]}
    case_id = _tool(ctx, tools.create_case, unit_id, buyer_id, description, slot, photo)["case_id"]
    status = _tool(ctx, tools.save_intake_result, case_id, _intake_json(result))["status"]
    c = load_case(ctx, case_id)
    step(ctx, case_id, "IntakeAgent", f"Category: {config.CATEGORY_LABEL.get(c['category'])} › {c['sub_category']}; location: {c['location_in_unit'] or 'missing'}; urgency: {c['urgency']}")
    if status == "INFO_NEEDED":
        step(ctx, case_id, "IntakeAgent", f"Missing info ({', '.join(result['missing_info'])}): asking a follow-up question")
        notify_buyer(ctx, case_id, "info_needed")
    else:
        _continue_new_case(ctx, case_id)
    return {"caseId": case_id}


def answer_follow_up(ctx: Ctx, case_id: str, answer: str, slot: str | None) -> None:
    description = _tool(ctx, tools.answer_follow_up, case_id, answer, None, slot)["description"]
    result = ai_agents.intake(ctx, description, None, bool(ctx.photo_kinds(case_id)), case_id)
    status = _tool(ctx, tools.save_intake_result, case_id, _intake_json(result))["status"]
    if status == "INFO_NEEDED":
        step(ctx, case_id, "IntakeAgent", "Still missing information")
        notify_buyer(ctx, case_id, "info_needed")
        return
    step(ctx, case_id, "IntakeAgent", f"Follow-up answered: location {load_case(ctx, case_id)['location_in_unit']}")
    _continue_new_case(ctx, case_id)


def _continue_new_case(ctx: Ctx, case_id: str) -> None:
    """SimilarDefectAgent then TriageAgent: link related cases and book the inspection visit, at the buyer's
    chosen time (kept in preferred_visit_at) if a technician is free then. On the 3rd occurrence in the unit
    or a stack cluster, SDP is also asked for an extra inspection; the visit still goes ahead (keep_status)."""
    c = load_case(ctx, case_id)
    sim = ai_agents.similar(ctx, c)
    _tool(ctx, tools.save_similar_cases, case_id, [{"related_case_id": r["case_id"], "reason": r["reason"]} for r in sim["refs"]], sim["occurrence"])
    step(ctx, case_id, "SimilarDefectAgent",
         f"Found {len(sim['refs'])} related case(s); recurrence_count={sim['occurrence']} in this unit; {len(sim['stack_units'])} other unit(s) in the stack"
         if sim["refs"] else "No related cases: treated as a new defect")
    if sim.get("cluster_reason") and sim["refs"]:
        step(ctx, case_id, "SimilarDefectAgent", sim["cluster_reason"])
    c = load_case(ctx, case_id)
    t = ai_agents.triage(ctx, c, _bookable(ctx, c["preferred_visit_at"]))
    _tool(ctx, tools.assign_technician, case_id, t["technician_id"], t["slot"], t["reason"])
    step(ctx, case_id, "TriageAgent", t["reason"])
    esc = _tool(ctx, tools.check_escalation, case_id)
    escalated = esc["should_escalate"] and not esc.get("pending_approval_id")
    if escalated:
        _tool(ctx, tools.request_extra_inspection, case_id, esc["reasons"], keep_status=True)
        step(ctx, case_id, "RecurrenceAgent", f"Repeat defect on a new report: extra inspection requested; visit kept. {' '.join(esc['reasons'])}")
    notify_buyer(ctx, case_id, "received", slot=fmt_datetime(t["slot"]), escalated=escalated)
    notify_tech(ctx, case_id, "New inspection visit: please accept",
                f"{c['unit_id']}: {c['summary']}. Inspection visit {fmt_datetime(t['slot'])}. Accept it in the app, or hand it over if you can't make it.")


def book_repair(ctx: Ctx, case_id: str, start: str) -> None:
    r = _tool(ctx, tools.book_repair, case_id, start)
    c = load_case(ctx, case_id)
    plan = config.REPAIR_PLAN.get(c["category"], config.REPAIR_PLAN["other"])
    w = ctx.worker(r["technician_id"])
    step(ctx, case_id, "TriageAgent", f"{plan['trade']} repair ({r['duration']}) allocated to {ctx.worker_label(r['technician_id'])}, "
         f"{'specialist subcontractor' if w['kind'] == 'subcontractor' else 'in-house technician'}, first available at {fmt_datetime(r['start'])}")
    notify_tech(ctx, case_id, "Repair booked: please accept", f"{c['unit_id']}: {c['summary']}. Repair {fmt_datetime(r['start'])}, estimated {r['duration']}.")
    notify_buyer(ctx, case_id, "repair_booked", slot=fmt_datetime(r["start"]), duration=r["duration"])


def submit_verification(ctx: Ctx, case_id: str, result: str, note: str, photo: str | None) -> None:
    r = _tool(ctx, tools.record_verification, case_id, result, note, photo)
    step(ctx, case_id, "VerificationAgent", f"Recorded result {result}{' with photo evidence' if photo else ''}")
    if result == "FIXED":
        c = load_case(ctx, case_id)
        notify_tech(ctx, case_id, "Buyer signed off your repair", f"{c['unit_id']}: {c['summary']}.")
        if r["status"] == "CLOSED":
            notify_buyer(ctx, case_id, "closed")
    elif result == "NOT_FIXED":
        _after_reopen(ctx, case_id, note or "Buyer verification failed: still not fixed")


def developer_signoff(ctx: Ctx, case_id: str) -> None:
    r = _tool(ctx, tools.record_signoff, case_id, "developer")
    if r["status"] == "CLOSED":
        notify_buyer(ctx, case_id, "closed")
    else:
        notify_buyer(ctx, case_id, "ready_signoff", deadline=fmt_date(signoff_deadline(load_case(ctx, case_id))))


def reopen_case(ctx: Ctx, case_id: str, description: str, photo: str | None) -> None:
    _tool(ctx, tools.reopen_case, case_id, description or "", photo or "")
    _after_reopen(ctx, case_id, description or "Problem came back")


def _after_reopen(ctx: Ctx, case_id: str, description: str) -> None:
    """RecurrenceAgent: escalate to SDP on the 3rd occurrence or a stack cluster, otherwise book a revisit."""
    c = load_case(ctx, case_id)
    notify_tech(ctx, case_id, "A case you repaired was reopened", f"{c['unit_id']}: {c['summary']}. Buyer says: {description}")
    notify_buyer(ctx, case_id, "reopened")

    esc = _tool(ctx, tools.check_escalation, case_id)
    _tool(ctx, tools.save_similar_cases, case_id, None, esc["occurrence_count"])
    step(ctx, case_id, "RecurrenceAgent", f"Occurrences in unit: {esc['occurrence_count']}; stack units affected: {esc['stack_unit_count']}")
    if esc["should_escalate"]:
        _tool(ctx, tools.request_extra_inspection, case_id, esc["reasons"])
        notify_buyer(ctx, case_id, "escalated")
    else:
        t = ai_agents.triage(ctx, load_case(ctx, case_id), None)
        _tool(ctx, tools.assign_technician, case_id, t["technician_id"], t["slot"], t["reason"])
        step(ctx, case_id, "TriageAgent", f"Below escalation threshold; revisit: {t['reason']}")
        notify_tech(ctx, case_id, "Revisit job", f"{c['unit_id']}: {c['summary']} came back. Visit {fmt_datetime(t['slot'])}.")
        notify_buyer(ctx, case_id, "revisit", slot=fmt_datetime(t["slot"]))


# ---------- technician / subcontractor ----------


def record_verdict(ctx: Ctx, case_id: str, outcome: str, note: str, photo: str | None) -> None:
    _tool(ctx, tools.record_verdict, case_id, outcome, note, photo)
    if outcome == "VALID":
        ai_agents.repair_estimate(ctx, load_case(ctx, case_id))  # saves repair_hours and its trace step (USE_AI_AGENTS)
    notify_buyer(ctx, case_id, "valid" if outcome == "VALID" else "invalid", note=note.strip())


def mark_repaired(ctx: Ctx, case_id: str, note: str, photo: str | None) -> None:
    _tool(ctx, tools.mark_repaired, case_id, note, photo)
    c = load_case(ctx, case_id)
    guide, photo_note = ai_agents.verification_guide(ctx, c)
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
        notify_tech(ctx, case_id, "Joint inspection moved", f"{before['unit_id']}: now {fmt_datetime(opt['start'])} with {ctx.worker(opt['technician_id'])['name']}.",
                    worker_id=support)
    notify_tech(ctx, case_id, "Job handed over to you: please accept",
                f"{before['unit_id']}: {before['summary']}. {job.capitalize()} {fmt_datetime(opt['start'])}, handed over by {prev}.")
    notify_buyer(ctx, case_id, "reassigned", job=job, previous=prev, slot=fmt_datetime(opt["start"]),
                 same_time=opt["same_time"], old_slot=fmt_datetime(r["start"]) if r["start"] else "")
    return {"technicianId": opt["technician_id"], "sameTime": opt["same_time"], "start": opt["start"]}


# ---------- SDP ----------


def decide_approval(ctx: Ctx, approval_id: str, approve: bool) -> None:
    case_id = _tool(ctx, tools.decide_approval, approval_id, approve)["case_id"]
    if not approve:
        if load_case(ctx, case_id)["status"] == "VALID":  # a new report's request leaves its visit as booked
            notify_buyer(ctx, case_id, "valid", note="Our team will repair this as a normal case")
        return
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
    notify_tech(ctx, case_id, "Extra inspection brief (you lead)", checklist)
    if sub:
        step(ctx, case_id, "TriageAgent", f"Joint inspection: {tech['name']} (in-house, lead) with {ctx.worker_label(sub['technician_id'])} "
             f"({config.REPAIR_PLAN.get(c['category'], config.REPAIR_PLAN['other'])['trade']} subcontractor)")
        notify_tech(ctx, case_id, f"Joint extra inspection with {tech['name']}", f"{fmt_datetime(t['slot'])} at {c['unit_id']}.\n\n{checklist}",
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
    for unit_id in ("A-13-08", "A-11-08"):
        if ctx.conn.execute("SELECT 1 FROM cases WHERE unit_id = ? AND status NOT IN ('CLOSED', 'INVALID')", (unit_id,)).fetchone():
            continue
        buyer = ctx.conn.execute("SELECT buyer_id FROM buyers WHERE unit_id = ?", (unit_id,)).fetchone()
        if not buyer:
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
