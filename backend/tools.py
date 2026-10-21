# backend/tools.py
"""
SimePhony business rules and database operations: the one place that changes a case.

Follows the web app's model (backend/demo_api):
  - time comes from the demo clock (real time + app_meta.clock_offset_days), timestamps are UTC "...000Z"
  - visits and repairs start at fixed Malaysia-time blocks (config.SLOT_TIMES, 2 h each, no Sundays,
    14-day window); a booking is a row in `slots` linked to the case
  - visits go to in-house technicians; repairs follow config.REPAIR_PLAN (duration, trade and
    whether a subcontractor does it)

Callers:
  - LangGraph agents import this module directly.
  - mcp_server.py exposes the agent-facing tools (not the human decisions) to MCP clients.
  - demo_api/workflow.py still has its own copies of these rules; it should call these later.

Write tools return {"ok": False, "error": "..."} instead of raising when a business rule blocks
the action (wrong status, technician busy, outside grace period), so an agent can react.
"""
import base64
import functools
import json
import os
import re
import smtplib
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

import numpy as np
import yaml
from dotenv import load_dotenv

load_dotenv()

import db
from demo_api import config
from demo_api.migrate import migrate
from demo_api.timeutil import add_days, days_between, demo_now, fmt_datetime, local_day, norm, parse, slot_iso

ROOT = db.ROOT
UPLOADS_DIR = ROOT / os.getenv("UPLOADS_DIR", "uploads")
RULES_PATH = ROOT / "rules.yaml"

PHOTO_KINDS = ("original", "reopen", "verdict", "repair", "verification")
MAX_PHOTO_BYTES = 15 * 1024 * 1024
SDP_SIGNER = f"{config.SDP_STAFF_NAME}, {config.SDP_STAFF_TITLE}"


class ToolError(Exception):
    """A business-rule failure, returned to the caller as {"ok": False, "error": ...}."""


