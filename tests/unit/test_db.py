# backend/db.py: shared SQLite connection settings
from backend import db


def test_connection_waits_for_a_locked_db(tmp_path):
    # An agent and the web app can write at the same moment: wait up to 30 s instead of failing fast.
    conn = db.connect(tmp_path / "t.db")
    try:
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] >= 30000
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    finally:
        conn.close()
