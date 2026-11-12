"""Keep existing databases aligned with schema.sql and apply demo data repairs."""
import json
import shutil
import sqlite3

import db

from . import config
from .timeutil import add_days, days_between, demo_now, parse

# schema.sql is the source of truth; these definitions only backfill older databases.
CASE_COLUMNS = {
    "assignment_attempts": "INTEGER DEFAULT 0",
    "preferred_visit_at": "TEXT",
    "inspector_id": "TEXT",          # technician who did the inspection visit (kept after the repair is reassigned)
    "support_id": "TEXT",            # subcontractor joining an approved extra inspection
    "repair_hours": "REAL",          # estimated repair duration when booked
    "repair_estimate_reason": "TEXT",  # why RepairEstimateAgent set repair_hours (tools.set_repair_estimate)
    "repair_photo_check": "TEXT",    # VerificationAgent's photo check (JSON), shown at the developer sign-off
    "signoff_reminder_at": "TEXT",   # in-app sign-off reminder sent
    "auto_closed_at": "TEXT",        # closed automatically after the sign-off period
    "signoff_overdue_at": "TEXT",    # high urgency past the sign-off period: flagged to SDP
    "booking_status": "TEXT",        # PENDING until the assigned worker accepts, then CONFIRMED
    "handed_over_from": "TEXT",      # worker who handed the current job over (couldn't make it)
    "handover_reason": "TEXT",
    "handed_over_at": "TEXT",
    "handover_prev_slot": "TEXT",    # job start before the hand-over (same as now if the time was kept)
    "buyer_rating": "INTEGER",       # buyer satisfaction 1-5, asked after sign-off
    "buyer_rating_comment": "TEXT",
    "buyer_rated_at": "TEXT",
    "pin_x": "REAL",                 # buyer's pin on the unit floor plan (fractions of its width / height)
    "pin_y": "REAL",
    "pin_room": "TEXT",              # room the pin falls in, or "Whole unit"
}
TECHNICIAN_COLUMNS = {"kind": "TEXT DEFAULT 'technician'", "company": "TEXT"}
UNIT_COLUMNS = {"vp_date": "TEXT"}  # vacant possession date; the defect liability period runs from it
ASSIGNMENT_COLUMNS = {"job": "TEXT"}  # inspection visit | detailed inspection | repair
EVENT_COLUMNS = {"id": "INTEGER"}

INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_cases_unit_status ON cases(unit_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_cases_unit_created ON cases(unit_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_cases_status_signoff ON cases(status, buyer_signed_at, developer_signed_at)",
    "CREATE INDEX IF NOT EXISTS idx_events_case_created ON case_events(case_id, created_at, event_id)",
    "CREATE INDEX IF NOT EXISTS idx_assignment_history_case_created "
    "ON assignment_history(case_id, created_at, assignment_id)",
    "CREATE INDEX IF NOT EXISTS idx_slots_case_kind_tech_start "
    "ON slots(case_id, kind, technician_id, start_at)",
    "CREATE INDEX IF NOT EXISTS idx_slots_technician_start ON slots(technician_id, start_at)",
    "CREATE INDEX IF NOT EXISTS idx_verifications_case_created "
    "ON verifications(case_id, created_at DESC, verification_id DESC)",
    "CREATE INDEX IF NOT EXISTS idx_case_photos_case_kind_created "
    "ON case_photos(case_id, kind, created_at DESC, photo_id DESC)",
    "CREATE INDEX IF NOT EXISTS idx_approvals_case_status_created "
    "ON approvals(case_id, status, created_at DESC)",
)


def _add_columns(conn: sqlite3.Connection, table: str, cols: dict[str, str]) -> None:
    have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
    for name, typ in cols.items():
        if name not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {typ}")


def _repair_seed_data(conn: sqlite3.Connection) -> None:
    """Fix inconsistencies in seed.db (fixed in backend/seed/seed_history.py too, for the next regeneration)."""
    # slots holds bookings only; available times come from config.SLOT_TIMES. Remove the seeded empty rows
    # (and the empty rows older code left when it released a booking).
    conn.execute("UPDATE assignment_history SET slot_id = NULL WHERE slot_id IN (SELECT slot_id FROM slots WHERE case_id IS NULL)")
    conn.execute("DELETE FROM slots WHERE case_id IS NULL")
    # Repair photos were stored as kind 'verdict'.
    conn.execute("UPDATE case_photos SET kind = 'repair' WHERE path GLOB 'sample_*_repair.jpg' AND kind <> 'repair'")
    # Verification rows name photo files that were never created; the web app keeps photos in case_photos.
    conn.execute("UPDATE verifications SET photo_path = NULL WHERE photo_path GLOB 'verification_*'")
    # Sign-off flags set without a time: the screens and rules go by the timestamps, so fill them in.
    signer = f"{config.SDP_STAFF_NAME}, {config.SDP_STAFF_TITLE}"
    conn.execute(
        """UPDATE cases SET developer_signed_at = COALESCE(closed_at, buyer_signed_at, repaired_at, verdict_at, created_at),
           developer_signed_by = COALESCE(developer_signed_by, ?) WHERE developer_signed = 1 AND developer_signed_at IS NULL""",
        (signer,),
    )
    conn.execute("UPDATE cases SET buyer_signed_at = COALESCE(closed_at, repaired_at, created_at) WHERE buyer_signed = 1 AND buyer_signed_at IS NULL")
    conn.execute("UPDATE cases SET developer_signed = 1 WHERE developer_signed_at IS NOT NULL AND COALESCE(developer_signed, 0) = 0")
    conn.execute("UPDATE cases SET buyer_signed = 1 WHERE buyer_signed_at IS NOT NULL AND COALESCE(buyer_signed, 0) = 0")
    conn.execute("UPDATE cases SET verification_status = 'verified' WHERE buyer_signed_at IS NOT NULL AND verification_status = 'pending'")


# The job a case was on at a given moment: the latest of these milestones before it.
_JOB_MILESTONES = {"case.created": "inspection visit", "case.reopened": "inspection visit",
                   "inspection.approved": "detailed inspection", "repair.booked": "repair"}


def _infer_assignment_jobs(conn: sqlite3.Connection) -> None:
    """Fill assignment_history.job for rows written before it was recorded, from the case's timeline.
    The first run also re-infers every existing row, correcting an earlier guess that called them all inspection visits."""
    first = not conn.execute("SELECT 1 FROM app_meta WHERE key = 'assignment_jobs_inferred'").fetchone()
    types = ", ".join(f"'{t}'" for t in _JOB_MILESTONES)
    rows = conn.execute(f"SELECT assignment_id, case_id, created_at FROM assignment_history{'' if first else ' WHERE job IS NULL'}").fetchall()
    for r in rows:
        m = conn.execute(
            f"""SELECT type FROM case_events WHERE case_id = ? AND type IN ({types}) AND julianday(created_at) <= julianday(?)
                ORDER BY julianday(created_at) DESC, event_id DESC LIMIT 1""",
            (r["case_id"], r["created_at"]),
        ).fetchone()
        conn.execute("UPDATE assignment_history SET job = ? WHERE assignment_id = ?",
                     (_JOB_MILESTONES[m["type"]] if m else "inspection visit", r["assignment_id"]))
    conn.execute("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('assignment_jobs_inferred', '1')")


def _repair_days(n: int) -> int:
    """Seeded repair time for historical case H-<n>: mostly 4-22 days, about 1 in 7 past the 30-day limit (33-47)."""
    return 33 + n % 15 if n % 7 == 3 else 4 + (n * 7) % 19


def _spread_seed_repair_times(conn: sqlite3.Connection) -> None:
    """seed.db repairs every historical case exactly 5 days after the report, so the 30-day repair clock showed 100%
    on time. Once, give closed history cases varied repair times (some late) and move the later milestones
    (sign-offs, closing, their events) after the repair, keeping each case's own gap between repair and closing."""
    if conn.execute("SELECT 1 FROM app_meta WHERE key = 'seed_repair_times_spread'").fetchone():
        return
    now = demo_now(conn)
    rows = conn.execute(
        """SELECT case_id, created_at, repaired_at, closed_at FROM cases
           WHERE case_id GLOB 'H-[0-9]*' AND status = 'CLOSED' AND COALESCE(reopen_count, 0) = 0
             AND repaired_at IS NOT NULL AND closed_at IS NOT NULL
             AND ABS(julianday(repaired_at) - julianday(created_at) - 5) < 0.01""").fetchall()
    for r in rows:
        repaired = add_days(r["created_at"], _repair_days(int(r["case_id"][2:])))
        closed = add_days(repaired, max(1.0, days_between(r["repaired_at"], r["closed_at"])))
        if parse(closed) >= parse(now):
            continue  # recent history: keep it as seeded rather than close it in the future
        cid = r["case_id"]
        conn.execute(
            """UPDATE cases SET repaired_at = ?, closed_at = ?,
                   buyer_signed_at = CASE WHEN buyer_signed_at IS NULL THEN NULL ELSE ? END,
                   developer_signed_at = CASE WHEN developer_signed_at IS NULL THEN NULL ELSE ? END
               WHERE case_id = ?""", (repaired, closed, closed, closed, cid))
        conn.execute("UPDATE case_events SET created_at = ? WHERE case_id = ? AND type IN ('repair.done', 'verification.requested')",
                     (repaired, cid))
        conn.execute("""UPDATE case_events SET created_at = ? WHERE case_id = ?
                        AND type IN ('verification.completed', 'signoff.completed', 'case.closed')""", (closed, cid))
        conn.execute("UPDATE verifications SET created_at = ?, completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE ? END WHERE case_id = ?",
                     (repaired, closed, cid))
    conn.execute("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('seed_repair_times_spread', '1')")


def reset_demo() -> None:
    """Reset demo: copy seed.db over the live DB, delete uploaded photos, and re-apply this migration."""
    db.reset_db()
    uploads = db.scoped_dir(db.ROOT / "uploads")
    if uploads.is_dir():
        shutil.rmtree(uploads)
    uploads.mkdir(parents=True, exist_ok=True)
    with db.get_conn() as conn:
        migrate(conn)


def migrate(conn: sqlite3.Connection) -> None:
    """Backfill schema.sql columns on old databases, then repair demo seed data."""
    _add_columns(conn, "cases", CASE_COLUMNS)
    _add_columns(conn, "technicians", TECHNICIAN_COLUMNS)
    _add_columns(conn, "units", UNIT_COLUMNS)
    _add_columns(conn, "assignment_history", ASSIGNMENT_COLUMNS)
    _add_columns(conn, "case_events", EVENT_COLUMNS)
    conn.execute("UPDATE case_events SET id = CAST(SUBSTR(event_id, 4) AS INTEGER) WHERE id IS NULL")
    conn.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)")
    db.ensure_unit_signoffs(conn)
    for statement in INDEXES:
        conn.execute(statement)
    _infer_assignment_jobs(conn)
    conn.execute(
        "UPDATE cases SET status = 'VISIT_SCHEDULED', booking_status = 'PENDING' WHERE status = 'ASSIGNED'"
    )

    # Seeded technicians are in-house; add the demo subcontractors once.
    conn.execute("UPDATE technicians SET kind = 'technician' WHERE kind IS NULL")
    for s in config.SUBCONTRACTORS:
        conn.execute(
            """INSERT OR IGNORE INTO technicians (technician_id, name, email, skills, blocks, kind, company)
               VALUES (?, ?, ?, ?, ?, 'subcontractor', ?)""",
            (s["technician_id"], s["name"], s["email"], json.dumps(s["skills"]), json.dumps(s["blocks"]), s["company"]),
        )

    consolidate_workforce(conn)
    backfill_unit_signoffs(conn)

    # Demo vacant possession dates, handed over block by block (seed.db has none).
    for block, vp in config.DEMO_VP_DATES.items():
        conn.execute("UPDATE units SET vp_date = ? WHERE block = ? AND vp_date IS NULL", (vp, block))

    # Seeded cases: the technician on a case with a verdict did the inspection.
    conn.execute("UPDATE cases SET inspector_id = technician_id WHERE inspector_id IS NULL AND verdict_at IS NOT NULL")
    _repair_seed_data(conn)

    # Demo clock runs on real time; "Skip days" adds to this offset.
    conn.execute("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('clock_offset_days', '0')")
    _spread_seed_repair_times(conn)


