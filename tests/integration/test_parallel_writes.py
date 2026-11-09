# Two background jobs writing at the same time (a buyer's batch of reports in USE_AI_AGENTS=only): each new
# record must get its own number. Before db.hold_write_lock, both read the same highest number and the second
# insert failed with "UNIQUE constraint failed: case_events.event_id" (C-0024 was held for review).
import threading
import time

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


def _job_a(started, errors):
    """Saves an event, then keeps its transaction open for a moment, like a job waiting on the AI."""
    import db
    import tools
    try:
        with db.get_conn() as conn:
            tools._emit(conn, "C-0001", "agent.step", "job A step", agent="IntakeAgent")
            started.set()
            time.sleep(0.5)
    except Exception as e:  # pragma: no cover - reported below
        errors.append(e)


def test_parallel_jobs_never_reuse_an_event_number():
    import db
    import tools
    tools.get_clock()  # the first tools connection applies the web app's migrations
    started, errors = threading.Event(), []
    a = threading.Thread(target=_job_a, args=(started, errors))
    a.start()
    assert started.wait(5)
    with db.get_conn() as conn:  # job B, on its own connection, while job A is still open
        b_id = tools._emit(conn, "C-0002", "agent.step", "job B step", agent="IntakeAgent")
    a.join()
    assert not errors
    with db.get_conn() as conn:
        ids = [r["event_id"] for r in conn.execute("SELECT event_id FROM case_events WHERE payload LIKE '%job _ step%'")]
    assert len(ids) == 2 and len(set(ids)) == 2 and b_id in ids


def test_parallel_jobs_never_reuse_a_case_number():
    import db
    import tools
    tools.get_clock()
    started, errors, made = threading.Event(), [], []

    def job_a():
        try:
            with db.get_conn() as conn:
                made.append(tools._next_id(conn, "approvals", "approval_id", "APR", 4))
                conn.execute("INSERT INTO approvals (approval_id, case_id, reasons, status, created_at) "
                             "VALUES (?, 'C-0001', '[]', 'pending', '2026-11-09')", (made[0],))
                started.set()
                time.sleep(0.5)
        except Exception as e:  # pragma: no cover
            errors.append(e)

    a = threading.Thread(target=job_a)
    a.start()
    assert started.wait(5)
    with db.get_conn() as conn:
        b = tools._next_id(conn, "approvals", "approval_id", "APR", 4)
        conn.execute("INSERT INTO approvals (approval_id, case_id, reasons, status, created_at) "
                     "VALUES (?, 'C-0002', '[]', 'pending', '2026-11-09')", (b,))
    a.join()
    assert not errors and b != made[0]
