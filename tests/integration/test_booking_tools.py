# BookingAgent on the real backend/tools.py booking tools, on a temp copy of seed.db.
import pytest

from agents.simephony.booking import booking_node

pytestmark = pytest.mark.usefixtures("seed_db")


def _db():
    import db
    return db.get_conn()


def _case(case_id):
    with _db() as conn:
        return dict(conn.execute("SELECT status, technician_id, booking_status, triage_reason FROM cases WHERE case_id = ?",
                                 (case_id,)).fetchone())


def _state(case_id, unit_id, status, urgency, skill="plumbing", **extra):
    return {"case_id": case_id, "unit_id": unit_id, "current_status": status,
            "triage_result": {"assigned_skill": skill, "urgency": urgency}, **extra}


def test_visit_is_held_for_a_qualified_technician():
    # C-0009: C-8-06 sanitary fittings, SUBMITTED; only T-02 does plumbing in block C
    out = booking_node(_state("C-0009", "C-8-06", "SUBMITTED", "normal"))
    r = out["booking_result"]
    assert r["assigned_technician"] == "T-02"
    assert out["current_status"] == "ASSIGNED"
    db_case = _case("C-0009")
    assert db_case["status"] == "ASSIGNED" and db_case["booking_status"] == "PENDING" and db_case["technician_id"] == "T-02"
    assert db_case["triage_reason"] == r["reason"]


def test_rejection_rebooks_someone_else():
    import tools
    # C-0008: B-3-08 water leak, REOPENED, high urgency; T-01 and T-02 both qualify
    first = booking_node(_state("C-0008", "B-3-08", "REOPENED", "high"))["booking_result"]["assigned_technician"]
    assert tools.respond_to_assignment("C-0008", False, "On leave that day")["ok"] is True
    out = booking_node(_state("C-0008", "B-3-08", "REOPENED", "high"))
    second = out["booking_result"]["assigned_technician"]
    assert {first, second} == {"T-01", "T-02"}
    assert _case("C-0008")["technician_id"] == second


def test_nobody_left_escalates_to_sdp():
    import tools
    booking_node(_state("C-0009", "C-8-06", "SUBMITTED", "normal"))  # T-02 (the only one)
    assert tools.respond_to_assignment("C-0009", False, "Not my area")["ok"] is True
    out = booking_node(_state("C-0009", "C-8-06", "SUBMITTED", "normal"))
    assert out["booking_result"]["booking_status"] == "NEEDS_STAFF"
    assert out["current_status"] == "SUBMITTED"
    assert _case("C-0009")["booking_status"] == "NEEDS_STAFF"