def consolidate_workforce(conn) -> None:
    """The demo workforce is one in-house technician and one subcontractor (config.IN_HOUSE_TECHNICIAN,
    config.SUBCONTRACTORS), with the whole job scope between them. Every job, booking and history row of a retired
    worker (config.RETIRED_WORKERS) moves to its keeper, then the retired worker is removed. Idempotent; workers added
    later are left alone."""
    tech = config.IN_HOUSE_TECHNICIAN
    if conn.execute("SELECT 1 FROM technicians WHERE technician_id = ?", (tech["technician_id"],)).fetchone() is None:
        return  # not a SimePhony demo database (e.g. an empty test schema)
    conn.execute("UPDATE technicians SET skills = ?, blocks = ? WHERE technician_id = ?",
                 (json.dumps(tech["skills"]), json.dumps(tech["blocks"]), tech["technician_id"]))
    for s in config.SUBCONTRACTORS:
        conn.execute("UPDATE technicians SET skills = ?, blocks = ?, company = ? WHERE technician_id = ?",
                     (json.dumps(s["skills"]), json.dumps(s["blocks"]), s["company"], s["technician_id"]))
    for old, new in config.RETIRED_WORKERS.items():
        for table, col in (("cases", "technician_id"), ("cases", "inspector_id"), ("cases", "support_id"),
                           ("cases", "handed_over_from"), ("slots", "technician_id"), ("assignment_history", "technician_id")):
            conn.execute(f"UPDATE {table} SET {col} = ? WHERE {col} = ?", (new, old))
        conn.execute("DELETE FROM technicians WHERE technician_id = ?", (old,))


