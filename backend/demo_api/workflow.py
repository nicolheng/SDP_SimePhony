"""Case workflow: each action reads and writes data/simephony.db in one transaction."""
import base64
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import db

from . import agents, config
from .timeutil import add_days, days_between, fmt_datetime, iso, norm, parse

UPLOADS_DIR = db.ROOT / "uploads"


class WorkflowError(ValueError):
    """A request that can't be carried out (shown to the user)."""


# ---------- request context ----------


class Ctx:
    """Per-request view of the database: units, workers, bookings and the demo clock."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        # Real Malaysia-time clock (stored as UTC), plus however many days the demo has skipped ahead.
        row = conn.execute("SELECT value FROM app_meta WHERE key = 'clock_offset_days'").fetchone()
        self.offset_days = float(row["value"]) if row else 0.0
        self.now = add_days(iso(datetime.now(timezone.utc)), self.offset_days)
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
                for r in self.conn.execute("SELECT * FROM slots WHERE case_id IS NOT NULL")
            ]
        return self._bookings

    def photo_kinds(self, case_id: str) -> set[str]:
        return {r["kind"] for r in self.conn.execute("SELECT kind FROM case_photos WHERE case_id = ?", (case_id,))}

    def invalidate(self) -> None:
        self._cases = None
        self._bookings = None


# ---------- row helpers ----------


def load_case(ctx: Ctx, case_id: str) -> dict:
    row = ctx.conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
    if not row:
        raise WorkflowError(f"Case {case_id} not found.")
    c = dict(row)
    for k in ("created_at", "closed_at", "verdict_at", "repaired_at", "buyer_signed_at", "developer_signed_at", "signoff_reminder_at", "auto_closed_at", "signoff_overdue_at", "handed_over_at", "handover_prev_slot"):
        c[k] = norm(c.get(k))
    return c


SAVED_COLUMNS = [
    "status", "category", "sub_category", "location_in_unit", "summary", "description", "urgency", "missing_info", "follow_up_question",
    "occurrence_count", "triage_reason", "verdict_note", "verdict_at", "repair_note", "repaired_at", "technician_id", "reopen_count",
    "developer_signed", "buyer_signed", "buyer_signed_at", "buyer_signoff_note", "developer_signed_at", "developer_signed_by",
    "verification_status", "inspection_outcome", "closed_at", "inspector_id", "support_id", "repair_hours",
    "signoff_reminder_at", "auto_closed_at", "signoff_overdue_at", "booking_status",
    "handed_over_from", "handover_reason", "handed_over_at", "handover_prev_slot",
]


def assign(c: dict, worker_id: str) -> None:
    """Give the case's next job to a worker; they still have to accept it."""
    c.update(technician_id=worker_id, booking_status="PENDING", handed_over_from=None, handover_reason=None, handed_over_at=None, handover_prev_slot=None)


def save_case(ctx: Ctx, c: dict) -> None:
    sets = ", ".join(f"{k} = ?" for k in SAVED_COLUMNS)
    ctx.conn.execute(f"UPDATE cases SET {sets} WHERE case_id = ?", [c.get(k) for k in SAVED_COLUMNS] + [c["case_id"]])
    ctx.invalidate()


def next_id(ctx: Ctx, table: str, column: str, prefix: str, width: int) -> str:
    rows = ctx.conn.execute(f"SELECT {column} AS v FROM {table} WHERE {column} LIKE ?", (f"{prefix}-%",)).fetchall()
    n = max((int(m.group(1)) for r in rows if (m := re.match(rf"{prefix}-(\d+)$", r["v"]))), default=0)
    return f"{prefix}-{n + 1:0{width}d}"


def event(ctx: Ctx, case_id: str | None, type_: str, message: str, agent: str | None = None, **payload) -> None:
    body = {"message": message, **({"agent": agent} if agent else {}), **payload}
    ctx.conn.execute(
        "INSERT INTO case_events (event_id, case_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        (db.next_record_id(ctx.conn, "case_events"), case_id, type_, json.dumps(body), ctx.now),
    )


def step(ctx: Ctx, case_id: str, agent: str, message: str) -> None:
    event(ctx, case_id, "agent.step", message, agent=agent)


def email(ctx: Ctx, case_id: str | None, to: str, subject: str, body: str) -> None:
    # Gmail SMTP isn't wired yet (P3's send_email), so every email is logged to the outbox, not sent.
    ctx.conn.execute(
        "INSERT INTO outbox (email_id, case_id, to_addr, subject, body, status, error, created_at) VALUES (?, ?, ?, ?, ?, 'logged, not sent', NULL, ?)",
        (db.next_record_id(ctx.conn, "outbox"), case_id, to, subject, body, ctx.now),
    )
    event(ctx, case_id, "email.sent", f"📧 Email to {to}: {subject}", to=to, subject=subject)


