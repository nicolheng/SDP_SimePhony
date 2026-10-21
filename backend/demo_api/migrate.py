"""Add what the web app needs on top of schema.sql. Idempotent; runs at API startup and after Reset demo."""
import json
import shutil
import sqlite3

import db

from . import config

# column -> SQL type, added only if missing
CASE_COLUMNS = {
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
}
TECHNICIAN_COLUMNS = {"kind": "TEXT DEFAULT 'technician'", "company": "TEXT"}


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
    _add_columns(conn, "cases", CASE_COLUMNS)
    _add_columns(conn, "technicians", TECHNICIAN_COLUMNS)
    conn.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)")

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
