# backend/db.py: shared SQLite connection settings
import sqlite3
import pytest
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


def test_write_conn_takes_the_write_lock_up_front(tmp_path):
    path = tmp_path / "t.db"
    with db.write_conn(path) as conn:
        assert conn.in_transaction
        other = sqlite3.connect(path, timeout=0)
        try:
            with pytest.raises(sqlite3.OperationalError) as busy:
                other.execute("BEGIN IMMEDIATE")
            assert db.is_busy(busy.value)
        finally:
            other.close()


def test_is_busy_ignores_other_database_errors(tmp_path):
    conn = db.connect(tmp_path / "t.db")
    try:
        with pytest.raises(sqlite3.OperationalError) as missing:
            conn.execute("SELECT * FROM no_such_table")
        assert not db.is_busy(missing.value)
    finally:
        conn.close()