def backfill_unit_signoffs(conn) -> None:
    """One defect rectification record per unit sign-off (unit_signoffs). Cases signed off or auto-closed before the
    table existed are grouped by unit and time, as tools.sign_off_unit / sweep_signoffs now record them. Idempotent:
    a group that already has a record is skipped."""
    import db

    existing = {(r[0], r[1]) for r in conn.execute("SELECT unit_id, signed_at FROM unit_signoffs")}
    groups = conn.execute(
        """SELECT unit_id, 'signed' AS kind, buyer_signed_at AS at FROM cases WHERE buyer_signed_at IS NOT NULL
           UNION SELECT unit_id, 'auto_closed', auto_closed_at FROM cases WHERE auto_closed_at IS NOT NULL AND buyer_signed_at IS NULL
           ORDER BY at""").fetchall()
    for unit_id, kind, at in groups:
        if (unit_id, at) in existing:
            continue
        field = "buyer_signed_at" if kind == "signed" else "auto_closed_at"
        rows = conn.execute(
            f"""SELECT case_id, buyer_id, buyer_signoff_note, buyer_rating, buyer_rating_comment, buyer_rated_at FROM cases
                WHERE unit_id = ? AND {field} = ? ORDER BY case_id""", (unit_id, at)).fetchall()
        if not rows:
            continue
        rated = next((r for r in rows if r[3] is not None), None)
        conn.execute(
            """INSERT INTO unit_signoffs (record_id, unit_id, buyer_id, kind, signed_at, case_ids, note, rating, rating_comment, rated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (db.next_record_id(conn, "unit_signoffs"), unit_id, rows[0][1], kind, at, json.dumps([r[0] for r in rows]),
             rows[0][2], rated[3] if rated else None, rated[4] if rated else None, rated[5] if rated else None))
        existing.add((unit_id, at))