def buyer_message(ctx: Ctx, case_id: str, title: str, body: str) -> None:
    ctx.conn.execute(
        "INSERT INTO buyer_messages (message_id, case_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
        (db.next_record_id(ctx.conn, "buyer_messages"), case_id, title, body, ctx.now),
    )


def notify_buyer(ctx: Ctx, c: dict, kind: str, **extra) -> None:
    title, body = agents.comms(ctx, kind, c, extra)
    buyer_message(ctx, c["case_id"], title, body)
    step(ctx, c["case_id"], "CommsAgent", f'Drafted buyer update "{title}" (passed liability guardrail)')
    buyer = ctx.conn.execute("SELECT email FROM buyers WHERE buyer_id = ?", (c["buyer_id"],)).fetchone()
    if buyer:
        email(ctx, c["case_id"], buyer["email"], f"[{c['case_id']}] {title}", body)


def notify_tech(ctx: Ctx, c: dict, subject: str, body: str, worker_id: str | None = None) -> None:
    w = ctx.worker(worker_id or c.get("technician_id"))
    if w:
        email(ctx, c["case_id"], w["email"], f"[{c['case_id']}] {subject}", body)


def book(ctx: Ctx, case_id: str, worker_id: str, start: str, kind: str) -> None:
    ctx.conn.execute(
        "INSERT INTO slots (slot_id, technician_id, start_at, end_at, case_id, kind) VALUES (?, ?, ?, ?, ?, ?)",
        (next_id(ctx, "slots", "slot_id", "S", 4), worker_id, start, add_days(start, config.SLOT_HOURS / 24), case_id, kind),
    )
    ctx.invalidate()


def release(ctx: Ctx, case_id: str, kind: str) -> None:
    ctx.conn.execute("UPDATE slots SET case_id = NULL, kind = NULL WHERE case_id = ? AND kind = ?", (case_id, kind))
    ctx.invalidate()


def add_photo(ctx: Ctx, case_id: str, data_url: str | None, kind: str) -> None:
    """Save a data-URL photo into uploads/ and record it."""
    if not data_url:
        return
    m = re.match(r"data:image/(png|jpe?g|webp);base64,(.+)$", data_url, re.S)
    if not m:
        raise WorkflowError("Photos must be JPG, PNG or WebP images.")
    raw = base64.b64decode(m.group(2))
    if len(raw) > 15 * 1024 * 1024:
        raise WorkflowError("That photo is too large (max 15 MB).")
    photo_id = db.next_record_id(ctx.conn, "case_photos")
    name = f"{case_id}_{photo_id}_{kind}.{'png' if m.group(1) == 'png' else 'jpg'}"
    UPLOADS_DIR.mkdir(exist_ok=True)
    (UPLOADS_DIR / name).write_bytes(raw)
    ctx.conn.execute("INSERT INTO case_photos (photo_id, case_id, path, kind, created_at) VALUES (?, ?, ?, ?, ?)", (photo_id, case_id, name, kind, ctx.now))


def save_links(ctx: Ctx, case_id: str, refs: list[dict]) -> None:
    ctx.conn.execute("DELETE FROM case_links WHERE case_id = ?", (case_id,))
    for r in refs:
        ctx.conn.execute("INSERT INTO case_links (case_id, related_case_id, reason, score, created_at) VALUES (?, ?, ?, NULL, ?)", (case_id, r["case_id"], r["reason"], ctx.now))


def latest_verification(ctx: Ctx, case_id: str) -> dict | None:
    r = ctx.conn.execute("SELECT * FROM verifications WHERE case_id = ? ORDER BY created_at DESC, verification_id DESC LIMIT 1", (case_id,)).fetchone()
    return dict(r) if r else None


# ---------- buyer ----------


