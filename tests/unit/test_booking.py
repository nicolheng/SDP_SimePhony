import pytest
# BookingAgent on xiaowen's booking tools (faked here by FakeBookingDB in tests/conftest.py;
# the real tools on a temp seed.db are in tests/integration/test_booking_tools.py).
from agents.simephony.booking import booking_node


def _state(urgency="normal", case_id="C-1", **extra):
    return {"case_id": case_id, "unit_id": "A-12-08", "current_status": "SUBMITTED",
            "triage_result": {"assigned_skill": "plumbing", "urgency": urgency}, **extra}


def test_normal_urgency_books_the_buyers_preferred_time(booking_db):
    booking_db.preferred = {"start": "2026-10-23T06:00:00.000Z", "start_local": "Fri 23 Oct, 2:00 pm",
                            "technicians": [{"technician_id": "T-PLUMB-1", "name": "Ali Hassan"}]}
    out = booking_node(_state())
    r = out["booking_result"]
    assert r["start"] == "2026-10-23T06:00:00.000Z"
    assert r["assigned_technician"] == "T-PLUMB-1"
    assert out["current_status"] == "VISIT_SCHEDULED"
    assert r["booking_status"] == "PENDING"  # waits for the technician to accept in the app


def test_normal_urgency_without_preference_takes_next_time(booking_db):
    out = booking_node(_state())
    assert out["booking_result"]["start"] == "2026-10-22T01:00:00.000Z"


def test_high_urgency_takes_the_earliest_time_over_the_preferred_one(booking_db):
    booking_db.preferred = {"start": "2026-10-23T06:00:00.000Z", "start_local": "Fri 23 Oct, 2:00 pm",
                            "technicians": [{"technician_id": "T-PLUMB-1", "name": "Ali Hassan"}]}
    out = booking_node(_state(urgency="HIGH"))  # urgency casing doesn't matter
    assert out["booking_result"]["start"] == "2026-10-22T01:00:00.000Z"
    assert booking_db.assigned[-1]["urgency"] == "high"


def test_reason_names_the_technician_skill_and_time(booking_db):
    r = booking_node(_state())["booking_result"]
    assert "Ali Hassan" in r["reason"] and "plumbing" in r["reason"] and "Thu 22 Oct, 9:00 am" in r["reason"]
    assert booking_db.assigned[-1]["reason"] == r["reason"]
    assert r["technician_name"] == "Ali Hassan" and r["start_local"] == "Thu 22 Oct, 9:00 am"


def test_refused_assignment_tries_the_next_technician(booking_db):
    booking_db.refuse = {"T-PLUMB-1"}
    out = booking_node(_state())
    r = out["booking_result"]
    assert r["assigned_technician"] == "T-PLUMB-2"  # same time, next free technician
    assert out["tried_technicians"] == ["T-PLUMB-1"]
    assert out["current_status"] == "VISIT_SCHEDULED"


def test_technicians_already_tried_are_skipped(booking_db):
    out = booking_node(_state(tried_technicians=["T-PLUMB-1", "T-PLUMB-2"]))
    assert out["booking_result"]["assigned_technician"] == "T-PLUMB-3"


def test_nobody_available_escalates_to_sdp_without_changing_status(booking_db):
    booking_db.options = []
    out = booking_node(_state())
    r = out["booking_result"]
    assert r["booking_status"] == "NEEDS_STAFF"
    assert out["current_status"] == "SUBMITTED"  # CONTRACTS: escalate_booking leaves the status alone
    assert booking_db.escalated[-1]["case_id"] == "C-1"
    assert booking_db.assigned == []


def test_every_assignment_refused_escalates(booking_db):
    booking_db.refuse = {"T-PLUMB-1", "T-PLUMB-2", "T-PLUMB-3"}
    out = booking_node(_state())
    assert out["booking_result"]["booking_status"] == "NEEDS_STAFF"
    assert sorted(out["tried_technicians"]) == ["T-PLUMB-1", "T-PLUMB-2", "T-PLUMB-3"]
    assert len(booking_db.escalated) == 1


def test_case_not_in_db_is_not_booked(booking_db):
    out = booking_node(_state(case_id="C-NEW"))
    r = out["booking_result"]
    assert "not in the DB" in r["error"]
    assert out["current_status"] == "SUBMITTED"
    assert booking_db.option_calls == [] and booking_db.escalated == []


def test_options_lookup_failure_is_recorded(booking_db, monkeypatch):
    from agents.simephony import backend_tools
    monkeypatch.setattr(backend_tools, "get_booking_options", lambda case_id, kind="visit": {"ok": False, "error": "Case 'C-1' not found"})
    out = booking_node(_state())
    assert "not found" in out["booking_result"]["error"]
    assert out["current_status"] == "SUBMITTED"


def test_alternatives_are_the_other_times(booking_db):
    r = booking_node(_state())["booking_result"]
    assert [a["start"] for a in r["alternatives"]] == ["2026-10-22T03:00:00.000Z", "2026-10-23T06:00:00.000Z"]


# --- Hand-over (xiaowen's flow): the technician hands the job over in the app -> booking.rejected ---
def _handover(**extra):
    return {**_state(current_status="VISIT_SCHEDULED", event="booking.rejected"), **extra}


def test_handed_over_job_goes_to_a_colleague_at_the_same_time(booking_db):
    out = booking_node(_handover())
    r = out["booking_result"]
    assert booking_db.reassigned == [{"case_id": "C-1", "technician_id": "T-PLUMB-2", "start": "2026-10-22T01:00:00.000Z"}]
    assert booking_db.assigned == []  # a hand-over is reassigned, never booked again from scratch
    assert r["assigned_technician"] == "T-PLUMB-2" and r["same_time"] is True and r["reassigned"] is True
    assert r["booking_status"] == "PENDING" and "Siti Rahman" in r["reason"] and "same time" in r["reason"]
    assert out["current_status"] == "VISIT_SCHEDULED"  # the case keeps its status


def test_handover_moves_the_time_when_nobody_is_free_then(booking_db):
    booking_db.handover = booking_db.handover[1:]
    r = booking_node(_handover())["booking_result"]
    assert r["assigned_technician"] == "T-PLUMB-3" and r["same_time"] is False
    assert "Thu 22 Oct, 11:00 am" in r["reason"]


def test_refused_reassignment_tries_the_next_colleague(booking_db):
    booking_db.refuse = {"T-PLUMB-2"}
    assert booking_node(_handover())["booking_result"]["assigned_technician"] == "T-PLUMB-3"


@pytest.mark.parametrize("status, job", [("EXTRA_INSPECTION", "detailed inspection"), ("REPAIR_BOOKED", "repair")])
def test_any_job_can_be_handed_over(booking_db, status, job):
    booking_db.status, booking_db.job = status, job
    out = booking_node(_handover(current_status=status))
    assert out["current_status"] == status and job in out["booking_result"]["reason"]


def test_nobody_to_take_the_job_escalates_to_sdp(booking_db):
    booking_db.handover = []
    out = booking_node(_handover())
    assert out["booking_result"]["booking_status"] == "NEEDS_STAFF"
    assert booking_db.escalated and "inspection visit" in booking_db.escalated[0]["reason"]
    assert out["current_status"] == "VISIT_SCHEDULED"


def test_extra_inspection_booking_keeps_its_status(booking_db):
    booking_db.status = "EXTRA_INSPECTION"
    out = booking_node(_state(current_status="ESCALATION_PENDING"))
    assert out["current_status"] == "EXTRA_INSPECTION"
