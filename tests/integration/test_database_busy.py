# A request that cannot get the DB write lock (an agent holds it) answers 503 "try again", not a 500 crash.
import sqlite3

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("seed_db")


def test_locked_database_returns_503(monkeypatch, seed_db):
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    import db
    import main

    connect = db.connect

    def quick_connect(path=None):
        conn = connect(path)
        conn.execute("PRAGMA busy_timeout = 100")  # the real 30 s wait would only slow the test down
        return conn

    monkeypatch.setattr(db, "connect", quick_connect)
    agent = connect(seed_db)
    agent.execute("BEGIN IMMEDIATE")  # another writer holds the lock
    try:
        res = TestClient(main.app).get("/api/state")
    finally:
        agent.rollback()
        agent.close()

    assert res.status_code == 503
    assert res.headers["retry-after"] == "2"
    assert "try again" in res.json()["detail"]