def _returns_errors(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ToolError as e:
            return {"ok": False, "error": str(e)}
    return wrapper


@functools.lru_cache(maxsize=1)
def load_rules() -> dict:
    """rules.yaml as a dict (cached; restart to pick up edits)."""
    with open(RULES_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


# ---------- database access ----------

_ready_dbs: set[str] = set()


@contextmanager
def _connect():
    """One transaction on the live DB. The first use per DB file applies schema.sql and the web app's
    migrations (demo clock, subcontractors, extra columns), so agents work without starting FastAPI."""
    key = str(db.DB_PATH)
    if key not in _ready_dbs:
        db.ensure_db()
        with db.get_conn() as conn:
            migrate(conn)
        _ready_dbs.add(key)
    with db.get_conn() as conn:
        yield conn


def _now(conn: sqlite3.Connection) -> str:
    """The same demo clock as the web app: real time plus the days skipped with "Skip days"."""
    return demo_now(conn)


def _emit(conn: sqlite3.Connection, case_id: Optional[str], event_type: str, message: str,
          agent: Optional[str] = None, **payload) -> str:
    """Write a case_events row. `message` is what the timeline and SDP trace pages show."""
    event_id = db.next_record_id(conn, "case_events")
    body = {"message": message, **({"agent": agent} if agent else {}), **payload}
    conn.execute(
        "INSERT INTO case_events (event_id, case_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        (event_id, case_id, event_type, json.dumps(body), _now(conn)),
    )
    return event_id


def _next_id(conn: sqlite3.Connection, table: str, column: str, prefix: str, width: int) -> str:
    rows = conn.execute(f"SELECT {column} AS v FROM {table} WHERE {column} LIKE ?", (f"{prefix}-%",)).fetchall()
    n = max((int(m.group(1)) for r in rows if (m := re.match(rf"{prefix}-(\d+)$", r["v"]))), default=0)
    return f"{prefix}-{n + 1:0{width}d}"


def _get_case(conn: sqlite3.Connection, case_id: str) -> dict:
    row = conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
    if row is None:
        raise ToolError(f"Case {case_id!r} not found")
    return dict(row)


def _require_status(case: dict, allowed: tuple, action: str) -> None:
    if case["status"] not in allowed:
        raise ToolError(f"Cannot {action}: case {case['case_id']} is {case['status']} (needs {' / '.join(allowed)})")


def _unit(conn: sqlite3.Connection, unit_id: str) -> dict:
    return dict(conn.execute("SELECT * FROM units WHERE unit_id = ?", (unit_id,)).fetchone())


def _workers(conn: sqlite3.Connection) -> list[dict]:
    return [
        {**dict(r), "skills": json.loads(r["skills"]), "blocks": json.loads(r["blocks"]), "kind": r["kind"] or "technician"}
        for r in conn.execute("SELECT * FROM technicians")
    ]


def _worker(conn: sqlite3.Connection, worker_id: Optional[str]) -> Optional[dict]:
    return next((w for w in _workers(conn) if w["technician_id"] == worker_id), None)


def _worker_label(w: dict) -> str:
    return f"{w['name']} ({w['company']})" if w.get("company") else w["name"]


# ---------- scheduling rules (same as demo_api/agents.py) ----------

def _upcoming_slots(now: str, days: int = config.BOOKING_WINDOW_DAYS) -> list[str]:
    """Bookable start times: config.SLOT_TIMES (Malaysia time) on the next `days` non-Sunday days."""
    out = []
    for d in range(1, days + 4):
        day = local_day(add_days(now, d))
        if datetime.fromisoformat(f"{day}T12:00:00+08:00").weekday() == 6:
            continue
        out.extend(slot_iso(day, t) for t in config.SLOT_TIMES)
        if len(out) >= days * len(config.SLOT_TIMES):
            break
    return out


def _bookings(conn: sqlite3.Connection, ignore_case: Optional[str] = None, ignore_kind: Optional[str] = None) -> list[dict]:
    rows = conn.execute("SELECT technician_id, case_id, kind, start_at, end_at FROM slots WHERE case_id IS NOT NULL AND kind NOT GLOB '*_done'").fetchall()
    return [
        {"technician_id": r["technician_id"], "start": parse(r["start_at"]), "end": parse(r["end_at"])}
        for r in rows
        if not (ignore_case and r["case_id"] == ignore_case and r["kind"] == ignore_kind)
    ]


def _busy(bookings: list[dict], worker_id: str, start: str) -> bool:
    s, e = parse(start), parse(add_days(start, config.SLOT_HOURS / 24))
    return any(b["technician_id"] == worker_id and b["start"] < e and b["end"] > s for b in bookings)


def _visit_technicians(workers: list[dict], category: Optional[str], block: str) -> list[dict]:
    """In-house technicians covering the block with a skill for the category."""
    skills = set(config.skills_for(category)) if category else None
    return [w for w in workers if w["kind"] == "technician" and block in w["blocks"] and (skills is None or skills & set(w["skills"]))]


def _repair_plan(category: Optional[str]) -> dict:
    return config.REPAIR_PLAN.get(category, config.REPAIR_PLAN["other"])


def _case_repair_plan(case: dict) -> dict:
    """The category's repair plan, using the case's own estimate (set_repair_estimate) when it has one."""
    plan = dict(_repair_plan(case.get("category")))
    if case.get("repair_hours"):
        plan["hours"] = case["repair_hours"]
        if case.get("repair_estimate_reason"):
            plan["estimate_reason"] = case["repair_estimate_reason"]
    return plan


def _repairers(workers: list[dict], category: Optional[str], block: str) -> list[dict]:
    """Workers for the category's repair plan; the planned kind (subcontractor / technician) first."""
    plan = _repair_plan(category)
    fits = [w for w in workers if block in w["blocks"] and set(w["skills"]) & set(plan["skills"])]
    return [w for w in fits if w["kind"] == plan["by"]] or fits


def _repair_blocks(hours: float) -> int:
    return min(len(config.SLOT_TIMES), max(1, -(-int(hours * 10) // (config.SLOT_HOURS * 10))))


def _repair_options(conn: sqlite3.Connection, case: dict) -> list[dict]:
    """Repair start times where a worker is free for the whole job. Jobs stay within one session:
    1 block any time, 2 blocks morning or afternoon, longer from 9am."""
    plan = _case_repair_plan(case)
    n = _repair_blocks(plan["hours"])
    pool = _repairers(_workers(conn), case["category"], _unit(conn, case["unit_id"])["block"])
    bookings = _bookings(conn, ignore_case=case["case_id"], ignore_kind="repair")
    starts = list(range(len(config.SLOT_TIMES))) if n == 1 else [0, 2] if n == 2 else [0]
    out = []
    for day in sorted({local_day(s) for s in _upcoming_slots(_now(conn))}):
        for i in starts:
            times = config.SLOT_TIMES[i:i + n]
            if len(times) < n:
                continue
            slots = [slot_iso(day, t) for t in times]
            free = [w for w in pool if all(not _busy(bookings, w["technician_id"], s) for s in slots)]
            if free:
                out.append({
                    "start": slots[0], "start_local": fmt_datetime(slots[0]), "slots": slots,
                    "workers": [{"technician_id": w["technician_id"], "name": _worker_label(w), "kind": w["kind"]} for w in free],
                })
    return out


def _book(conn: sqlite3.Connection, case_id: str, worker_id: str, start: str, kind: str) -> str:
    slot_id = _next_id(conn, "slots", "slot_id", "S", 4)
    conn.execute(
        "INSERT INTO slots (slot_id, technician_id, start_at, end_at, case_id, kind) VALUES (?, ?, ?, ?, ?, ?)",
        (slot_id, worker_id, start, add_days(start, config.SLOT_HOURS / 24), case_id, kind),
    )
    return slot_id


def _drop_slots(conn: sqlite3.Connection, slot_ids: list[str]) -> None:
    for slot_id in slot_ids:
        conn.execute("UPDATE assignment_history SET slot_id = NULL WHERE slot_id = ?", (slot_id,))
        conn.execute("DELETE FROM slots WHERE slot_id = ?", (slot_id,))


def _release(conn: sqlite3.Connection, case_id: str, kind: str) -> None:
    """Cancel a booking that won't happen (reassignment, rebooking). Same rules as demo_api/workflow.cancel_booking."""
    _drop_slots(conn, [r["slot_id"] for r in conn.execute("SELECT slot_id FROM slots WHERE case_id = ? AND kind = ?", (case_id, kind))])


def _finish(conn: sqlite3.Connection, case_id: str, kind: str) -> None:
    """The job is done: keep the booking as its record (kind visit_done / repair_done); finished bookings don't block anyone."""
    conn.execute("UPDATE slots SET kind = ? WHERE case_id = ? AND kind = ?", (f"{kind}_done", case_id, kind))


def _declined_technicians(conn: sqlite3.Connection, case_id: str) -> list[str]:
    """Technicians who rejected this case's visit since its last accepted visit (the current booking round)."""
    declined: list[str] = []
    for r in conn.execute("SELECT technician_id, outcome FROM assignment_history WHERE case_id = ? ORDER BY created_at, assignment_id", (case_id,)):
        if r["outcome"] == "ACCEPTED":
            declined = []
        elif r["technician_id"] not in declined:
            declined.append(r["technician_id"])
    return declined


# ---------- photos ----------

def _save_photo(conn: sqlite3.Connection, case_id: str, photo: Optional[str], kind: str) -> Optional[dict]:
    """Store a photo given as a data URL (from the browser) or a local file path. Saved as
    uploads/<case>_<photo>_<kind>.<ext> like the web app."""
    if not photo:
        return None
    if kind not in PHOTO_KINDS:
        raise ToolError(f"Invalid photo kind {kind!r} (use {' / '.join(PHOTO_KINDS)})")
    m = re.match(r"data:image/(png|jpe?g|webp);base64,(.+)$", photo, re.S)
    if m:
        raw, ext = base64.b64decode(m.group(2)), "png" if m.group(1) == "png" else "jpg"
    else:
        src = Path(photo)
        if not src.is_absolute():
            src = UPLOADS_DIR / src if (UPLOADS_DIR / src).is_file() else ROOT / src
        if not src.is_file():
            raise ToolError(f"Photo not found: {photo}")
        ext = src.suffix.lstrip(".").lower().replace("jpeg", "jpg")
        if ext not in ("png", "jpg", "webp"):
            raise ToolError("Photos must be JPG, PNG or WebP images")
        raw = src.read_bytes()
    if len(raw) > MAX_PHOTO_BYTES:
        raise ToolError("That photo is too large (max 15 MB)")
    photo_id = db.next_record_id(conn, "case_photos")
    name = f"{case_id}_{photo_id}_{kind}.{ext}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOADS_DIR / name).write_bytes(raw)
    conn.execute(
        "INSERT INTO case_photos (photo_id, case_id, path, kind, created_at) VALUES (?, ?, ?, ?, ?)",
        (photo_id, case_id, name, kind, _now(conn)),
    )
    return {"photo_id": photo_id, "path": name, "url": f"/uploads/{name}"}


# ---------- case lifecycle helpers ----------

def _save(conn: sqlite3.Connection, case_id: str, **fields) -> None:
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE cases SET {sets} WHERE case_id = ?", [*fields.values(), case_id])


def _close_if_both_signed(conn: sqlite3.Connection, case_id: str) -> bool:
    c = _get_case(conn, case_id)
    if not (c["buyer_signed_at"] and c["developer_signed_at"]):
        return False
    _save(conn, case_id, status="CLOSED", closed_at=_now(conn))
    _emit(conn, case_id, "case.closed", "Buyer and developer both signed off: case closed")
    return True


def _reopen(conn: sqlite3.Connection, case: dict, description: str) -> int:
    count = (case["reopen_count"] or 0) + 1
    _save(conn, case["case_id"], reopen_count=count, status="REOPENED", closed_at=None)
    _emit(conn, case["case_id"], "case.reopened", f"Reopened (#{count}): {description}", reopen_count=count)
    return count


def _parse_guide(text: Optional[str]):
    try:
        return json.loads(text) if text else None
    except (TypeError, ValueError):
        return text


# ---------- embeddings (find_similar_cases) ----------

EMBED_MODEL = "all-MiniLM-L6-v2"


@functools.lru_cache(maxsize=1)
def _load_embedder():
    """The sentence-transformers model, loaded once per process (first import takes ~15 s). None if unavailable."""
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(EMBED_MODEL)
    except Exception:
        return None


def _embed(text: str) -> Optional[np.ndarray]:
    if os.getenv("EMBEDDINGS_ENABLED", "true").lower() != "true":
        return None
    model = _load_embedder()
    return model.encode([text], convert_to_numpy=True)[0].astype(np.float32) if model else None


def _case_vector(conn: sqlite3.Connection, case: sqlite3.Row) -> Optional[np.ndarray]:
    """Stored embedding for a case, computing and storing it (same text format as the seed) if missing."""
    row = conn.execute("SELECT vector FROM case_embeddings WHERE case_id = ?", (case["case_id"],)).fetchone()
    if row:
        return np.frombuffer(row["vector"], dtype=np.float32)
    text = (f"{case['summary'] or ''}. {case['description'] or ''}. Category: {case['category']} "
            f"({case['sub_category']}). Location: {case['location_in_unit']} in unit {case['unit_id']}.")
    vector = _embed(text)
    if vector is not None:
        conn.execute(
            "INSERT OR REPLACE INTO case_embeddings (case_id, model, vector) VALUES (?, ?, ?)",
            (case["case_id"], EMBED_MODEL, vector.tobytes()),
        )
    return vector


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom else 0.0


# =====================================================================
# Read tools (agents, MCP and UI)
# =====================================================================

def get_clock() -> dict:
    """Current demo time (the web app's clock, moved by 'skip days'). Use it instead of the real date.
    Returns {now, now_local}."""
    with _connect() as conn:
        now = _now(conn)
    return {"now": now, "now_local": fmt_datetime(now)}


@_returns_errors
def get_case(case_id: str) -> dict:
    """Full case record with unit, buyer, technician, photos, bookings, latest verification guide,
    related cases, inspection brief, approvals and technician accept/reject history. Use this before
    drafting any message or guide."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        case["missing_info"] = json.loads(case["missing_info"]) if case["missing_info"] else []
        case["unit"] = _unit(conn, case["unit_id"])
        buyer = conn.execute("SELECT buyer_id, name, email FROM buyers WHERE buyer_id = ?", (case["buyer_id"],)).fetchone()
        case["buyer"] = dict(buyer) if buyer else None
        for key in ("technician_id", "inspector_id", "support_id"):
            w = _worker(conn, case.get(key))
            case[key.replace("_id", "")] = {k: w[k] for k in ("technician_id", "name", "email", "skills", "kind", "company")} if w else None
        case["photos"] = [
            {"photo_id": r["photo_id"], "kind": r["kind"], "url": f"/uploads/{r['path']}", "created_at": r["created_at"]}
            for r in conn.execute("SELECT * FROM case_photos WHERE case_id = ? ORDER BY created_at, photo_id", (case_id,))
        ]
        case["bookings"] = [
            {"kind": r["kind"], "technician_id": r["technician_id"], "start": norm(r["start_at"]), "start_local": fmt_datetime(r["start_at"])}
            for r in conn.execute("SELECT * FROM slots WHERE case_id = ? ORDER BY start_at", (case_id,))
        ]
        v = conn.execute(
            "SELECT * FROM verifications WHERE case_id = ? ORDER BY created_at DESC, verification_id DESC LIMIT 1", (case_id,)
        ).fetchone()
        case["verification"] = {**dict(v), "protocol": _parse_guide(v["protocol"])} if v else None
        case["related_cases"] = [
            dict(r) for r in conn.execute("SELECT related_case_id, reason, score FROM case_links WHERE case_id = ?", (case_id,))
        ]
        brief = conn.execute("SELECT brief FROM inspection_briefs WHERE case_id = ?", (case_id,)).fetchone()
        case["inspection_brief"] = _parse_guide(brief["brief"]) if brief else None
        case["approvals"] = [
            {**dict(r), "reasons": json.loads(r["reasons"]) if r["reasons"] else []}
            for r in conn.execute("SELECT * FROM approvals WHERE case_id = ? ORDER BY created_at DESC", (case_id,))
        ]
        case["assignment_history"] = [
            dict(r) for r in conn.execute(
                "SELECT technician_id, slot_id, outcome, rejected_reason, created_at FROM assignment_history WHERE case_id = ? ORDER BY created_at, assignment_id",
                (case_id,),
            )
        ]
        case["repair_plan"] = _case_repair_plan(case)
    return case


@_returns_errors
def get_unit(unit_id: str) -> dict:
    """Unit details and its buyer. Returns {unit_id, block, floor, stack, contractor, buyer: {buyer_id, name, email}}."""
    with _connect() as conn:
        unit = conn.execute("SELECT * FROM units WHERE unit_id = ?", (unit_id,)).fetchone()
        if unit is None:
            raise ToolError(f"Unit {unit_id!r} not found")
        buyer = conn.execute("SELECT buyer_id, name, email FROM buyers WHERE unit_id = ?", (unit_id,)).fetchone()
    return {**dict(unit), "buyer": dict(buyer) if buyer else None}


def get_available_slots(
    block: str,
    skill: Optional[str | list[str]] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    include_subcontractors: bool = False,
    limit: int = 20,
) -> list[dict]:
    """Free 2-hour blocks in the next 14 days (demo clock), earliest first, for workers covering
    `block` with the skill (or any of a list; None = any skill). In-house technicians only unless
    include_subcontractors. from_date / to_date are Malaysia dates YYYY-MM-DD (inclusive).
    Returns [{start, start_local, technician_id, technician_name, kind}]."""
    skills = {skill} if isinstance(skill, str) else set(skill) if skill else None
    with _connect() as conn:
        workers = [
            w for w in _workers(conn)
            if block in w["blocks"] and (skills is None or skills & set(w["skills"]))
            and (include_subcontractors or w["kind"] == "technician")
        ]
        bookings = _bookings(conn)
        times = _upcoming_slots(_now(conn))
    out = []
    for start in times:
        day = local_day(start)
        if (from_date and day < from_date[:10]) or (to_date and day > to_date[:10]):
            continue
        for w in workers:
            if not _busy(bookings, w["technician_id"], start):
                out.append({"start": start, "start_local": fmt_datetime(start), "technician_id": w["technician_id"],
                            "technician_name": _worker_label(w), "kind": w["kind"]})
                if len(out) >= limit:
                    return out
    return out


@_returns_errors
def get_booking_options(case_id: str, kind: str = "visit", limit: int = 3) -> dict:
    """Everything needed to book this case.
    kind=visit (TriageAgent): in-house technicians with the category's skills in the unit's block,
      excluding those who rejected this visit (excluded_technicians).
      `preferred` = technicians free at the buyer's chosen time (preferred_visit_at), or null;
      `alternatives` = the next `limit` other times with at least one free technician.
    kind=repair: start times where a worker from the category's repair plan (config.REPAIR_PLAN:
      trade, hours, subcontractor or in-house) is free for the whole job; first `limit` options.
    Returns {case_id, kind, block, urgency, skills | plan, preferred_at, preferred, alternatives | options,
    excluded_technicians, no_availability}."""
    if kind not in ("visit", "repair"):
        raise ToolError(f"Invalid kind {kind!r} (use visit / repair)")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        block = _unit(conn, case["unit_id"])["block"]
        if kind == "repair":
            options = _repair_options(conn, case)
            return {"case_id": case_id, "kind": kind, "block": block, "urgency": case["urgency"],
                    "plan": _case_repair_plan(case), "preferred_worker": case.get("support_id"),
                    "options": options[:limit], "no_availability": not options}

        excluded = _declined_technicians(conn, case_id)
        techs = [t for t in _visit_technicians(_workers(conn), case["category"], block) if t["technician_id"] not in excluded]
        bookings = _bookings(conn, ignore_case=case_id, ignore_kind="visit")
        times = _upcoming_slots(_now(conn))

    def free_at(start):
        return [{"technician_id": t["technician_id"], "name": t["name"]} for t in techs if not _busy(bookings, t["technician_id"], start)]

    preferred_at = norm(case["preferred_visit_at"]) if case.get("preferred_visit_at") else None
    preferred = None
    if preferred_at and preferred_at in times:
        free = free_at(preferred_at)
        preferred = {"start": preferred_at, "start_local": fmt_datetime(preferred_at), "technicians": free} if free else None
    alternatives = []
    for start in times:
        if start == preferred_at:
            continue
        free = free_at(start)
        if free:
            alternatives.append({"start": start, "start_local": fmt_datetime(start), "technicians": free})
            if len(alternatives) == limit:
                break
    return {"case_id": case_id, "kind": kind, "block": block, "urgency": case["urgency"],
            "skills": config.skills_for(case["category"]), "preferred_at": preferred_at, "preferred": preferred,
            "alternatives": alternatives, "excluded_technicians": excluded, "no_availability": not (preferred or alternatives)}


@_returns_errors
def get_verification_protocol(category: str) -> dict:
    """Predefined safe post-repair checks for a defect category (rules.yaml verification_protocols).
    Returns {category, matched, steps}. matched=False means the generic 'other' protocol was used."""
    protocols = load_rules().get("verification_protocols", {})
    steps = protocols.get(category)
    return {"category": category, "matched": steps is not None, "steps": steps or protocols.get("other", [])}


def get_case_history(case_id: Optional[str] = None, unit_id: Optional[str] = None) -> list[dict]:
    """Timeline events for a case, or for every case in a unit. Returns [{event_id, case_id, type, payload, created_at}]."""
    if not case_id and not unit_id:
        return []
    with _connect() as conn:
        if case_id:
            rows = conn.execute(
                "SELECT e.* FROM case_events e WHERE e.case_id = ? ORDER BY e.created_at, e.event_id", (case_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT e.* FROM case_events e JOIN cases c ON c.case_id = e.case_id WHERE c.unit_id = ? ORDER BY e.created_at, e.event_id",
                (unit_id,),
            ).fetchall()
    return [
        {"event_id": r["event_id"], "case_id": r["case_id"], "type": r["type"],
         "payload": json.loads(r["payload"]) if r["payload"] else {}, "created_at": norm(r["created_at"])}
        for r in rows
    ]


CASE_FILTERS = (("unit_id", "c.unit_id"), ("block", "u.block"), ("floor", "u.floor"), ("stack", "u.stack"),
                ("category", "c.category"), ("contractor", "u.contractor"))


def _relation(base: sqlite3.Row, r: sqlite3.Row) -> tuple[float, Optional[str]]:
    """How physically related a candidate case is to the base case: (weight 0-1, reason)."""
    if r["unit_id"] == base["unit_id"]:
        return 1.0, f"Same unit {r['unit_id']}"
    if r["block"] == base["block"] and r["stack"] == base["stack"]:
        d = r["floor"] - base["floor"]
        return max(0.5, 0.9 - 0.05 * abs(d)), f"Same stack {r['block']}-{r['stack']}, {abs(d)} floor(s) {'above' if d > 0 else 'below'} ({r['unit_id']})"
    if r["block"] == base["block"] and r["floor"] == base["floor"] and r["stack"].isdigit() and base["stack"].isdigit() \
            and abs(int(r["stack"]) - int(base["stack"])) == 1:
        return 0.7, f"Next door on the same floor ({r['unit_id']})"
    if r["contractor"] and r["contractor"] == base["contractor"]:
        return 0.2, f"Same contractor ({r['contractor']})"
    return 0.0, None


def find_similar_cases(case_id: Optional[str] = None, text: Optional[str] = None, filters: Optional[dict] = None, top_k: int = 5) -> list[dict]:
    """Related past cases, best first. With case_id: same-category cases in the same unit, same stack
    (any floor), next door or same contractor, blended with text similarity (embeddings) when available;
    cases of any location with text similarity >= 0.6 are also included. With text only: ranked by text
    similarity. filters (unit_id, block, floor, stack, category, contractor) are hard constraints.
    INVALID cases are returned but flagged counts_toward_escalation=false.
    Returns [{case_id, score, reason, unit_id, category, sub_category, status, created_at, counts_toward_escalation}]."""
    filters = filters or {}
    with _connect() as conn:
        base = None
        if case_id:
            base = conn.execute(
                "SELECT c.*, u.block, u.floor, u.stack, u.contractor FROM cases c JOIN units u ON u.unit_id = c.unit_id WHERE c.case_id = ?",
                (case_id,),
            ).fetchone()
            if base is None:
                return []
        query_vec = _case_vector(conn, base) if base else (_embed(text) if text else None)

        wheres, params = ["c.case_id != ?"], [case_id or ""]
        for key, col in CASE_FILTERS:
            if filters.get(key) is not None:
                wheres.append(f"{col} = ?"); params.append(filters[key])
        if base and base["category"] and "category" not in filters:
            wheres.append("c.category = ?"); params.append(base["category"])
        rows = conn.execute(
            f"""
            SELECT c.case_id, c.unit_id, c.category, c.sub_category, c.status, c.created_at,
                   u.block, u.floor, u.stack, u.contractor, e.vector
            FROM cases c JOIN units u ON u.unit_id = c.unit_id LEFT JOIN case_embeddings e ON e.case_id = c.case_id
            WHERE {' AND '.join(wheres)}
            """,
            params,
        ).fetchall()

    filter_reason = ", ".join(f"same {key.replace('_id', '')}" for key, _ in CASE_FILTERS if filters.get(key) is not None) or "filter match"
    results = []
    for r in rows:
        semantic = _cosine(query_vec, np.frombuffer(r["vector"], dtype=np.float32)) if query_vec is not None and r["vector"] else None
        reasons = []
        if base:
            weight, where = _relation(base, r)
            if weight == 0 and (semantic is None or semantic < 0.6):
                continue
            if where:
                reasons.append(where)
            if base["sub_category"] and r["sub_category"] == base["sub_category"]:
                reasons.append(f"same defect type ({r['sub_category']})")
            score = 0.6 * weight + 0.4 * semantic if semantic is not None else weight
        elif semantic is not None:
            score = semantic
        else:
            score = 1.0
            reasons.append(filter_reason)
        if semantic is not None:
            reasons.append(f"text similarity {semantic:.2f}")
        results.append({
            "case_id": r["case_id"], "score": round(score, 4), "reason": "; ".join(reasons),
            "unit_id": r["unit_id"], "category": r["category"], "sub_category": r["sub_category"],
            "status": r["status"], "created_at": norm(r["created_at"]), "counts_toward_escalation": r["status"] != "INVALID",
        })
    results.sort(key=lambda x: (x["score"], x["created_at"]), reverse=True)
    return results[:top_k]


def _related_cases(conn: sqlite3.Connection, case: dict, unit: dict) -> list[sqlite3.Row]:
    """Other non-INVALID cases of the same category in the same unit or the same block/stack."""
    return conn.execute(
        """
        SELECT c.case_id, c.unit_id, c.reopen_count FROM cases c JOIN units u ON u.unit_id = c.unit_id
        WHERE c.case_id != ? AND c.category = ? AND c.status != 'INVALID'
          AND (c.unit_id = ? OR (u.block = ? AND u.stack = ?))
        ORDER BY c.created_at
        """,
        (case["case_id"], case["category"], case["unit_id"], unit["block"], unit["stack"]),
    ).fetchall()


def _open_issue(conn: sqlite3.Connection, category: str, unit: dict) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM systemic_issues WHERE category = ? AND block = ? AND stack = ? AND status != 'resolved' ORDER BY detected_at DESC LIMIT 1",
        (category, unit["block"], unit["stack"]),
    ).fetchone()


@_returns_errors
def check_escalation(case_id: str) -> dict:
    """Apply the rules.yaml escalation rule (same as the web app's RecurrenceAgent). occurrence_count =
    earlier non-INVALID cases of the same category in the same unit + this one; stack_unit_count =
    distinct units in the same block/stack with that category, including this one. Also returns the open
    systemic issue for the stack (request_extra_inspection reuses it) and any pending approval.
    Returns {occurrence_count, reopen_count, stack_units, stack_unit_count, thresholds, repeated_defect,
    stack_cluster, should_escalate, reasons, related_case_ids, existing_systemic_issue, pending_approval_id}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        if not case["category"]:
            raise ToolError(f"Case {case_id} has no category yet; run intake first")
        unit = _unit(conn, case["unit_id"])
        related = _related_cases(conn, case, unit)
        issue = _open_issue(conn, case["category"], unit)
        pending = conn.execute(
            "SELECT approval_id FROM approvals WHERE case_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1", (case_id,)
        ).fetchone()

    label = config.CATEGORY_LABEL.get(case["category"], case["category"])
    same_unit = [r for r in related if r["unit_id"] == case["unit_id"]]
    stack_units = sorted({r["unit_id"] for r in related if r["unit_id"] != case["unit_id"]})
    occurrence, stack_unit_count = len(same_unit) + 1, len(stack_units) + 1
    repeated = occurrence >= config.OCCURRENCE_THRESHOLD
    cluster = stack_unit_count >= config.STACK_CLUSTER_THRESHOLD
    reasons = []
    if repeated:
        reasons.append(f"{label} reported in {case['unit_id']} {occurrence} times ({occurrence - 1} earlier case(s)), "
                       f"and this case has been reopened {case['reopen_count'] or 0}×.")
    if cluster:
        reasons.append(f"{stack_unit_count} units in stack {unit['block']}-{unit['stack']} have the same problem: "
                       f"{', '.join([case['unit_id'], *stack_units])}.")
    return {
        "case_id": case_id, "occurrence_count": occurrence, "reopen_count": case["reopen_count"] or 0,
        "stack_units": stack_units, "stack_unit_count": stack_unit_count,
        "thresholds": {"occurrence": config.OCCURRENCE_THRESHOLD, "stack_cluster": config.STACK_CLUSTER_THRESHOLD},
        "repeated_defect": repeated, "stack_cluster": cluster,
        "should_escalate": (repeated or cluster) and case["status"] not in ("INVALID", "CLOSED") and pending is None,
        "reasons": reasons, "related_case_ids": [r["case_id"] for r in related],
        "existing_systemic_issue": {k: issue[k] for k in ("issue_id", "title", "status", "approval_id")} if issue else None,
        "pending_approval_id": pending["approval_id"] if pending else None,
    }


def get_stack_cases(block: str, stack: str) -> list[dict]:
    """All cases in one vertical stack (e.g. block A, stack 08), newest first."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT c.case_id, c.unit_id, u.floor, c.status, c.category, c.sub_category, c.urgency, c.summary, c.reopen_count, c.created_at, c.closed_at FROM cases c JOIN units u ON u.unit_id = c.unit_id WHERE u.block = ? AND u.stack = ? ORDER BY c.created_at DESC",
            (block, stack),
        ).fetchall()
    return [dict(r) for r in rows]


def get_recurring_stats(filters: Optional[dict] = None) -> dict:
    """Case counts, reopens and days-to-close by category and block, plus the most-reopened cases.
    filters: block, stack, category, status, from_date, to_date. Returns {by_category, by_block, top_recurring}."""
    filters = filters or {}
    wheres, params = [], []
    for key, col in [("block", "u.block"), ("stack", "u.stack"), ("category", "c.category"), ("status", "c.status")]:
        if filters.get(key):
            wheres.append(f"{col} = ?"); params.append(filters[key])
    if filters.get("from_date"):
        wheres.append("c.created_at >= ?"); params.append(filters["from_date"])
    if filters.get("to_date"):
        wheres.append("c.created_at <= ?"); params.append(filters["to_date"])
    where_sql = ("WHERE " + " AND ".join(wheres)) if wheres else ""

    with _connect() as conn:
        by_category = [dict(r) for r in conn.execute(f"SELECT c.category, COUNT(*) AS total_cases, SUM(c.reopen_count) AS total_reopens, AVG(CASE WHEN c.closed_at IS NOT NULL THEN JULIANDAY(c.closed_at) - JULIANDAY(c.created_at) END) AS avg_days_to_close FROM cases c JOIN units u ON u.unit_id = c.unit_id {where_sql} GROUP BY c.category ORDER BY total_cases DESC", params).fetchall()]
        by_block = [dict(r) for r in conn.execute(f"SELECT u.block, COUNT(*) AS total_cases, SUM(c.reopen_count) AS total_reopens FROM cases c JOIN units u ON u.unit_id = c.unit_id {where_sql} GROUP BY u.block ORDER BY total_cases DESC", params).fetchall()]
        top_recurring = [dict(r) for r in conn.execute(f"SELECT c.case_id, c.unit_id, c.category, c.reopen_count, c.status, c.summary, c.created_at, u.block, u.stack, u.floor FROM cases c JOIN units u ON u.unit_id = c.unit_id {where_sql} ORDER BY c.reopen_count DESC, c.created_at DESC LIMIT 10", params).fetchall()]
    return {"by_category": by_category, "by_block": by_block, "top_recurring": top_recurring}


def get_systemic_issues(status: Optional[str] = None, category: Optional[str] = None, block: Optional[str] = None) -> list[dict]:
    """Systemic issues (clusters raised to SDP), newest first. status: open / under_inspection / monitoring / resolved."""
    wheres, params = [], []
    for key, val in (("status", status), ("category", category), ("block", block)):
        if val:
            wheres.append(f"{key} = ?"); params.append(val)
    where_sql = ("WHERE " + " AND ".join(wheres)) if wheres else ""
    with _connect() as conn:
        rows = conn.execute(f"SELECT * FROM systemic_issues {where_sql} ORDER BY detected_at DESC", params).fetchall()
    return [{**dict(r), "related_cases": json.loads(r["related_cases"]) if r["related_cases"] else []} for r in rows]


def get_approval_status(approval_id: str) -> dict:
    """Status of an extra-inspection request. Returns {approval_id, case_id, status: pending/approved/rejected, decided_by, decided_at}."""
    with _connect() as conn:
        row = conn.execute("SELECT approval_id, case_id, status, decided_by, decided_at FROM approvals WHERE approval_id = ?", (approval_id,)).fetchone()
    if not row:
        return {"ok": False, "error": f"Approval {approval_id!r} not found"}
    return dict(row)


# =====================================================================
# Agent write tools (exposed over MCP)
# =====================================================================

@_returns_errors
def save_intake_result(case_id: str, intake: dict) -> dict:
    """IntakeAgent: store the intake JSON (CONTRACTS.md 'AI Intake JSON Contract') on the case.
    Sets INFO_NEEDED when follow_up_question is non-empty, otherwise SUBMITTED (ready for triage).
    Returns {ok, status, warnings}."""
    warnings = []
    category = intake.get("category")
    if category not in config.CATEGORY_TO_SKILL:
        warnings.append(f"Unknown category {category!r}; stored as 'other'")
        category = "other"
    urgency = (intake.get("urgency") or "normal").lower()
    if urgency not in ("high", "normal", "low"):
        warnings.append(f"Unknown urgency {urgency!r}; stored as 'normal'")
        urgency = "normal"
    question = (intake.get("follow_up_question") or "").strip()
    status = "INFO_NEEDED" if question else "SUBMITTED"

    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("SUBMITTED", "INFO_NEEDED"), "save intake result")
        occurrence = case["occurrence_count"] or 1
        mentioned = intake.get("mentioned_recurrence_count")
        if isinstance(mentioned, int) and mentioned > occurrence:
            occurrence = mentioned
        _save(conn, case_id, status=status, category=category, sub_category=intake.get("sub_category"),
              location_in_unit=intake.get("location_in_unit"), summary=intake.get("summary"), urgency=urgency,
              missing_info=json.dumps(intake.get("missing_info") or []), follow_up_question=question or None,
              inspection_outcome=intake.get("preliminary_outcome"), occurrence_count=occurrence)
        # The case text changed; find_similar_cases re-embeds it on next use.
        conn.execute("DELETE FROM case_embeddings WHERE case_id = ?", (case_id,))
        if status == "INFO_NEEDED":
            _emit(conn, case_id, "case.info_needed", question, missing_info=intake.get("missing_info") or [])
    return {"ok": True, "status": status, "warnings": warnings}


@_returns_errors
def save_similar_cases(case_id: str, links: list[dict], occurrence_count: Optional[int] = None) -> dict:
    """SimilarDefectAgent: store related cases (replacing earlier links for this case), shown on the
    case page. links: [{related_case_id, reason, score?}]. occurrence_count: reports of this defect in
    this unit including this one (check_escalation computes it). Returns {ok, linked}."""
    with _connect() as conn:
        _get_case(conn, case_id)
        now = _now(conn)
        conn.execute("DELETE FROM case_links WHERE case_id = ?", (case_id,))
        for link in links:
            if not conn.execute("SELECT 1 FROM cases WHERE case_id = ?", (link["related_case_id"],)).fetchone():
                raise ToolError(f"Related case {link['related_case_id']!r} not found")
            conn.execute(
                "INSERT INTO case_links (case_id, related_case_id, reason, score, created_at) VALUES (?, ?, ?, ?, ?)",
                (case_id, link["related_case_id"], link.get("reason") or "Related case", link.get("score"), now),
            )
        if occurrence_count is not None:
            _save(conn, case_id, occurrence_count=occurrence_count)
    return {"ok": True, "linked": len(links)}


@_returns_errors
def assign_technician(
    case_id: str, technician_id: str, start: str, reason: str,
    urgency: Optional[str] = None, support_id: Optional[str] = None,
) -> dict:
    """TriageAgent: request the inspection visit from an in-house technician who has the category's
    skill, covers the block and is free at `start` (one of the times from get_booking_options). The time
    is held and the case waits for the technician (booking_status PENDING): SUBMITTED / REOPENED ->
    ASSIGNED; EXTRA_INSPECTION keeps its status (optionally with a subcontractor `support_id` for a
    joint inspection). The technician then accepts or rejects (respond_to_assignment); after a
    rejection, call get_booking_options again and assign someone else. Rebooking replaces the earlier
    visit. Returns {ok, status, booking_status, technician_id, start, start_local}."""
    if urgency and urgency.lower() not in ("high", "normal", "low"):
        raise ToolError(f"Invalid urgency {urgency!r} (use high / normal / low)")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("SUBMITTED", "ASSIGNED", "VISIT_SCHEDULED", "REOPENED", "EXTRA_INSPECTION"), "book a visit")
        start = norm(start)
        if start not in _upcoming_slots(_now(conn)):
            raise ToolError(f"{start} is not a bookable visit time (see get_booking_options)")
        if technician_id in _declined_technicians(conn, case_id):
            raise ToolError(f"{technician_id} already rejected this visit; choose another technician")
        block = _unit(conn, case["unit_id"])["block"]
        workers = _workers(conn)
        tech = next((w for w in _visit_technicians(workers, case["category"], block) if w["technician_id"] == technician_id), None)
        if tech is None:
            raise ToolError(f"{technician_id} is not an in-house technician with {' / '.join(config.skills_for(case['category']))} covering block {block}")
        bookings = _bookings(conn, ignore_case=case_id, ignore_kind="visit")
        if _busy(bookings, technician_id, start):
            raise ToolError(f"{technician_id} is already booked at {fmt_datetime(start)}")
        support = None
        if support_id:
            if case["status"] != "EXTRA_INSPECTION":
                raise ToolError("A support subcontractor joins extra inspections only")
            support = next((w for w in _repairers(workers, case["category"], block)
                            if w["technician_id"] == support_id and w["kind"] == "subcontractor"), None)
            if support is None:
                raise ToolError(f"{support_id} is not a subcontractor for {case['category']} in block {block}")
            if _busy(bookings, support_id, start):
                raise ToolError(f"{support_id} is already booked at {fmt_datetime(start)}")

        _release(conn, case_id, "visit")
        slot_id = _book(conn, case_id, technician_id, start, "visit")
        if support:
            _book(conn, case_id, support_id, start, "visit")
        fields = {"technician_id": technician_id, "triage_reason": reason, "booking_status": "PENDING",
                  "assignment_attempts": (case.get("assignment_attempts") or 0) + 1,
                  "status": "EXTRA_INSPECTION" if case["status"] == "EXTRA_INSPECTION" else "ASSIGNED"}
        if urgency:
            fields["urgency"] = urgency.lower()
        if support:
            fields["support_id"] = support_id
        if case["status"] in ("REOPENED", "EXTRA_INSPECTION"):
            fields.update(inspection_outcome=None, verdict_note=None, verdict_at=None)  # new inspection, new verdict
        _save(conn, case_id, **fields)
        _emit(conn, case_id, "case.assigned", f"Assigned to {tech['name']}", technician_id=technician_id, start=start)
        _emit(conn, case_id, "booking.requested", f"Visit requested from {tech['name']} for {fmt_datetime(start)}; waiting for the technician to accept",
              technician_id=technician_id, slot_id=slot_id, start=start)
    return {"ok": True, "status": fields["status"], "booking_status": "PENDING", "technician_id": technician_id,
            "start": start, "start_local": fmt_datetime(start)}


@_returns_errors
def set_repair_estimate(case_id: str, hours: float, reason: str) -> dict:
    """RepairEstimateAgent (P2): case-specific repair duration after a VALID verdict, from the
    technician's note. hours is 2, 4 or 8 (whole 2-hour blocks, at most a day). Repair options, the case
    page (repair_plan.hours / estimate_reason) and book_repair then use it instead of the category's
    REPAIR_PLAN hours. Returns {ok, repair_hours}."""
    if hours not in (2, 4, 8):
        raise ToolError("hours must be 2, 4 or 8 (whole 2-hour blocks, at most a day)")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("VALID",), "set a repair estimate")
        _save(conn, case_id, repair_hours=hours, repair_estimate_reason=reason)
        _emit(conn, case_id, "agent.step", f"Repair estimated at about {hours:g} hours: {reason}", agent="RepairEstimateAgent")
    return {"ok": True, "repair_hours": hours}


@_returns_errors
def set_triage_result(case_id: str, urgency: str, reason: str) -> dict:
    """TriageAgent (P2): save the urgency triage settled on (it can raise intake's urgency when a rules.yaml
    high rule matches), before the visit is booked; booking and the case page then use it. reason is
    shown on the timeline. Returns {ok, urgency}."""
    urgency = (urgency or "").lower()
    if urgency not in ("high", "normal", "low"):
        raise ToolError(f"Invalid urgency {urgency!r} (use high / normal / low)")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("SUBMITTED", "REOPENED", "INFO_NEEDED"), "set the triage result")
        _save(conn, case_id, urgency=urgency)
        _emit(conn, case_id, "agent.step", f"Triage: {urgency} urgency. {reason}", agent="TriageAgent")
    return {"ok": True, "urgency": urgency}


@_returns_errors
def escalate_booking(case_id: str, reason: str) -> dict:
    """TriageAgent: no qualified technician is free (get_booking_options returned no_availability).
    Sets booking_status NEEDS_STAFF (status unchanged), records booking.escalated and emails SDP staff
    to book manually. Returns {ok, booking_status, email_status}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _save(conn, case_id, booking_status="NEEDS_STAFF")
        _emit(conn, case_id, "booking.escalated", f"No technician available: {reason}. Flagged to SDP for manual booking.")
    email = send_email(
        os.getenv("SDP_STAFF_EMAIL") or config.SDP_STAFF_EMAIL, f"[Action needed] No technician available for {case_id}",
        f"Case {case_id} (unit {case['unit_id']}, {case['category'] or 'uncategorised'}) needs a manual booking.\n\nReason: {reason}",
        case_id,
    )
    return {"ok": True, "booking_status": "NEEDS_STAFF", "email_status": email["status"]}


@_returns_errors
def start_verification(case_id: str, guide: dict | list[str] | str) -> dict:
    """VerificationAgent: issue the case-specific check guide to the buyer after a repair
    (REPAIRED -> PENDING_SIGNOFF). guide: {intro, steps: [...], ifFails} as the buyer's sign-off page
    shows it, or just a list of steps. Base the steps on get_verification_protocol and the case's
    location, description and repair_note. Returns {ok, verification_id, status}."""
    if isinstance(guide, str):
        parsed = _parse_guide(guide)
        guide = parsed if isinstance(parsed, (dict, list)) else [s.strip() for s in guide.splitlines() if s.strip()]
    if isinstance(guide, list):
        guide = {"intro": "Please check only these points:", "steps": guide}
    if not guide.get("steps"):
        raise ToolError("The guide needs at least one step")
    guide.setdefault("ifFails", 'If any check fails, do not sign off: choose "Still not fixed" and add a photo. Your case will be reopened.')
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("REPAIRED",), "start verification")
        verification_id = _next_id(conn, "verifications", "verification_id", "V", 4)
        conn.execute(
            "INSERT INTO verifications (verification_id, case_id, protocol, outcome, evidence_notes, photo_path, created_at, completed_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL)",
            (verification_id, case_id, json.dumps(guide), _now(conn)),
        )
        _save(conn, case_id, status="PENDING_SIGNOFF", verification_status="pending")
        _emit(conn, case_id, "verification.requested", "Buyer asked to verify the repair and sign off; developer sign-off also required")
    return {"ok": True, "verification_id": verification_id, "status": "PENDING_SIGNOFF"}


@_returns_errors
def request_extra_inspection(case_id: str, reasons: list[str], recommended_action: Optional[str] = None, title: Optional[str] = None) -> dict:
    """RecurrenceAgent: ask SDP staff to approve an extra inspection (-> ESCALATION_PENDING) and email
    them. Links the case to the open systemic issue for the same category/block/stack if there is one
    (e.g. SI-002), otherwise creates one. Call check_escalation first; reasons come from it.
    Returns {ok, approval_id, issue_id, reused_issue, email_status}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        if case["status"] in ("INVALID", "CLOSED"):
            raise ToolError(f"Case {case_id} is {case['status']}; only open cases can be escalated")
        if not case["category"]:
            raise ToolError(f"Case {case_id} has no category yet; run intake first")
        if conn.execute("SELECT 1 FROM approvals WHERE case_id = ? AND status = 'pending'", (case_id,)).fetchone():
            raise ToolError(f"Case {case_id} already has a pending extra-inspection request")
        now = _now(conn)
        unit = _unit(conn, case["unit_id"])
        related = _related_cases(conn, case, unit)
        stack_ids = [r["case_id"] for r in related] + [case_id]
        reopened = sum(1 for r in related if (r["reopen_count"] or 0) > 0) + (1 if (case["reopen_count"] or 0) > 0 else 0)

        approval_id = _next_id(conn, "approvals", "approval_id", "APR", 4)
        conn.execute(
            "INSERT INTO approvals (approval_id, case_id, reasons, status, decided_by, created_at, decided_at) VALUES (?, ?, ?, 'pending', NULL, ?, NULL)",
            (approval_id, case_id, json.dumps(reasons), now),
        )
        issue = _open_issue(conn, case["category"], unit)
        if issue:
            issue_id = issue["issue_id"]
            related = list(dict.fromkeys([*json.loads(issue["related_cases"] or "[]"), *stack_ids]))
            conn.execute(
                "UPDATE systemic_issues SET related_cases = ?, recurrence_count = ?, reopened_count = MAX(reopened_count, ?), "
                "confidence = MAX(COALESCE(confidence, 0), ?), status = 'open', approval_id = ?, "
                "recommended_action = COALESCE(?, recommended_action) WHERE issue_id = ?",
                (json.dumps(related), len(related), reopened, min(0.95, 0.55 + len(related) * 0.06), approval_id, recommended_action, issue_id),
            )
        else:
            issue_id = _next_id(conn, "systemic_issues", "issue_id", "SI", 3)
            conn.execute(
                """INSERT INTO systemic_issues (issue_id, title, category, block, stack, related_cases, recurrence_count, reopened_count,
                   confidence, detected_at, status, recommended_action, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)""",
                (issue_id, title or (case["sub_category"] or "").replace("_", " ").capitalize() or config.CATEGORY_LABEL.get(case["category"]),
                 case["category"], unit["block"], unit["stack"], json.dumps(stack_ids), len(stack_ids), reopened,
                 min(0.95, 0.55 + len(stack_ids) * 0.06), now,
                 recommended_action or f"Extra inspection of {case['unit_id']} and the unit above; check the shared riser for stack {unit['block']}-{unit['stack']}.",
                 approval_id),
            )
        _save(conn, case_id, status="ESCALATION_PENDING")
        _emit(conn, case_id, "recurrence.detected", " ".join(reasons), agent="RecurrenceAgent")
        _emit(conn, case_id, "inspection.requested", f"Extra inspection requested ({issue_id}); waiting for SDP approval",
              agent="RecurrenceAgent", approval_id=approval_id, issue_id=issue_id)
    email = send_email(
        os.getenv("SDP_STAFF_EMAIL") or config.SDP_STAFF_EMAIL, f"[Approval needed] Extra inspection for {case_id} ({issue_id})",
        "\n".join(reasons) + f"\n\nApprove or reject: {config.APP_URL}/sdp/approvals#{approval_id}", case_id,
    )
    return {"ok": True, "approval_id": approval_id, "issue_id": issue_id, "reused_issue": issue is not None, "email_status": email["status"]}


@_returns_errors
def attach_inspection_brief(case_id: str, brief: dict | str) -> dict:
    """InitialInspectionAgent: after SDP approves, save the technician's pre-inspection brief and move
    the case to EXTRA_INSPECTION (then book the visit with assign_technician). brief keys shown in the
    app: timeline [{at, text}], photoComparison, neighbouringUnits [{unitId, cases, last}],
    likelyComponents [...], checklist [...]. Returns {ok, status}."""
    if isinstance(brief, str):
        brief = _parse_guide(brief)
        if not isinstance(brief, dict):
            raise ToolError("brief must be a JSON object with timeline, photoComparison, neighbouringUnits, likelyComponents, checklist")
    if not brief.get("checklist"):
        raise ToolError("The brief needs a checklist")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("ESCALATION_PENDING", "EXTRA_INSPECTION"), "attach an inspection brief")
        if not conn.execute("SELECT 1 FROM approvals WHERE case_id = ? AND status = 'approved'", (case_id,)).fetchone():
            raise ToolError(f"Case {case_id} has no approved extra-inspection request")
        now = _now(conn)
        brief = {"generatedAt": now, **brief}
        conn.execute(
            "INSERT INTO inspection_briefs (case_id, brief, created_at) VALUES (?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET brief = excluded.brief, created_at = excluded.created_at",
            (case_id, json.dumps(brief), now),
        )
        _save(conn, case_id, status="EXTRA_INSPECTION", inspection_outcome=None, verdict_note=None, verdict_at=None)
        _emit(conn, case_id, "agent.step", f"Inspection brief ready: {len(brief['checklist'])}-point checklist", agent="InitialInspectionAgent")
    return {"ok": True, "status": "EXTRA_INSPECTION"}


def send_email(to: str, subject: str, body: str, case_id: Optional[str] = None) -> dict:
    """Send an email via Gmail SMTP, always save it to the outbox and record email.sent. Never raises.
    EMAIL_ENABLED=false only logs; EMAIL_REDIRECT_TO sends every email to one demo inbox.
    Returns {status: "sent" | "logged, not sent", email_id, error}."""
    sender = os.getenv("GMAIL_ADDRESS", "")
    password = os.getenv("GMAIL_APP_PASSWORD", "")
    redirect = os.getenv("EMAIL_REDIRECT_TO", "")
    status, error = "logged, not sent", None

    if os.getenv("EMAIL_ENABLED", "true").lower() != "true":
        error = "EMAIL_ENABLED is false"
    elif not sender or not password:
        error = "GMAIL_ADDRESS / GMAIL_APP_PASSWORD not set"
    else:
        try:
            msg = EmailMessage()
            msg["From"] = sender
            msg["To"] = redirect or to
            msg["Subject"] = f"[for {to}] {subject}" if redirect and redirect != to else subject
            msg.set_content(body)
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as smtp:
                smtp.login(sender, password)
                smtp.send_message(msg)
            status = "sent"
        except Exception as e:
            error = f"{type(e).__name__}: {e}"

    email_id = None
    try:
        with _connect() as conn:
            email_id = db.next_record_id(conn, "outbox")
            conn.execute(
                "INSERT INTO outbox (email_id, case_id, to_addr, subject, body, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (email_id, case_id, to, subject, body, status, error, _now(conn)),
            )
            _emit(conn, case_id, "email.sent", f"📧 Email to {to}: {subject}", to=to, subject=subject, status=status)
    except Exception as e:
        email_id = None
        error = f"{error + '; ' if error else ''}outbox write failed: {e}"
    return {"status": status, "email_id": email_id, "error": error}


@_returns_errors
def notify_buyer(case_id: str, title: str, body: str, email: bool = True) -> dict:
    """CommsAgent: post an update to the buyer's in-app inbox and, by default, email it. Run the
    liability guardrail on the text first. Returns {ok, message_id, email_status}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        buyer = conn.execute("SELECT email FROM buyers WHERE buyer_id = ?", (case["buyer_id"],)).fetchone()
        message_id = db.next_record_id(conn, "buyer_messages")
        conn.execute(
            "INSERT INTO buyer_messages (message_id, case_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
            (message_id, case_id, title, body, _now(conn)),
        )
        _emit(conn, case_id, "agent.step", f'Sent buyer update "{title}"', agent="CommsAgent")
    email_status = send_email(buyer["email"], f"[{case_id}] {title}", body, case_id)["status"] if email and buyer else None
    return {"ok": True, "message_id": message_id, "email_status": email_status}


@_returns_errors
def notify_technician(case_id: str, subject: str, body: str, technician_id: Optional[str] = None) -> dict:
    """Email the case's technician (or another worker, e.g. the support subcontractor) about a job.
    Returns {ok, to, email_status}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        worker = _worker(conn, technician_id or case["technician_id"])
    if worker is None:
        raise ToolError(f"Case {case_id} has no technician to notify")
    email = send_email(worker["email"], f"[{case_id}] {subject}", body, case_id)
    return {"ok": True, "to": worker["technician_id"], "email_status": email["status"]}


@_returns_errors
def log_agent_step(case_id: str, agent: str, message: str, data: Optional[dict] = None) -> dict:
    """Record what an agent did (agent.step event) for the SDP agent-trace page. Returns {ok, event_id}."""
    with _connect() as conn:
        _get_case(conn, case_id)
        event_id = _emit(conn, case_id, "agent.step", message, agent=agent, **({"data": data} if data else {}))
    return {"ok": True, "event_id": event_id}


# =====================================================================
# Human actions (buyer / technician / SDP screens). Not exposed over MCP:
# these are decisions a person makes, so an AI client must not take them.
# =====================================================================

@_returns_errors
def create_case(unit_id: str, buyer_id: str, description: str, preferred_slot: Optional[str] = None, photo: Optional[str] = None) -> dict:
    """Buyer reports a defect (-> SUBMITTED; intake runs next). preferred_slot: the visit time the buyer
    picked (ISO). photo: data URL or local file path. Returns {ok, case_id, status, preferred_visit_at, photo}."""
    if not description.strip():
        raise ToolError("Please describe the problem")
    with _connect() as conn:
        if not conn.execute("SELECT 1 FROM buyers WHERE buyer_id = ? AND unit_id = ?", (buyer_id, unit_id)).fetchone():
            raise ToolError(f"Unknown buyer {buyer_id} for unit {unit_id}")
        preferred = norm(preferred_slot) if preferred_slot else None
        case_id = _next_id(conn, "cases", "case_id", "C", 4)
        conn.execute(
            """INSERT INTO cases (case_id, unit_id, buyer_id, status, description, occurrence_count, reopen_count, preferred_visit_at, created_at)
               VALUES (?, ?, ?, 'SUBMITTED', ?, 1, 0, ?, ?)""",
            (case_id, unit_id, buyer_id, description.strip(), preferred, _now(conn)),
        )
        saved = _save_photo(conn, case_id, photo, "original")
        _emit(conn, case_id, "case.created", f"Buyer submitted a defect report{' with photo' if saved else ''}", preferred_visit_at=preferred)
    return {"ok": True, "case_id": case_id, "status": "SUBMITTED", "preferred_visit_at": preferred, "photo": saved}


@_returns_errors
def add_photo(case_id: str, photo: str, kind: str) -> dict:
    """Attach a photo (data URL or local path) to a case. kind: original | reopen | verdict | repair | verification."""
    with _connect() as conn:
        _get_case(conn, case_id)
        saved = _save_photo(conn, case_id, photo, kind)
    return {"ok": True, **saved}


@_returns_errors
def answer_follow_up(case_id: str, answer: str, photo: Optional[str] = None) -> dict:
    """Buyer answers IntakeAgent's question. Appends it to the description; the case stays INFO_NEEDED
    until intake runs again (save_intake_result). Returns {ok, description}."""
    if not answer.strip():
        raise ToolError("Please type an answer")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("INFO_NEEDED",), "answer a follow-up question")
        description = f"{case['description']}\n{answer.strip()}"
        _save(conn, case_id, description=description)
        _save_photo(conn, case_id, photo, "original")
    return {"ok": True, "description": description}


@_returns_errors
def respond_to_assignment(case_id: str, accept: bool, reason: str = "") -> dict:
    """Technician accepts or rejects a PENDING visit request.
    Accept -> booking CONFIRMED; ASSIGNED -> VISIT_SCHEDULED (EXTRA_INSPECTION stays).
    Reject (reason required) -> the held time is freed, the technician is cleared and the case goes back
    to SUBMITTED (REOPENED for a revisit; EXTRA_INSPECTION stays); TriageAgent then reassigns, skipping
    rejected_technicians. Returns {ok, status, booking_status, needs_reassignment, rejected_technicians}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        if case["booking_status"] != "PENDING":
            raise ToolError(f"Case {case_id} has no visit waiting for a response (booking_status={case['booking_status']})")
        if not accept and not reason.strip():
            raise ToolError("Give a reason for rejecting the visit")
        tech_id = case["technician_id"]
        tech = _worker(conn, tech_id)
        slot = conn.execute(
            "SELECT slot_id, start_at FROM slots WHERE case_id = ? AND kind = 'visit' AND technician_id = ? ORDER BY start_at DESC LIMIT 1",
            (case_id, tech_id),
        ).fetchone()
        now = _now(conn)
        conn.execute(
            "INSERT INTO assignment_history (assignment_id, case_id, technician_id, slot_id, outcome, rejected_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (db.next_record_id(conn, "assignment_history"), case_id, tech_id, slot["slot_id"] if slot else None,
             "ACCEPTED" if accept else "REJECTED", None if accept else reason.strip(), now),
        )
        when = f" for {fmt_datetime(slot['start_at'])}" if slot else ""
        if accept:
            status = case["status"] if case["status"] == "EXTRA_INSPECTION" else "VISIT_SCHEDULED"
            _save(conn, case_id, status=status, booking_status="CONFIRMED")
            _emit(conn, case_id, "booking.confirmed", f"{tech['name']} accepted the visit{when}", technician_id=tech_id)
        else:
            status = case["status"] if case["status"] == "EXTRA_INSPECTION" else "REOPENED" if (case["reopen_count"] or 0) > 0 else "SUBMITTED"
            _release(conn, case_id, "visit")
            _save(conn, case_id, status=status, booking_status="REJECTED", technician_id=None)
            _emit(conn, case_id, "booking.rejected", f"{tech['name']} rejected the visit{when}: {reason.strip()}",
                  technician_id=tech_id, reason=reason.strip())
        rejected = _declined_technicians(conn, case_id)
    return {"ok": True, "status": status, "booking_status": "CONFIRMED" if accept else "REJECTED",
            "needs_reassignment": not accept, "rejected_technicians": rejected}


@_returns_errors
def book_repair(case_id: str, start: str, technician_id: Optional[str] = None) -> dict:
    """Buyer books the repair after a VALID verdict, at a start time from get_booking_options(kind=repair).
    The job takes the repair plan's hours (several 2-hour blocks). technician_id: any worker free for that
    option; default is the extra inspection's subcontractor if free, else the first. Returns {ok, status, start, technician_id, repair_hours}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("VALID",), "book a repair")
        option = next((o for o in _repair_options(conn, case) if o["start"] == norm(start)), None)
        if option is None:
            raise ToolError("That repair time is no longer available. Please choose another.")
        worker_ids = [w["technician_id"] for w in option["workers"]]
        if technician_id and technician_id not in worker_ids:
            raise ToolError(f"{technician_id} is not free for the whole repair at {fmt_datetime(option['start'])}")
        worker_id = technician_id or (case["support_id"] if case.get("support_id") in worker_ids else worker_ids[0])
        plan = _case_repair_plan(case)
        _release(conn, case_id, "repair")
        for s in option["slots"]:
            _book(conn, case_id, worker_id, s, "repair")
        _save(conn, case_id, inspector_id=case.get("inspector_id") or case["technician_id"], technician_id=worker_id,
              repair_hours=plan["hours"], status="REPAIR_BOOKED")
        _emit(conn, case_id, "repair.booked", f"Repair booked for {fmt_datetime(option['start'])} with {_worker_label(_worker(conn, worker_id))}",
              technician_id=worker_id, start=option["start"])
    return {"ok": True, "status": "REPAIR_BOOKED", "start": option["start"], "technician_id": worker_id, "repair_hours": plan["hours"]}


@_returns_errors
def record_verdict(case_id: str, verdict: str, note: str, photo: Optional[str] = None) -> dict:
    """Technician's inspection result. VALID -> buyer books a repair. INVALID -> terminal (a new report
    becomes a new case). Returns {ok, status}."""
    if verdict not in ("VALID", "INVALID") or not note.strip():
        raise ToolError("Choose VALID or INVALID and add a note")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("VISIT_SCHEDULED", "EXTRA_INSPECTION"), "record a verdict")
        if case["booking_status"] in ("PENDING", "REJECTED", "NEEDS_STAFF"):
            raise ToolError(f"Cannot record a verdict: the visit for {case_id} isn't confirmed (booking_status={case['booking_status']})")
        _save_photo(conn, case_id, photo, "verdict")
        _finish(conn, case_id, "visit")
        now = _now(conn)
        fields = {"inspection_outcome": "VALID_DEFECT" if verdict == "VALID" else "NOT_A_DEFECT", "verdict_note": note.strip(),
                  "verdict_at": now, "inspector_id": case["technician_id"], "status": verdict}
        if verdict == "INVALID":
            fields["closed_at"] = now
        _save(conn, case_id, **fields)
        _emit(conn, case_id, "verdict.recorded", f'Technician marked {verdict}: "{note.strip()}"', verdict=verdict)
    return {"ok": True, "status": verdict}


@_returns_errors
def mark_repaired(case_id: str, repair_note: str, photo: Optional[str] = None) -> dict:
    """Technician marks the repair done (-> REPAIRED, repair.done). VerificationAgent then calls
    start_verification. repair_note should say what was fixed and where. Returns {ok, status}."""
    if not repair_note.strip():
        raise ToolError("Add a repair note")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("REPAIR_BOOKED",), "mark repaired")
        _save_photo(conn, case_id, photo, "repair")
        _finish(conn, case_id, "repair")
        _save(conn, case_id, status="REPAIRED", repair_note=repair_note.strip(), repaired_at=_now(conn),
              buyer_signed=0, developer_signed=0, buyer_signed_at=None, buyer_signoff_note=None, developer_signed_at=None,
              developer_signed_by=None, signoff_reminder_at=None, auto_closed_at=None, signoff_overdue_at=None,
              verification_status="pending")
        _emit(conn, case_id, "repair.done", f'Technician marked repaired: "{repair_note.strip()}"')
    return {"ok": True, "status": "REPAIRED"}


@_returns_errors
def record_verification(case_id: str, outcome: str, note: str = "", photo: Optional[str] = None) -> dict:
    """Buyer's check of the repair. FIXED -> buyer sign-off (closes if the developer signed).
    NOT_FIXED (photo required) -> REOPENED; RecurrenceAgent runs next. CANNOT_VERIFY -> stays PENDING_SIGNOFF.
    Returns {ok, outcome, status, reopen_count?}."""
    if outcome not in ("FIXED", "NOT_FIXED", "CANNOT_VERIFY"):
        raise ToolError(f"Invalid outcome {outcome!r} (use FIXED / NOT_FIXED / CANNOT_VERIFY)")
    if outcome == "NOT_FIXED" and not photo:
        raise ToolError("Please add a new photo showing the problem")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("PENDING_SIGNOFF",), "record verification")
        if outcome == "FIXED" and not case["developer_signed_at"]:
            raise ToolError("The developer has to sign off before the buyer")
        now = _now(conn)
        saved = _save_photo(conn, case_id, photo, "reopen" if outcome == "NOT_FIXED" else "verification")
        v = conn.execute(
            "SELECT verification_id FROM verifications WHERE case_id = ? ORDER BY created_at DESC, verification_id DESC LIMIT 1", (case_id,)
        ).fetchone()
        if v:
            conn.execute(
                "UPDATE verifications SET outcome = ?, evidence_notes = ?, photo_path = ?, completed_at = ? WHERE verification_id = ?",
                (outcome, note, saved["path"] if saved else None, now, v["verification_id"]),
            )
        _emit(conn, case_id, "verification.completed",
              f"Buyer verification: {outcome.replace('_', ' ').lower()}" + (f' — "{note}"' if note else ""), outcome=outcome)
        result = {"ok": True, "outcome": outcome, "status": "PENDING_SIGNOFF"}
        if outcome == "FIXED":
            _save(conn, case_id, buyer_signed=1, buyer_signed_at=now, buyer_signoff_note=note, verification_status="verified")
            _emit(conn, case_id, "signoff.completed", "Buyer signed off the repair", party="buyer")
            if _close_if_both_signed(conn, case_id):
                result["status"] = "CLOSED"
        elif outcome == "NOT_FIXED":
            _save(conn, case_id, verification_status="not_verified")
            result.update(status="REOPENED", reopen_count=_reopen(conn, case, note or "Buyer verification failed: still not fixed"))
    return result


@_returns_errors
def record_signoff(case_id: str, party: str = "developer", signed_by: Optional[str] = None, note: str = "") -> dict:
    """Developer (SDP) or buyer sign-off while PENDING_SIGNOFF; closes the case when both have signed.
    Buyers normally sign through record_verification(FIXED). Returns {ok, both_signed, status}."""
    if party not in ("developer", "buyer"):
        raise ToolError(f"Invalid party {party!r} (use developer / buyer)")
    with _connect() as conn:
        case = _get_case(conn, case_id)
        _require_status(case, ("PENDING_SIGNOFF",), "sign off")
        now = _now(conn)
        if party == "developer":
            by = signed_by or SDP_SIGNER
            _save(conn, case_id, developer_signed=1, developer_signed_at=now, developer_signed_by=by)
            _emit(conn, case_id, "signoff.completed", f"Developer signed off ({by})", party="developer")
        else:
            if not case["developer_signed_at"]:
                raise ToolError("The developer has to sign off before the buyer")
            _save(conn, case_id, buyer_signed=1, buyer_signed_at=now, buyer_signoff_note=note)
            _emit(conn, case_id, "signoff.completed", "Buyer signed off the repair", party="buyer")
        closed = _close_if_both_signed(conn, case_id)
    return {"ok": True, "both_signed": closed, "status": "CLOSED" if closed else "PENDING_SIGNOFF"}


@_returns_errors
def reopen_case(case_id: str, description: str, photo: str) -> dict:
    """Buyer reopens a CLOSED case within the grace period (rules.yaml grace_period_days, counted on the
    demo clock from closed_at) with a mandatory new photo (-> REOPENED; RecurrenceAgent runs next).
    INVALID cases can't be reopened. Returns {ok, status, reopen_count}."""
    with _connect() as conn:
        case = _get_case(conn, case_id)
        if case["status"] != "CLOSED" or not case["closed_at"] or days_between(case["closed_at"], _now(conn)) > config.GRACE_PERIOD_DAYS:
            raise ToolError(f"Only closed cases can be reopened, within {config.GRACE_PERIOD_DAYS} days of closing")
        if not photo:
            raise ToolError("A new photo is required to reopen")
        _save_photo(conn, case_id, photo, "reopen")
        count = _reopen(conn, case, description.strip() or "Problem came back")
    return {"ok": True, "status": "REOPENED", "reopen_count": count}


@_returns_errors
def decide_approval(approval_id: str, approve: bool, decided_by: Optional[str] = None) -> dict:
    """SDP staff decision on an extra-inspection request. Approved: inspection.approved; InitialInspectionAgent
    then attaches the brief and the visit is booked; systemic issue -> under_inspection. Rejected: case back
    to VALID for a normal repair booking; systemic issue -> monitoring. Returns {ok, status, case_id}."""
    status = "approved" if approve else "rejected"
    with _connect() as conn:
        a = conn.execute("SELECT * FROM approvals WHERE approval_id = ?", (approval_id,)).fetchone()
        if a is None or a["status"] != "pending":
            raise ToolError("This request has already been decided" if a else f"Approval {approval_id!r} not found")
        case_id = a["case_id"]
        conn.execute("UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE approval_id = ?",
                     (status, decided_by or SDP_SIGNER, _now(conn), approval_id))
        conn.execute("UPDATE systemic_issues SET status = ? WHERE approval_id = ?", ("under_inspection" if approve else "monitoring", approval_id))
        if approve:
            _emit(conn, case_id, "inspection.approved", f"SDP approved extra inspection ({approval_id})")
        else:
            _save(conn, case_id, status="VALID")
            _emit(conn, case_id, "inspection.rejected", "SDP rejected extra inspection: normal repair booking")
    return {"ok": True, "status": status, "case_id": case_id}
