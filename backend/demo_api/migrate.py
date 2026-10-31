"""Keep existing databases aligned with schema.sql and apply demo data repairs."""
import json
import shutil
import sqlite3

import db

from . import config

# schema.sql is the source of truth; these definitions only backfill older databases.
CASE_COLUMNS = {
    "assignment_attempts": "INTEGER DEFAULT 0",
    "preferred_visit_at": "TEXT",
    "inspector_id": "TEXT",          # technician who did the inspection visit (kept after the repair is reassigned)
    "support_id": "TEXT",            # subcontractor joining an approved extra inspection
    "repair_hours": "REAL",          # estimated repair duration when booked
    "repair_estimate_reason": "TEXT",  # why RepairEstimateAgent set repair_hours (tools.set_repair_estimate)
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
}
TECHNICIAN_COLUMNS = {"kind": "TEXT DEFAULT 'technician'", "company": "TEXT"}
ASSIGNMENT_COLUMNS = {"job": "TEXT"}  # inspection visit | detailed inspection | repair

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


def reset_demo() -> None:
    """Reset demo: copy seed.db over the live DB, delete uploaded photos, and re-apply this migration."""
    db.reset_db()
    uploads = db.ROOT / "uploads"
    if uploads.is_dir():
        shutil.rmtree(uploads)
    uploads.mkdir(exist_ok=True)
    with db.get_conn() as conn:
        migrate(conn)


def migrate(conn: sqlite3.Connection) -> None:
    """Backfill schema.sql columns on old databases, then repair demo seed data."""
    _add_columns(conn, "cases", CASE_COLUMNS)
    _add_columns(conn, "technicians", TECHNICIAN_COLUMNS)
    _add_columns(conn, "assignment_history", ASSIGNMENT_COLUMNS)
    conn.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)")
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

    # Seeded cases: the technician on a case with a verdict did the inspection.
    conn.execute("UPDATE cases SET inspector_id = technician_id WHERE inspector_id IS NULL AND verdict_at IS NOT NULL")
    _repair_seed_data(conn)

    # Demo clock runs on real time; "Skip days" adds to this offset.
    conn.execute("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('clock_offset_days', '0')")