def submit_report(ctx: Ctx, unit_id: str, buyer_id: str, description: str, photo: str | None, slot: str) -> dict:
    if not description.strip():
        raise WorkflowError("Please describe the problem.")
    if not ctx.conn.execute("SELECT 1 FROM buyers WHERE buyer_id = ? AND unit_id = ?", (buyer_id, unit_id)).fetchone():
        raise WorkflowError("Unknown buyer or unit.")
    result = agents.intake(description, bool(photo))
    if "non_defect" in result:
        return {"nonDefect": result["non_defect"]}

    case_id = next_id(ctx, "cases", "case_id", "C", 4)
    ctx.conn.execute(
        """INSERT INTO cases (case_id, unit_id, buyer_id, status, category, sub_category, location_in_unit, summary, description, urgency,
           missing_info, follow_up_question, occurrence_count, reopen_count, created_at)
           VALUES (?, ?, ?, 'SUBMITTED', ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)""",
        (case_id, unit_id, buyer_id, result["category"], result["sub_category"], result["location_in_unit"], result["summary"], description.strip(),
         result["urgency"], json.dumps(result["missing_info"]), result["follow_up_question"], ctx.now),
    )
    ctx.invalidate()
    add_photo(ctx, case_id, photo, "original")
    event(ctx, case_id, "case.created", "Buyer submitted a defect report with photo", summary=result["summary"], category=result["category"])
    c = load_case(ctx, case_id)
    step(ctx, case_id, "IntakeAgent", f"Category: {config.CATEGORY_LABEL.get(c['category'])} › {c['sub_category']}; location: {c['location_in_unit'] or 'missing'}; urgency: {c['urgency']}")
    if c["follow_up_question"]:
        c["status"] = "INFO_NEEDED"
        save_case(ctx, c)
        step(ctx, case_id, "IntakeAgent", f"Missing info ({', '.join(result['missing_info'])}): asking a follow-up question")
        event(ctx, case_id, "case.info_needed", c["follow_up_question"])
        notify_buyer(ctx, c, "info_needed")
    else:
        _continue_new_case(ctx, c, slot)
    return {"caseId": case_id}


def answer_follow_up(ctx: Ctx, case_id: str, answer: str, slot: str | None) -> None:
    c = load_case(ctx, case_id)
    if c["status"] != "INFO_NEEDED":
        raise WorkflowError("This case isn't waiting for more information.")
    c["description"] = f"{c['description']}\n{answer.strip()}"
    result = agents.intake(c["description"], bool(ctx.photo_kinds(case_id)))
    for k in ("category", "sub_category", "location_in_unit", "summary", "urgency", "follow_up_question"):
        c[k] = result.get(k)
    c["missing_info"] = json.dumps(result.get("missing_info", []))
    if c["follow_up_question"]:
        save_case(ctx, c)
        step(ctx, case_id, "IntakeAgent", "Still missing information")
        notify_buyer(ctx, c, "info_needed")
        return
    c["status"] = "SUBMITTED"
    save_case(ctx, c)
    step(ctx, case_id, "IntakeAgent", f"Follow-up answered: location {c['location_in_unit']}")
    _continue_new_case(ctx, c, slot)


def _continue_new_case(ctx: Ctx, c: dict, slot: str | None) -> None:
    sim = agents.similar(ctx, c)
    save_links(ctx, c["case_id"], sim["refs"])
    c["occurrence_count"] = sim["occurrence"]
    step(ctx, c["case_id"], "SimilarDefectAgent",
         f"Found {len(sim['refs'])} related case(s); recurrence_count={sim['occurrence']} in this unit; {len(sim['stack_units'])} other unit(s) in the stack"
         if sim["refs"] else "No related cases: treated as a new defect")
    t = agents.triage(ctx, c, slot)
    assign(c, t["technician_id"])
    c.update(triage_reason=t["reason"], status="VISIT_SCHEDULED")
    save_case(ctx, c)
    book(ctx, c["case_id"], t["technician_id"], t["slot"], "visit")
    event(ctx, c["case_id"], "case.assigned", f"Assigned to {ctx.worker(t['technician_id'])['name']}", technician_id=t["technician_id"])
    step(ctx, c["case_id"], "TriageAgent", t["reason"])
    notify_buyer(ctx, c, "received", slot=fmt_datetime(t["slot"]))
    notify_tech(ctx, c, "New inspection visit: please accept",
                f"{c['unit_id']}: {c['summary']}. Inspection visit {fmt_datetime(t['slot'])}. Accept it in the app, or hand it over if you can't make it.")


def book_repair(ctx: Ctx, case_id: str, start: str) -> None:
    c = load_case(ctx, case_id)
    if c["status"] != "VALID":
        raise WorkflowError("This case isn't ready for a repair booking.")
    option = next((o for o in agents.repair_options(ctx, c) if o["start"] == norm(start)), None)
    if not option:
        raise WorkflowError("That repair time is no longer available. Please choose another.")
    worker_id = c["support_id"] if c.get("support_id") in option["workerIds"] else option["workerIds"][0]
    plan = config.REPAIR_PLAN.get(c["category"], config.REPAIR_PLAN["other"])
    release(ctx, case_id, "repair")
    for s in option["slots"]:
        book(ctx, case_id, worker_id, s, "repair")
    c["inspector_id"] = c.get("inspector_id") or c.get("technician_id")
    assign(c, worker_id)
    c.update(repair_hours=plan["hours"], status="REPAIR_BOOKED")
    save_case(ctx, c)
    duration = agents.fmt_hours(plan["hours"])
    w = ctx.worker(worker_id)
    step(ctx, case_id, "TriageAgent", f"{plan['trade']} repair ({duration}) allocated to {ctx.worker_label(worker_id)}, "
         f"{'specialist subcontractor' if w['kind'] == 'subcontractor' else 'in-house technician'}, first available at {fmt_datetime(option['start'])}")
    event(ctx, case_id, "repair.booked", f"Repair booked for {fmt_datetime(option['start'])} ({duration}) with {ctx.worker_label(worker_id)}")
    notify_tech(ctx, c, "Repair booked", f"{c['unit_id']}: {c['summary']}. Repair {fmt_datetime(option['start'])}, estimated {duration}.")
    notify_buyer(ctx, c, "repair_booked", slot=fmt_datetime(option["start"]), duration=duration)


