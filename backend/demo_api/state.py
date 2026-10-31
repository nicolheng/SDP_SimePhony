"""Read the whole database into the shape the web app uses (frontend/src/lib/types.ts DemoState)."""
import json
import re
from pathlib import Path

from . import agents, config
from .analytics import OPEN, build_analytics
from .timeutil import local_day, norm, parse
from .workflow import UPLOADS_DIR, Ctx, signoff_deadline

PHOTO_KINDS = {"original", "reopen", "verdict", "repair", "verification"}
# Seeded cases point to sample_<category>_<kind>.jpg in data/sample_photos: a real photo where one exists, otherwise the
# SVG drawn by backend/seed/make_sample_photos.py.
SAMPLE_PHOTOS_DIR = config.ROOT / "data" / "sample_photos"


def _json(v, fallback):
    if v in (None, ""):
        return fallback
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return fallback


def _num(v) -> int:
    return int(re.sub(r"\D", "", str(v)) or 0)


def _pretty(v) -> str:
    s = str(v or "").replace("_", " ").strip()
    return s[:1].upper() + s[1:] if s else ""


def _category(v) -> str:
    return v if v in config.CATEGORY_LABEL else "other"


def _event_message(type_: str, p: dict, ctx: Ctx) -> str:
    if p.get("message"):
        return str(p["message"])
    name = lambda k: (ctx.worker(p.get(k)) or {}).get("name", p.get(k) or "a technician")  # noqa: E731
    if type_ == "email.sent":
        return f"📧 Email to {p.get('to', 'recipient')}: {p.get('subject', '')}"
    if type_ == "case.created":
        return f"Reported: {p.get('summary') or 'new defect'}"
    if type_ == "case.assigned":
        return f"Assigned to {name('technician_id')}"
    if type_ == "booking.requested":
        return f"Booking requested with {name('technician_id')} ({p.get('slot_id', '')})"
    if type_ == "booking.confirmed":
        return f"Booking confirmed with {name('technician_id')} ({p.get('slot_id', '')})"
    if type_ == "booking.rejected":
        return f"Booking declined by {name('technician_id')}" + (f": {p['reason']}" if p.get("reason") else "")
    detail = " · ".join(f"{k.replace('_', ' ')}: {v}" for k, v in p.items() if v is not None and not isinstance(v, (dict, list)))
    return detail or type_


def _last_repair(case_slots: list[dict]) -> list[str]:
    """Start times of the most recent finished repair (one day, one worker), for cases whose repair is done."""
    done = [s for s in case_slots if s["kind"] == "repair_done"]
    if not done:
        return []
    last = max(done, key=lambda s: parse(s["start_at"]))
    day = local_day(last["start_at"])
    return sorted(norm(s["start_at"]) for s in done if s["technician_id"] == last["technician_id"] and local_day(s["start_at"]) == day)


