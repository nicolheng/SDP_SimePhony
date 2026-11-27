"""Shared SQLite access (owner: P3). Every part of the code opens the DB through here."""
import os
import re
import shutil
import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / os.getenv("DB_PATH", "data/simephony.db")
SEED_DB_PATH = ROOT / os.getenv("SEED_DB_PATH", "data/seed.db")
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# ---- Per-visitor demo databases (hosted demo) ----
# DEMO_SESSIONS=true gives every browser its own copy of seed.db (data/sessions/<id>/simephony.db) and its own
# uploads/<id>/ folder, picked by the id the web app sends. Off (default): one shared DB_PATH, as on a laptop.
SESSIONS_ENABLED = os.getenv("DEMO_SESSIONS", "").strip().lower() in ("1", "true", "yes")
SESSIONS_DIR = ROOT / os.getenv("SESSIONS_DIR", "data/sessions")
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")  # also keeps ids safe to use as folder names
_session: ContextVar[str | None] = ContextVar("demo_session", default=None)


def set_session(session_id: str | None):
    """Use this visitor's database for the current request or thread. Returns a token for reset_session."""
    if session_id is not None and not SESSION_ID_RE.match(session_id):
        raise ValueError("Invalid session id")
    return _session.set(session_id)


def reset_session(token) -> None:
    _session.reset(token)


def session_id() -> str | None:
    return _session.get() if SESSIONS_ENABLED else None


def current_db_path() -> Path:
    sid = session_id()
    return SESSIONS_DIR / sid / "simephony.db" if sid else DB_PATH


def scoped_dir(base: Path) -> Path:
    """base, or base/<session id> for a visitor's own files (uploaded photos)."""
    sid = session_id()
    return base / sid if sid else base


def scoped_url(prefix: str, name: str) -> str:
    sid = session_id()
    return f"{prefix}/{sid}/{name}" if sid else f"{prefix}/{name}"


# Paths default to None and resolve to DB_PATH at call time, so tests can point DB_PATH elsewhere.
def connect(path: Path | None = None) -> sqlite3.Connection:
    # timeout = busy wait: an agent and the web app may write at the same moment (default 5 s was short).
    conn = sqlite3.connect(path or current_db_path(), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_conn(path: Path | None = None):
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


@contextmanager
def write_conn(path: Path | None = None):
    """get_conn that takes the write lock up front (BEGIN IMMEDIATE), so the busy timeout always applies and
    read-then-write steps are atomic. Keep it short (no LLM calls): every other writer waits for it."""
    with get_conn(path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        yield conn


def is_busy(error: BaseException) -> bool:
    """True for SQLITE_BUSY / SQLITE_LOCKED: another connection held the write lock past the busy timeout."""
    code = getattr(error, "sqlite_errorcode", None)
    return isinstance(error, sqlite3.OperationalError) and code is not None and \
        (code & 0xFF) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)


def init_schema(path: Path | None = None) -> None:
    with get_conn(path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


UNIT_SIGNOFFS_TABLE = """CREATE TABLE IF NOT EXISTS unit_signoffs (
    record_id       TEXT PRIMARY KEY,          -- e.g. RR-0001: one defect rectification record per unit sign-off
    unit_id         TEXT NOT NULL REFERENCES units(unit_id),
    buyer_id        TEXT REFERENCES buyers(buyer_id),
    kind            TEXT NOT NULL,             -- signed (buyer signed off) | auto_closed (no sign-off within the period)
    signed_at       TEXT NOT NULL,             -- ISO 8601: buyer sign-off, or the deadline for auto_closed
    case_ids        TEXT NOT NULL,             -- JSON list of the defects this sign-off closed
    note            TEXT,                      -- buyer's sign-off note
    rating          INTEGER,                   -- 1-5, the buyer's rating of this sign-off
    rating_comment  TEXT,
    rated_at        TEXT
)"""


def ensure_unit_signoffs(conn: sqlite3.Connection) -> None:
    """Create unit_signoffs (defect rectification records) on databases made before it existed."""
    conn.execute(UNIT_SIGNOFFS_TABLE)


def next_record_id(conn: sqlite3.Connection, table: str) -> str:
    """Return the next prefixed ID (e.g. CE-0042) for a table with prefixed text IDs."""
    identifiers = {
        "cases": ("case_id", "C"),
        "case_events": ("event_id", "CE"),
        "case_photos": ("photo_id", "CP"),
        "buyer_messages": ("message_id", "BM"),
        "outbox": ("email_id", "OB"),
        "verifications": ("verification_id", "V"),
        "assignment_history": ("assignment_id", "AH"),
        "unit_signoffs": ("record_id", "RR"),
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
    target = current_db_path()
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        if SEED_DB_PATH.exists():
            shutil.copyfile(SEED_DB_PATH, target)
    init_schema(target)


def reset_db() -> None:
    """Demo 'Reset' button: copy seed.db over simephony.db (also clears outbox)."""
    for suffix in ("", "-wal", "-shm"):
        Path(f"{current_db_path()}{suffix}").unlink(missing_ok=True)
    ensure_db()


# ---- session bookkeeping (hosted demo) ----
import threading
import time

MAX_SESSIONS = int(os.getenv("MAX_SESSIONS", "300"))
SESSION_TTL_S = int(os.getenv("SESSION_TTL_HOURS", "24")) * 3600
_ready_sessions: set[str] = set()
_sessions_lock = threading.Lock()


def session_ready(sid: str) -> bool:
    return sid in _ready_sessions and (SESSIONS_DIR / sid / "simephony.db").exists()


def mark_session_ready(sid: str) -> None:
    with _sessions_lock:
        _ready_sessions.add(sid)


def list_sessions() -> list[str]:
    if not SESSIONS_DIR.is_dir():
        return []
    return [p.name for p in SESSIONS_DIR.iterdir() if p.is_dir() and SESSION_ID_RE.match(p.name)]


def _last_used(sid: str) -> float:
    try:
        return max(f.stat().st_mtime for f in (SESSIONS_DIR / sid).glob("simephony.db*"))
    except ValueError:
        return 0.0


def cleanup_sessions() -> None:
    """Delete visitors' databases and photos idle past SESSION_TTL_HOURS, and the oldest ones above MAX_SESSIONS
    (the free host has little disk). A visitor who comes back later simply starts from a fresh copy."""
    now = time.time()
    sids = sorted(list_sessions(), key=_last_used)
    doomed = [s for s in sids if now - _last_used(s) > SESSION_TTL_S]
    survivors = [s for s in sids if s not in doomed]
    doomed += survivors[: max(0, len(survivors) - MAX_SESSIONS)]
    for sid in doomed:
        shutil.rmtree(SESSIONS_DIR / sid, ignore_errors=True)
        shutil.rmtree(ROOT / os.getenv("UPLOADS_DIR", "uploads") / sid, ignore_errors=True)
        with _sessions_lock:
            _ready_sessions.discard(sid)