def submit_verification(ctx: Ctx, case_id: str, result: str, note: str, photo: str | None) -> None:
    c = load_case(ctx, case_id)
    if c["status"] != "PENDING_SIGNOFF":
        raise WorkflowError("This case isn't waiting for your sign-off.")
    if result not in ("FIXED", "NOT_FIXED", "CANNOT_VERIFY"):
        raise WorkflowError("Unknown result.")
    if result == "NOT_FIXED" and not photo:
        raise WorkflowError("Please add a new photo showing the problem.")
    v = latest_verification(ctx, case_id)
    add_photo(ctx, case_id, photo, "reopen" if result == "NOT_FIXED" else "verification")
    if v:
        ctx.conn.execute("UPDATE verifications SET outcome = ?, evidence_notes = ?, completed_at = ? WHERE verification_id = ?", (result, note, ctx.now, v["verification_id"]))
    event(ctx, case_id, "verification.completed", f"Buyer verification: {result.replace('_', ' ').lower()}" + (f' — "{note}"' if note else ""))
    step(ctx, case_id, "VerificationAgent", f"Recorded result {result}{' with photo evidence' if photo else ''}")
    if result == "FIXED":
        c.update(buyer_signed=1, buyer_signed_at=ctx.now, buyer_signoff_note=note, verification_status="verified")
        save_case(ctx, c)
        event(ctx, case_id, "signoff.completed", "Buyer signed off the repair")
        notify_tech(ctx, c, "Buyer signed off your repair", f"{c['unit_id']}: {c['summary']}.")
        _close_if_both_signed(ctx, c)
    elif result == "NOT_FIXED":
        c["verification_status"] = "not_verified"
        save_case(ctx, c)
        _reopen(ctx, c, note or "Buyer verification failed: still not fixed")


def _close_if_both_signed(ctx: Ctx, c: dict) -> None:
    if not (c.get("buyer_signed_at") and c.get("developer_signed_at")):
        return
    c.update(status="CLOSED", closed_at=ctx.now)
    save_case(ctx, c)
    event(ctx, c["case_id"], "case.closed", "Buyer and developer both signed off: case closed")
    notify_buyer(ctx, c, "closed")


def developer_signoff(ctx: Ctx, case_id: str) -> None:
    c = load_case(ctx, case_id)
    if c["status"] != "PENDING_SIGNOFF":
        raise WorkflowError("This case isn't waiting for sign-off.")
    by = f"{config.SDP_STAFF_NAME}, {config.SDP_STAFF_TITLE}"
    c.update(developer_signed=1, developer_signed_at=ctx.now, developer_signed_by=by)
    save_case(ctx, c)
    event(ctx, case_id, "signoff.completed", f"Developer signed off ({by})")
    _close_if_both_signed(ctx, c)


def reopen_case(ctx: Ctx, case_id: str, description: str, photo: str | None) -> None:
    c = load_case(ctx, case_id)
    if c["status"] != "CLOSED" or not c.get("closed_at") or days_between(c["closed_at"], ctx.now) > config.GRACE_PERIOD_DAYS:
        raise WorkflowError(f"Only closed cases can be reopened, within {config.GRACE_PERIOD_DAYS} days of closing.")
    if not photo:
        raise WorkflowError("A new photo is required to reopen.")
    add_photo(ctx, case_id, photo, "reopen")
    _reopen(ctx, c, description or "Problem came back")


