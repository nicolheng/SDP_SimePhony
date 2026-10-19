"""Add what the web app needs on top of schema.sql. Idempotent; runs at API startup and after Reset demo."""
import json
import sqlite3

from . import config
from .timeutil import norm

# column -> SQL type, added only if missing
CASE_COLUMNS = {
    "inspector_id": "TEXT",          # technician who did the inspection visit (kept after the repair is reassigned)
    "support_id": "TEXT",            # subcontractor joining an approved extra inspection
    "repair_hours": "REAL",          # estimated repair duration when booked
    "signoff_reminder_at": "TEXT",   # in-app sign-off reminder sent
    "auto_closed_at": "TEXT",        # closed automatically after the sign-off period
    "signoff_overdue_at": "TEXT",    # high urgency past the sign-off period: flagged to SDP
}
TECHNICIAN_COLUMNS = {"kind": "TEXT DEFAULT 'technician'", "company": "TEXT"}


def _add_columns(conn: sqlite3.Connection, table: str, cols: dict[str, str]) -> None:
    have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
    for name, typ in cols.items():
        if name not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {typ}")


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

    # Demo clock starts at the newest seeded case.
    if not conn.execute("SELECT 1 FROM app_meta WHERE key = 'now'").fetchone():
        latest = conn.execute("SELECT MAX(created_at) AS m FROM cases").fetchone()["m"]
        if latest:
            conn.execute("INSERT INTO app_meta (key, value) VALUES ('now', ?)", (norm(latest),))
