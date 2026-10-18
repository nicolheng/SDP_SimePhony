"""Shared SQLite access (owner: P3). Every part of the code opens the DB through here."""
import os
import shutil
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / os.getenv("DB_PATH", "data/simephony.db")
SEED_DB_PATH = ROOT / os.getenv("SEED_DB_PATH", "data/seed.db")
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_conn(path: Path = DB_PATH):
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_schema(path: Path = DB_PATH) -> None:
    with get_conn(path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        case_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(cases)")
        }
        if "assignment_attempts" not in case_columns:
            conn.execute(
                "ALTER TABLE cases ADD COLUMN assignment_attempts INTEGER DEFAULT 0"
            )
        if "booking_status" not in case_columns:
            conn.execute("ALTER TABLE cases ADD COLUMN booking_status TEXT")


def next_record_id(conn: sqlite3.Connection, table: str) -> str:
    """Return the next prefixed ID for a supported event, photo, message, or email table."""
    identifiers = {
        "case_events": ("event_id", "CE"),
        "case_photos": ("photo_id", "CP"),
        "buyer_messages": ("message_id", "BM"),
        "outbox": ("email_id", "OB"),
    }
    if table not in identifiers:
        raise ValueError(f"Unsupported record ID table: {table}")
    id_column, prefix = identifiers[table]
    last_id = conn.execute(
        f"""
        SELECT {id_column} FROM {table}
        WHERE {id_column} GLOB ?
        ORDER BY CAST(substr({id_column}, ?) AS INTEGER) DESC
        LIMIT 1
        """,
        (f"{prefix}-[0-9]*", len(prefix) + 2),
    ).fetchone()
    next_number = int(last_id[id_column][len(prefix) + 1:]) + 1 if last_id else 1
    return f"{prefix}-{next_number:04d}"


def ensure_db() -> None:
    """Restore from seed.db if the live DB is missing; otherwise create an empty schema."""
    if not DB_PATH.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        if SEED_DB_PATH.exists():
            shutil.copyfile(SEED_DB_PATH, DB_PATH)
    init_schema(DB_PATH)


def reset_db() -> None:
    """Demo 'Reset' button: copy seed.db over simephony.db (also clears outbox)."""
    for suffix in ("", "-wal", "-shm"):
        Path(f"{DB_PATH}{suffix}").unlink(missing_ok=True)
    ensure_db()