def build_state(ctx: Ctx, base_url: str) -> dict:
    conn = ctx.conn
    rows = lambda sql: [dict(r) for r in conn.execute(sql)]  # noqa: E731

    def group(items, key):
        out: dict[str, list] = {}
        for it in items:
            out.setdefault(str(it[key]), []).append(it)
        return out

    photos = group(rows("SELECT * FROM case_photos ORDER BY created_at"), "case_id")
    slots = group(rows("SELECT * FROM slots WHERE case_id IS NOT NULL ORDER BY start_at"), "case_id")
    verifs = group(rows("SELECT * FROM verifications ORDER BY created_at, verification_id"), "case_id")
    briefs = {r["case_id"]: r for r in rows("SELECT * FROM inspection_briefs")}
    unit_of = {r["case_id"]: r["unit_id"] for r in rows("SELECT case_id, unit_id FROM cases")}
    links = group(rows("SELECT * FROM case_links ORDER BY created_at"), "case_id")
    assignments = group(rows("SELECT * FROM assignment_history ORDER BY created_at, assignment_id"), "case_id")

    def photo_url(path: str) -> str | None:
        if not path:
            return None
        if (UPLOADS_DIR / path).is_file():
            return f"{base_url}/uploads/{path}"
        # A real sample photo (.jpg) if there is one, else the drawn stand-in (.svg).
        for sample in (Path(path).name, Path(path).with_suffix(".svg").name):
            if (SAMPLE_PHOTOS_DIR / sample).is_file():
                return f"{base_url}/samples/{sample}"
        return None

    cases = []
    for r in rows("SELECT * FROM cases ORDER BY created_at"):
        cid = r["case_id"]
        status = r["status"]
        category = _category(r["category"])
        case_slots = slots.get(cid, [])
        # Current bookings first; finished ones (visit_done / repair_done) are the record of when the job happened.
        slot_of = lambda kind: norm(next((s["start_at"] for s in reversed(case_slots) if s["kind"] == kind), None)  # noqa: E731
                                    or next((s["start_at"] for s in reversed(case_slots) if s["kind"] == f"{kind}_done"), None))
        # Repairs span several 2-hour blocks: the booking starts at the earliest one.
        repair_starts = sorted(norm(s["start_at"]) for s in case_slots if s["kind"] == "repair") or _last_repair(case_slots)
        v = (verifs.get(cid) or [None])[-1]
        outcome = r["inspection_outcome"]
        verdict = "VALID" if outcome == "VALID_DEFECT" else "INVALID" if outcome == "NOT_A_DEFECT" or status == "INVALID" else "VALID" if outcome else None
        c = {
            "id": cid,
            "unitId": r["unit_id"],
            "buyerId": r["buyer_id"],
            "status": status,
            "category": category,
            "subCategory": _pretty(r["sub_category"]) or config.CATEGORY_LABEL[category],
            "location": _pretty(r["location_in_unit"]),
            "summary": r["summary"] or "",
            "description": r["description"] or "",
            "urgency": r["urgency"] if r["urgency"] in ("high", "low") else "normal",
            "technicianId": r["technician_id"],
            "inspectorId": r.get("inspector_id"),
            "supportId": r.get("support_id"),
            # Seeded jobs have no status and count as accepted.
            "bookingStatus": "pending" if r.get("booking_status") == "PENDING" else "confirmed",
            "handover": {"fromId": r["handed_over_from"], "reason": r.get("handover_reason") or "", "at": norm(r.get("handed_over_at")),
                         "previousSlot": norm(r.get("handover_prev_slot"))} if r.get("handed_over_from") else None,
            "repairHours": r.get("repair_hours") or (config.REPAIR_PLAN.get(category, config.REPAIR_PLAN["other"])["hours"] if repair_starts else None),
            "visitSlot": slot_of("visit"),
            "preferredVisitAt": norm(r.get("preferred_visit_at")),
            "assignments": [
                {"technicianId": a["technician_id"], "outcome": a["outcome"], "reason": a["rejected_reason"], "at": norm(a["created_at"]),
                 "job": a.get("job") or "inspection visit"}
                for a in assignments.get(cid, [])
            ],
            "repairSlot": repair_starts[0] if repair_starts else None,
            "photos": [
                {"url": photo_url(p["path"]), "kind": p["kind"] if p["kind"] in PHOTO_KINDS else "original", "at": norm(p["created_at"])}
                for p in photos.get(cid, [])
            ],
            "reopenCount": r["reopen_count"] or 0,
            "occurrence": r["occurrence_count"] or 1,
            "similar": [{"caseId": l["related_case_id"], "unitId": unit_of.get(l["related_case_id"], ""), "reason": l["reason"], "at": norm(l["created_at"])} for l in links.get(cid, [])],
            "missingInfo": _json(r["missing_info"], []),
            "followUpQuestion": r["follow_up_question"],
            "verdict": {"outcome": verdict, "note": r["verdict_note"] or "", "at": norm(r["verdict_at"])} if verdict and r["verdict_at"] else None,
            "repairNote": r["repair_note"],
            "repairedAt": norm(r["repaired_at"]),
            "verification": {"result": v["outcome"], "note": v["evidence_notes"] or "", "at": norm(v["completed_at"])} if v and v["outcome"] and v["completed_at"] else None,
            "signoff": {
                "buyer": {"at": norm(r["buyer_signed_at"]), "note": r["buyer_signoff_note"] or ""} if r["buyer_signed_at"] else None,
                "developer": {"at": norm(r["developer_signed_at"]), "by": r["developer_signed_by"] or "SDP"} if r["developer_signed_at"] else None,
            } if (r["buyer_signed_at"] or r["developer_signed_at"]) else None,
            "signoffReminderAt": norm(r.get("signoff_reminder_at")),
            "signoffDeadline": signoff_deadline({**r, "created_at": norm(r["created_at"]), "repaired_at": norm(r["repaired_at"]),
                                                 "verdict_at": norm(r["verdict_at"]), "developer_signed_at": norm(r["developer_signed_at"])})
            if status == "PENDING_SIGNOFF" else None,
            "autoClosedAt": norm(r.get("auto_closed_at")),
            "signoffOverdueAt": norm(r.get("signoff_overdue_at")),
            "triageReason": r["triage_reason"],
            "createdAt": norm(r["created_at"]),
            "closedAt": norm(r["closed_at"]),
            # Past seeded cases; open H- cases (e.g. still awaiting sign-off) stay in the active lists.
            "historical": cid.startswith("H-") and status not in OPEN,
        }
        if cid in briefs:
            b = _json(briefs[cid]["brief"], None)
            if isinstance(b, dict):
                c["inspectionBrief"] = {
                    "generatedAt": norm(b.get("generatedAt") or b.get("generated_at") or briefs[cid]["created_at"]),
                    "timeline": b.get("timeline", []),
                    "photoComparison": b.get("photoComparison") or b.get("photo_comparison") or "",
                    "neighbouringUnits": b.get("neighbouringUnits") or b.get("neighbouring_units") or [],
                    "likelyComponents": b.get("likelyComponents") or b.get("likely_components") or [],
                    "checklist": b.get("checklist", []),
                }
        if v or status == "PENDING_SIGNOFF":
            guide = _json(v["protocol"], None) if v else None
            if not (isinstance(guide, dict) and guide.get("steps")):
                # Seeded rows store only the protocol name; build the case-specific steps.
                g = agents.verification_guide({**r, "category": category, "sub_category": c["subCategory"], "location_in_unit": c["location"]})
                guide = {**g, "intro": f"{v['protocol']}. {g['intro']}" if v and v.get("protocol") else g["intro"]}
            c["verificationGuide"] = guide
        cases.append(c)

    events = []
    for r in rows("SELECT * FROM case_events ORDER BY created_at, event_id"):
        p = _json(r["payload"], {})
        data = p.get("data") if isinstance(p.get("data"), dict) else {}
        events.append({
            "id": _num(r["event_id"]),
            "caseId": r["case_id"],
            "type": r["type"],
            "at": norm(r["created_at"]),
            "agent": p.get("agent") if r["type"] == "agent.step" else None,
            "message": _event_message(r["type"], p, ctx),
            "fallbackUsed": data.get("fallback_used") is True,
            "fallbackStep": data.get("step"),
            "fallbackReason": data.get("reason"),
            **({
                "telemetry": {
                    "model": data.get("model"),
                    "timing_ms": data.get("timing_ms"),
                    "tokens": data.get("tokens"),
                    "fallback_used": data.get("fallback_used") is True,
                    "fallback_reason": data.get("fallback_reason"),
                    "guardrail_hits": data.get("guardrail_hits", []),
                }
            } if r["type"] == "agent.step" else {}),
        })

    buyer_email = {r["buyer_id"]: r["email"] for r in rows("SELECT buyer_id, email FROM buyers")}
    outbox = []
    for r in rows("SELECT * FROM outbox ORDER BY created_at, email_id"):
        to = r["to_addr"]
        m = re.match(r"^(B-\d+)@", to or "")
        outbox.append({
            "id": _num(r["email_id"]), "caseId": r["case_id"], "to": buyer_email.get(m.group(1), to) if m else to,
            "subject": r["subject"], "body": r["body"], "status": "sent" if r["status"] == "sent" else "logged, not sent", "at": norm(r["created_at"]),
        })

    approvals_rows = rows("SELECT * FROM approvals ORDER BY created_at")
    issue_rows = rows("SELECT * FROM systemic_issues ORDER BY detected_at")
    approval_status = {a["approval_id"]: a["status"] for a in approvals_rows}
    issue_for = {i["approval_id"]: i["issue_id"] for i in issue_rows if i["approval_id"]}

    return {
        "version": 5,
        "source": "database",
        "now": ctx.now,
        "cases": cases,
        "events": events,
        "messages": [
            {"id": _num(r["message_id"]), "caseId": r["case_id"], "at": norm(r["created_at"]), "title": r["title"], "body": r["body"]}
            for r in rows("SELECT * FROM buyer_messages ORDER BY created_at, message_id")
        ],
        "outbox": outbox,
        "approvals": [
            {"id": a["approval_id"], "caseId": a["case_id"], "systemicIssueId": issue_for.get(a["approval_id"], ""), "reasons": _json(a["reasons"], []),
             "status": a["status"] if a["status"] in ("pending", "approved", "rejected") else "pending", "createdAt": norm(a["created_at"]), "decidedAt": norm(a["decided_at"]),
             "decidedBy": a["decided_by"]}
            for a in approvals_rows
        ],
        "systemicIssues": [
            {"id": i["issue_id"], "title": i["title"], "category": _category(i["category"]), "block": i["block"] or "", "stack": i["stack"] or "",
             "relatedCases": _json(i["related_cases"], []), "recurrenceCount": i["recurrence_count"] or 0, "reopenedCount": i["reopened_count"] or 0,
             "confidence": i["confidence"] or 0, "detectedAt": norm(i["detected_at"]),
             "status": i["status"] if i["status"] in ("open", "under_inspection", "monitoring", "resolved") else "open",
             "approvalStatus": approval_status.get(i["approval_id"], "pending") if i["approval_id"] else "pending",
             "recommendedAction": i["recommended_action"] or ""}
            for i in issue_rows
        ],
        "bookings": [
            {"slot": norm(s["start_at"]), "technicianId": s["technician_id"], "caseId": s["case_id"], "kind": (s["kind"] or "visit").removesuffix("_done")}
            for s in rows("SELECT * FROM slots WHERE case_id IS NOT NULL")
        ],
        "workers": [
            {"id": w["technician_id"], "name": w["name"], "email": w["email"], "skills": w["skills"], "blocks": w["blocks"], "kind": w["kind"], "company": w.get("company")}
            for w in ctx.workers
        ],
        "seq": {"case": 0, "event": 0, "si": 0},
        "reference": reference(ctx),
        "analytics": build_analytics(ctx, issue_rows),
    }


def reference(ctx: Ctx) -> dict:
    """Lookup data the screens show: units and buyers from the database, settings from config.py.
    Business rules are not here: the web app reads them once from GET /api/rules."""
    return {
        "project": config.PROJECT_NAME,
        "units": [{"id": u["unit_id"], "block": u["block"], "floor": u["floor"], "stack": u["stack"], "contractor": u["contractor"]} for u in ctx.units.values()],
        "buyers": [{"id": b["buyer_id"], "name": b["name"], "email": b["email"], "unitId": b["unit_id"]}
                   for b in ctx.conn.execute("SELECT buyer_id, name, email, unit_id FROM buyers")],
        "sdpStaff": {"name": config.SDP_STAFF_NAME, "title": config.SDP_STAFF_TITLE, "email": config.SDP_STAFF_EMAIL},
    }
