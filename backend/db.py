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


def ensure_db() -> None:
    """Restore from seed.db if the live DB is missing; otherwise create an empty schema."""
    if DB_PATH.exists():
        return
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SEED_DB_PATH.exists():
        shutil.copyfile(SEED_DB_PATH, DB_PATH)
    else:
        init_schema()


def reset_db() -> None:
    """Demo 'Reset' button: copy seed.db over simephony.db (also clears outbox)."""
    for suffix in ("", "-wal", "-shm"):
        Path(f"{DB_PATH}{suffix}").unlink(missing_ok=True)
    ensure_db()