def _reopen(ctx: Ctx, c: dict, description: str) -> None:
    case_id = c["case_id"]
    c.update(reopen_count=(c.get("reopen_count") or 0) + 1, status="REOPENED", closed_at=None)
    save_case(ctx, c)
    event(ctx, case_id, "case.reopened", f"Reopened (#{c['reopen_count']}): {description}")
    notify_tech(ctx, c, "A case you repaired was reopened", f"{c['unit_id']}: {c['summary']}. Buyer says: {description}")
    notify_buyer(ctx, c, "reopened")

    r = agents.recurrence(ctx, c)
    c["occurrence_count"] = r["occurrence"]
    step(ctx, case_id, "RecurrenceAgent", f"Occurrences in unit: {r['occurrence']}; stack units affected: {len(r['stack_units']) + 1}")
    if r["escalate"]:
        unit = ctx.units[c["unit_id"]]
        related = [x for x in ctx.all_cases() if x["category"] == c["category"] and ctx.units[x["unit_id"]]["block"] == unit["block"]
                   and ctx.units[x["unit_id"]]["stack"] == unit["stack"] and x["status"] != "INVALID"]
        approval_id = next_id(ctx, "approvals", "approval_id", "APR", 4)
        si_id = next_id(ctx, "systemic_issues", "issue_id", "SI", 3)
        ctx.conn.execute(
            "INSERT INTO approvals (approval_id, case_id, reasons, status, decided_by, created_at, decided_at) VALUES (?, ?, ?, 'pending', NULL, ?, NULL)",
            (approval_id, case_id, json.dumps(r["reasons"]), ctx.now),
        )
        ctx.conn.execute(
            """INSERT INTO systemic_issues (issue_id, title, category, block, stack, related_cases, recurrence_count, reopened_count, confidence,
               detected_at, status, recommended_action, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)""",
            (si_id, (c["sub_category"] or "").replace("_", " ").capitalize() or config.CATEGORY_LABEL.get(c["category"]), c["category"], unit["block"], unit["stack"],
             json.dumps([x["case_id"] for x in related]), len(related), sum(1 for x in related if (x["reopen_count"] or 0) > 0),
             min(0.95, 0.55 + len(related) * 0.06), ctx.now,
             f"Extra inspection of {c['unit_id']} and the unit above; check the shared riser for stack {unit['block']}-{unit['stack']}.", approval_id),
        )
        c["status"] = "ESCALATION_PENDING"
        save_case(ctx, c)
        event(ctx, case_id, "recurrence.detected", " ".join(r["reasons"]), agent="RecurrenceAgent")
        event(ctx, case_id, "inspection.requested", f"Extra inspection requested ({si_id}); waiting for SDP approval", agent="RecurrenceAgent")
        email(ctx, case_id, config.SDP_STAFF_EMAIL, f"[Approval needed] Extra inspection for {case_id} ({si_id})",
              "\n".join(r["reasons"]) + f"\n\nApprove or reject: {config.APP_URL}/sdp/approvals#{approval_id}")
        notify_buyer(ctx, c, "escalated")
    else:
        t = agents.triage(ctx, c, None)
        assign(c, t["technician_id"])
        c.update(status="VISIT_SCHEDULED", inspection_outcome=None, verdict_note=None, verdict_at=None)
        save_case(ctx, c)
        book(ctx, case_id, t["technician_id"], t["slot"], "visit")
        step(ctx, case_id, "TriageAgent", f"Below escalation threshold; revisit: {t['reason']}")
        notify_tech(ctx, c, "Revisit job", f"{c['unit_id']}: {c['summary']} came back. Visit {fmt_datetime(t['slot'])}.")
        notify_buyer(ctx, c, "revisit", slot=fmt_datetime(t["slot"]))


# ---------- technician / subcontractor ----------


def record_verdict(ctx: Ctx, case_id: str, outcome: str, note: str, photo: str | None) -> None:
    c = load_case(ctx, case_id)
    if c["status"] not in ("VISIT_SCHEDULED", "EXTRA_INSPECTION"):
        raise WorkflowError("This case isn't waiting for an inspection result.")
    if c.get("booking_status") == "PENDING":
        raise WorkflowError("Accept the job before recording the result.")
    if outcome not in ("VALID", "INVALID") or not note.strip():
        raise WorkflowError("Choose Valid or Invalid and add a note.")
    add_photo(ctx, case_id, photo, "verdict")
    release(ctx, case_id, "visit")
    c.update(inspection_outcome="VALID_DEFECT" if outcome == "VALID" else "NOT_A_DEFECT", verdict_note=note.strip(), verdict_at=ctx.now, inspector_id=c["technician_id"])
    event(ctx, case_id, "verdict.recorded", f'Technician marked {outcome}: "{note.strip()}"')
    if outcome == "VALID":
        c["status"] = "VALID"
        save_case(ctx, c)
        notify_buyer(ctx, c, "valid", note=note.strip())
    else:
        c.update(status="INVALID", closed_at=ctx.now)
        save_case(ctx, c)
        notify_buyer(ctx, c, "invalid", note=note.strip())


