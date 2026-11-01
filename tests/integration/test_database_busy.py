# Database lock behaviour through the HTTP app on a temp seed.db: the 3 s state poll is read-only, a write that
# cannot get the lock (an agent holds it) answers 503 "try again", and sign-off deadlines run in a periodic sweep.
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("seed_db")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    import db
    import main
    from demo_api.migrate import migrate
    with db.get_conn() as conn:  # as main.py's startup does: adds the columns seed.db predates
        migrate(conn)
    return TestClient(main.app)  # no `with`: the lifespan (AI warmup, sweep loop) does not start


def _case(state, case_id):
    return next(c for c in state["cases"] if c["id"] == case_id)


def test_locked_database_still_serves_state_but_refuses_writes(monkeypatch, seed_db, client):
    import db

    connect = db.connect

    def quick_connect(path=None):
        conn = connect(path)
        conn.execute("PRAGMA busy_timeout = 100")  # the real 30 s wait would only slow the test down
        return conn

    monkeypatch.setattr(db, "connect", quick_connect)
    agent = connect(seed_db)
    agent.execute("BEGIN IMMEDIATE")  # another writer holds the lock
    try:
        poll = client.get("/api/state")
        write = client.post("/api/demo/skip-days", json={"days": 1})
    finally:
        agent.rollback()
        agent.close()

    assert poll.status_code == 200
    assert write.status_code == 503
    assert write.headers["retry-after"] == "2"
    assert "try again" in write.json()["detail"]


def test_sign_off_deadlines_run_in_the_sweep_not_the_poll(client):
    import db
    import main

    # H-0024: developer signed 2026-10-01, buyer never did; 60 days on, the sign-off period is long over
    with db.get_conn() as conn:
        conn.execute("UPDATE app_meta SET value = CAST(value AS REAL) + 60 WHERE key = 'clock_offset_days'")

    assert _case(client.get("/api/state").json()["state"], "H-0024")["status"] == "PENDING_SIGNOFF"
    assert {"case_id": "H-0024", "action": "auto_closed"} in main.sweep_signoffs_now()
    assert _case(client.get("/api/state").json()["state"], "H-0024")["status"] == "CLOSED"
