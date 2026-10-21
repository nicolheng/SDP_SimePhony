# RecurrenceAgent linked to backend/tools.py (check_escalation + request_extra_inspection) on a temp seed.db.
from datetime import datetime, timedelta, timezone

import pytest

from agents.simephony.recurrence import recurrence_node, reopen_escalation_node

pytestmark = pytest.mark.usefixtures("seed_db")
NOW = datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc)


def _db():
    import db
    return db.get_conn()


def _reopened_in_db(case_id, reopen_count):
    """What the web app's reopen_case leaves behind before RecurrenceAgent runs."""
    with _db() as conn:
        conn.execute("UPDATE cases SET status = 'REOPENED', reopen_count = ? WHERE case_id = ?", (reopen_count, case_id))


def _reopen_state(case_id, unit_id, category, reopen_count):
    return {"case_id": case_id, "unit_id": unit_id, "current_status": "CLOSED", "reopen_count": reopen_count,
            "closed_at": (NOW - timedelta(days=5)).isoformat(), "reopen_photo_path": "reopen.jpg",
            "intake_result": {"category": category}}


def test_second_reopen_requests_real_extra_inspection():
    _reopened_in_db("H-0094", 2)
    out = recurrence_node(_reopen_state("H-0094", "A-3-01", "drainage", 1), now=NOW)
    r = out["recurrence_result"]
    assert out["current_status"] == "ESCALATION_PENDING"
    assert r["action"] == "ESCALATED" and r["occurrence"] == 3
    with _db() as conn:
        case = conn.execute("SELECT status FROM cases WHERE case_id = 'H-0094'").fetchone()
        approval = conn.execute("SELECT status, reasons FROM approvals WHERE approval_id = ?", (r["approval_id"],)).fetchone()
    assert case["status"] == "ESCALATION_PENDING"
    assert approval["status"] == "pending"


def test_first_reopen_below_threshold_requests_nothing():
    _reopened_in_db("H-0094", 1)
    out = recurrence_node(_reopen_state("H-0094", "A-3-01", "drainage", 0), now=NOW)
    assert out["current_status"] == "REOPENED"
    assert out["recurrence_result"]["approval_id"] is None
    with _db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM approvals WHERE case_id = 'H-0094'").fetchone()[0] == 0


def test_stack_escalation_reuses_open_systemic_issue():
    _reopened_in_db("C-0014", 1)
    out = reopen_escalation_node({"case_id": "C-0014", "unit_id": "A-12-08", "current_status": "REOPENED",
                                  "reopen_count": 1, "intake_result": {"category": "water_leak"}})
    r = out["recurrence_result"]
    assert r["action"] == "ESCALATED"
    assert r["issue_id"] == "SI-002"


def test_pending_approval_keeps_case_reopened_without_new_request():
    _reopened_in_db("H-0002", 2)
    out = reopen_escalation_node({"case_id": "H-0002", "unit_id": "A-12-08", "current_status": "REOPENED",
                                  "reopen_count": 2, "intake_result": {"category": "water_leak"}})
    assert out["current_status"] == "REOPENED"
    assert out["recurrence_result"]["approval_id"] == "APR-0002"
    with _db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM approvals WHERE case_id = 'H-0002'").fetchone()[0] == 1