def mark_repaired(ctx: Ctx, case_id: str, note: str, photo: str | None) -> None:
    c = load_case(ctx, case_id)
    if c["status"] != "REPAIR_BOOKED":
        raise WorkflowError("This case has no booked repair.")
    if c.get("booking_status") == "PENDING":
        raise WorkflowError("Accept the job before marking it repaired.")
    if not note.strip():
        raise WorkflowError("Add a repair note.")
    add_photo(ctx, case_id, photo, "repair")
    release(ctx, case_id, "repair")
    c.update(status="REPAIRED", repair_note=note.strip(), repaired_at=ctx.now, buyer_signed=0, developer_signed=0, buyer_signed_at=None,
             buyer_signoff_note=None, developer_signed_at=None, developer_signed_by=None, signoff_reminder_at=None, auto_closed_at=None,
             signoff_overdue_at=None, verification_status="pending")
    save_case(ctx, c)
    event(ctx, case_id, "repair.done", f'Technician marked repaired: "{note.strip()}"')
    guide = agents.verification_guide(c)
    ctx.conn.execute(
        "INSERT INTO verifications (verification_id, case_id, protocol, outcome, evidence_notes, photo_path, created_at, completed_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL)",
        (next_id(ctx, "verifications", "verification_id", "V", 4), case_id, json.dumps(guide), ctx.now),
    )
    c["status"] = "PENDING_SIGNOFF"
    save_case(ctx, c)
    step(ctx, case_id, "VerificationAgent", f"Retrieved {config.CATEGORY_LABEL.get(c['category'], '').lower()} protocol; {len(guide['steps'])} case-specific checks for the buyer")
    event(ctx, case_id, "verification.requested", "Buyer asked to verify the repair and sign off; developer sign-off also required")
    notify_buyer(ctx, c, "verify")


# Jobs a worker can accept or hand over, and the slot kind each one books.
JOB_KIND = {"VISIT_SCHEDULED": "visit", "EXTRA_INSPECTION": "visit", "REPAIR_BOOKED": "repair"}
JOB_NAME = {"VISIT_SCHEDULED": "inspection visit", "EXTRA_INSPECTION": "detailed inspection", "REPAIR_BOOKED": "repair"}


def _my_job(ctx: Ctx, case_id: str, worker_id: str) -> tuple[dict, str, list[str]]:
    c = load_case(ctx, case_id)
    kind = JOB_KIND.get(c["status"])
    if not kind:
        raise WorkflowError("This case has no job to accept or hand over right now.")
    if c["technician_id"] != worker_id:
        raise WorkflowError("This job is assigned to another technician.")
    starts = [norm(r["start_at"]) for r in ctx.conn.execute(
        "SELECT start_at FROM slots WHERE case_id = ? AND kind = ? AND technician_id = ? ORDER BY start_at", (case_id, kind, worker_id))]
    return c, kind, starts


def accept_job(ctx: Ctx, case_id: str, worker_id: str) -> None:
    c, _, starts = _my_job(ctx, case_id, worker_id)
    if c.get("booking_status") != "PENDING":
        raise WorkflowError("You've already accepted this job.")
    c["booking_status"] = "CONFIRMED"
    save_case(ctx, c)
    job = JOB_NAME[c["status"]]
    event(ctx, case_id, "booking.confirmed", f"{ctx.worker_label(worker_id)} accepted the {job}", technician_id=worker_id)
    notify_buyer(ctx, c, "confirmed", job=job, slot=fmt_datetime(starts[0]) if starts else "the booked time")


def hand_over(ctx: Ctx, case_id: str, worker_id: str, reason: str) -> dict:
    """The assigned worker can't make it (declined, or an emergency after accepting): the TriageAgent moves the job to the
    next available colleague, keeping the time if someone is free then, otherwise at the earliest free time."""
    c, kind, starts = _my_job(ctx, case_id, worker_id)
    reason = reason.strip()
    if not reason:
        raise WorkflowError("Please give a reason.")
    options = agents.handover_options(ctx, c, kind, starts)
    if not options:
        raise WorkflowError("No other qualified technician is free in the next 2 weeks. Please contact the SDP office.")
    opt = options[0]
    declined = c.get("booking_status") == "PENDING"
    new_id = opt["technicianId"]
    ctx.conn.execute("UPDATE slots SET case_id = NULL, kind = NULL WHERE case_id = ? AND kind = ? AND technician_id = ?", (case_id, kind, worker_id))
    ctx.invalidate()
    for s in opt["slots"]:
        book(ctx, case_id, new_id, s, kind)
    if c["status"] == "EXTRA_INSPECTION" and c.get("support_id") and not opt["sameTime"]:
        # Joint inspection: the subcontractor moves to the new time too.
        ctx.conn.execute("UPDATE slots SET case_id = NULL, kind = NULL WHERE case_id = ? AND kind = 'visit' AND technician_id = ?", (case_id, c["support_id"]))
        ctx.invalidate()
        book(ctx, case_id, c["support_id"], opt["start"], "visit")
        notify_tech(ctx, c, "Joint inspection moved", f"{c['unit_id']}: now {fmt_datetime(opt['start'])} with {ctx.worker(new_id)['name']}.", worker_id=c["support_id"])
    old = starts[0] if starts else None
    assign(c, new_id)
    c.update(handed_over_from=worker_id, handover_reason=reason, handed_over_at=ctx.now, handover_prev_slot=old)
    save_case(ctx, c)

    job = JOB_NAME[c["status"]]
    prev = ctx.worker(worker_id)["name"]
    event(ctx, case_id, "booking.rejected", f"{ctx.worker_label(worker_id)} {'declined' if declined else 'can no longer do'} the {job}: {reason}",
          technician_id=worker_id, reason=reason)
    step(ctx, case_id, "TriageAgent", f"Hand-over: assigned next available colleague, {ctx.worker_label(new_id)}")
    event(ctx, case_id, "case.assigned", f"Handed over to {ctx.worker_label(new_id)} "
          + ("(same time)" if opt["sameTime"] else f"(moved to {fmt_datetime(opt['start'])})"), technician_id=new_id)
    notify_tech(ctx, c, "Job handed over to you: please accept",
                f"{c['unit_id']}: {c['summary']}. {job.capitalize()} {fmt_datetime(opt['start'])}, handed over by {prev}.")
    notify_buyer(ctx, c, "reassigned", job=job, previous=prev, slot=fmt_datetime(opt["start"]),
                 same_time=opt["sameTime"], old_slot=fmt_datetime(old) if old else "")
    return {"technicianId": new_id, "sameTime": opt["sameTime"], "start": opt["start"]}


# ---------- SDP ----------


def decide_approval(ctx: Ctx, approval_id: str, approve: bool) -> None:
    a = ctx.conn.execute("SELECT * FROM approvals WHERE approval_id = ?", (approval_id,)).fetchone()
    if not a or a["status"] != "pending":
        raise WorkflowError("This request has already been decided.")
    c = load_case(ctx, a["case_id"])
    status = "approved" if approve else "rejected"
    ctx.conn.execute("UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE approval_id = ?",
                     (status, f"{config.SDP_STAFF_NAME}, {config.SDP_STAFF_TITLE}", ctx.now, approval_id))
    ctx.conn.execute("UPDATE systemic_issues SET status = ? WHERE approval_id = ?", ("under_inspection" if approve else "monitoring", approval_id))
    if not approve:
        event(ctx, c["case_id"], "inspection.rejected", "SDP rejected extra inspection: normal repair booking")
        c["status"] = "VALID"
        save_case(ctx, c)
        notify_buyer(ctx, c, "valid", note="Our team will repair this as a normal case")
        return
    event(ctx, c["case_id"], "inspection.approved", f"SDP approved extra inspection ({approval_id})")
    brief = agents.initial_inspection(ctx, c, c.get("verdict_note"), latest_verification(ctx, c["case_id"]))
    ctx.conn.execute("INSERT OR REPLACE INTO inspection_briefs (case_id, brief, created_at) VALUES (?, ?, ?)", (c["case_id"], json.dumps(brief), ctx.now))
    t = agents.triage(ctx, c, None)
    sub = agents.subcontractor_for(ctx, c)
    assign(c, t["technician_id"])
    c.update(support_id=sub["technician_id"] if sub else None, status="EXTRA_INSPECTION",
             inspection_outcome=None, verdict_note=None, verdict_at=None)
    save_case(ctx, c)
    book(ctx, c["case_id"], t["technician_id"], t["slot"], "visit")
    step(ctx, c["case_id"], "InitialInspectionAgent", f"Inspection brief ready: timeline, photo comparison, likely components and a {len(brief['checklist'])}-point checklist")
    tech = ctx.worker(t["technician_id"])
    checklist = "\n".join(f"{i + 1}. {x}" for i, x in enumerate(brief["checklist"]))
    email(ctx, c["case_id"], tech["email"], f"[{c['case_id']}] Extra inspection brief (you lead)", checklist)
    if sub:
        # The trade subcontractor attends: recurring defects usually trace to their workmanship or system, and they repair under contract.
        book(ctx, c["case_id"], sub["technician_id"], t["slot"], "visit")
        step(ctx, c["case_id"], "TriageAgent", f"Joint inspection: {tech['name']} (in-house, lead) with {ctx.worker_label(sub['technician_id'])} ({config.REPAIR_PLAN.get(c['category'], config.REPAIR_PLAN['other'])['trade']} subcontractor)")
        email(ctx, c["case_id"], sub["email"], f"[{c['case_id']}] Joint extra inspection with {tech['name']}", f"{fmt_datetime(t['slot'])} at {c['unit_id']}.\n\n{checklist}")
    notify_buyer(ctx, c, "extra_inspection", slot=fmt_datetime(t["slot"]))


# ---------- time rules & demo controls ----------


def signoff_deadline(c: dict) -> str:
    return add_days(c.get("repaired_at") or c.get("verdict_at") or c["created_at"], config.SIGNOFF_PERIOD_DAYS)


def sweep_signoffs(ctx: Ctx) -> None:
    """Sign-off period: in-app reminder 3 days before the deadline, then auto-close (high urgency: flag to SDP instead)."""
    ids = [r["case_id"] for r in ctx.conn.execute("SELECT case_id FROM cases WHERE status = 'PENDING_SIGNOFF' AND buyer_signed_at IS NULL")]
    for case_id in ids:
        c = load_case(ctx, case_id)
        deadline = signoff_deadline(c)
        left = days_between(ctx.now, deadline)
        p, g = config.SIGNOFF_PERIOD_DAYS, config.GRACE_PERIOD_DAYS
        ref = f"{c['case_id']} ({c['summary']})"
        if left <= 0:
            if c["urgency"] == "high" and not config.HIGH_URGENCY_AUTO_CLOSE:
                if c.get("signoff_overdue_at"):
                    continue
                c["signoff_overdue_at"] = ctx.now
                save_case(ctx, c)
                event(ctx, case_id, "signoff.overdue", f"Buyer sign-off overdue ({p} days). High urgency, so not auto-closed: flagged to SDP")
                buyer_message(ctx, case_id, "Sign-off overdue", f"{ref}. The {p}-day sign-off period has passed. Our team will contact you to confirm the repair.")
            else:
                c.update(status="CLOSED", closed_at=deadline, auto_closed_at=deadline)
                save_case(ctx, c)
                event(ctx, case_id, "case.closed", f"Closed automatically: no buyer sign-off within {p} days")
                buyer_message(ctx, case_id, "Case closed automatically",
                              f"{ref}. We didn't receive your sign-off within {p} days, so the case was closed. If the problem comes back, you can reopen it within {g} days with a new photo.")
        elif left <= config.SIGNOFF_REMINDER_DAYS_BEFORE and not c.get("signoff_reminder_at"):
            c["signoff_reminder_at"] = ctx.now
            save_case(ctx, c)
            event(ctx, case_id, "signoff.reminder", f"Sign-off reminder sent to buyer ({-int(-left)} day(s) left)")
            tail = "If we don't hear from you, our team will follow up." if c["urgency"] == "high" else "After that the case will close automatically."
            buyer_message(ctx, case_id, "Reminder: please sign off your repair", f"{ref}. Please check the repair and sign off by {fmt_datetime(deadline)}. {tail}")


def skip_days(ctx: Ctx, days: float) -> None:
    ctx.offset_days += days
    ctx.now = add_days(ctx.now, days)
    ctx.conn.execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('clock_offset_days', ?)", (str(ctx.offset_days),))
    event(ctx, None, "agent.step", f"Demo clock moved forward {days:g} days")
    sweep_signoffs(ctx)


def simulate_rain(ctx: Ctx) -> None:
    text = "Heavy rain last night, ceiling in master bedroom leaking again"
    for unit_id in ("A-13-08", "A-11-08"):
        if ctx.conn.execute("SELECT 1 FROM cases WHERE unit_id = ? AND status NOT IN ('CLOSED', 'INVALID')", (unit_id,)).fetchone():
            continue
        buyer = ctx.conn.execute("SELECT buyer_id FROM buyers WHERE unit_id = ?", (unit_id,)).fetchone()
        if not buyer:
            continue
        r = agents.intake(text, True)
        case_id = next_id(ctx, "cases", "case_id", "C", 4)
        ctx.conn.execute(
            """INSERT INTO cases (case_id, unit_id, buyer_id, status, category, sub_category, location_in_unit, summary, description, urgency,
               missing_info, occurrence_count, reopen_count, created_at) VALUES (?, ?, ?, 'SUBMITTED', ?, ?, ?, ?, ?, ?, '[]', 1, 0, ?)""",
            (case_id, unit_id, buyer["buyer_id"], r["category"], r["sub_category"], r["location_in_unit"], r["summary"], text, r["urgency"], ctx.now),
        )
        ctx.invalidate()
        event(ctx, case_id, "case.created", f"Rain: new report from {unit_id}", summary=r["summary"], category=r["category"])
        c = load_case(ctx, case_id)
        sim = agents.similar(ctx, c)
        save_links(ctx, case_id, sim["refs"])
        c["occurrence_count"] = sim["occurrence"]
        step(ctx, case_id, "SimilarDefectAgent", f"Linked to {len(sim['refs'])} related case(s) in stack A-08")
        t = agents.triage(ctx, c, None)
        assign(c, t["technician_id"])
        c.update(triage_reason=t["reason"], status="VISIT_SCHEDULED")
        save_case(ctx, c)
        book(ctx, case_id, t["technician_id"], t["slot"], "visit")
        step(ctx, case_id, "TriageAgent", t["reason"])
