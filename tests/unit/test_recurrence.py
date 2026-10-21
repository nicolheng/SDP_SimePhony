from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from agents.simephony.recurrence import recurrence_node

CLOSED_AT = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
NOW = CLOSED_AT + timedelta(days=5)


@pytest.fixture
def state():
    return {
        "case_id": "H-NEW",
        "unit_id": "A-12-08",
        "current_status": "CLOSED",
        "closed_at": CLOSED_AT.isoformat(),
        "reopen_photo_path": "/tmp/new.jpg",
        "reopen_count": 0,
        "intake_result": {"category": "water_leak"},
    }


@pytest.fixture(autouse=True)
def stubs(escalation_db):
    # (fake tools.check_escalation, fake request_extra_inspection) -- see tests/conftest.py
    return escalation_db, escalation_db.request


def test_first_reopen_within_grace(state, stubs):
    out = recurrence_node(state, now=NOW)
    r = out["recurrence_result"]
    assert out["reopen_count"] == 1
    assert out["current_status"] == "REOPENED"
    assert r["occurrence"] == 2 and r["action"] == "REOPENED" and r["accepted"] is True
    assert r["approval_id"] is None
    stubs[1].assert_not_called()


def test_second_reopen_escalates(state, stubs):
    state["reopen_count"] = 1
    out = recurrence_node(state, now=NOW)
    r = out["recurrence_result"]
    assert out["reopen_count"] == 2
    assert r["occurrence"] == 3
    assert out["current_status"] == "ESCALATION_PENDING"
    assert r["action"] == "ESCALATED"
    assert r["approval_id"] == "APR-STUB"
    assert r["escalation_reasons"][0].startswith("Reported 3 times in this unit")
    stubs[1].assert_called_once_with("H-NEW", r["escalation_reasons"])


def test_first_reopen_stack_cluster_escalates(state, stubs):
    stubs[0].stack_units = 3  # 2 other units in the stack with the same defect
    out = recurrence_node(state, now=NOW)
    r = out["recurrence_result"]
    assert out["current_status"] == "ESCALATION_PENDING"
    assert r["escalation_reasons"] == ["3 units in stack A-08 have the same problem."]
    assert r["cluster_size"] == 3
    assert r["approval_id"] == "APR-STUB"


def test_reopen_invalid_case_rejected(state):
    state["current_status"] = "INVALID"
    out = recurrence_node(state, now=NOW)
    r = out["recurrence_result"]
    assert r["accepted"] is False and r["action"] == "REJECTED"
    assert out["current_status"] == "INVALID" and out["reopen_count"] == 0
    assert r["occurrence"] == 1 and r["cluster_size"] == 0
    assert r["escalation_reasons"] == [] and r["approval_id"] is None


def test_reopen_non_closed_rejected(state):
    state["current_status"] = "PENDING_SIGNOFF"
    out = recurrence_node(state, now=NOW)
    assert out["recurrence_result"]["action"] == "REJECTED"
    assert out["current_status"] == "PENDING_SIGNOFF" and out["reopen_count"] == 0


def test_reopen_without_photo_rejected(state):
    state["reopen_photo_path"] = None
    out = recurrence_node(state, now=NOW)
    assert out["recurrence_result"]["action"] == "REJECTED"
    assert out["current_status"] == "CLOSED" and out["reopen_count"] == 0


# --- Grace period: calendar dates in Malaysia time (UTC+8) ---
MYT = timezone(timedelta(hours=8))


def _closed_myt(state, dt):
    state["closed_at"] = dt.isoformat()
    return state


def test_reopen_late_on_day_30_myt_accepted(state):
    _closed_myt(state, datetime(2026, 10, 1, 9, 0, tzinfo=MYT))
    out = recurrence_node(state, now=datetime(2026, 10, 31, 23, 0, tzinfo=MYT))
    assert out["recurrence_result"]["accepted"] is True
    assert out["current_status"] == "REOPENED"


@pytest.mark.parametrize("hour,minute", [(0, 1), (9, 0), (23, 59)])
def test_reopen_any_time_day_31_myt_is_new_case(state, stubs, hour, minute):
    _closed_myt(state, datetime(2026, 10, 1, 9, 0, tzinfo=MYT))
    out = recurrence_node(state, now=datetime(2026, 11, 1, hour, minute, tzinfo=MYT))
    r = out["recurrence_result"]
    assert r["accepted"] is False and r["action"] == "NEW_CASE"
    assert out["reopen_count"] == 0
    assert out["current_status"] == "CLOSED"
    stubs[1].assert_not_called()


def test_grace_uses_myt_dates_not_utc_dates(state):
    # closed 2026-10-01 20:00Z = 2 Oct MYT; now 2026-11-01 15:00Z = 1 Nov 23:00 MYT -> 30 days
    state["closed_at"] = "2026-10-01T20:00:00+00:00"
    out = recurrence_node(state, now=datetime(2026, 11, 1, 15, 0, tzinfo=timezone.utc))
    assert out["recurrence_result"]["accepted"] is True


def test_naive_closed_at_treated_as_utc(state):
    # naive 20:00 read as UTC -> 2 Oct MYT -> 30 days (accepted). Read as MYT it would be 31 days.
    state["closed_at"] = "2026-10-01T20:00:00"
    out = recurrence_node(state, now=datetime(2026, 11, 1, 23, 0, tzinfo=MYT))
    assert out["recurrence_result"]["accepted"] is True


@pytest.mark.parametrize("value", [None, ""])
def test_missing_closed_at_refuses_reopen_without_crashing(state, value):
    if value is None:
        del state["closed_at"]
    else:
        state["closed_at"] = value
    out = recurrence_node(state, now=NOW)
    r = out["recurrence_result"]
    assert r["accepted"] is False
    assert r["action"] == "REJECTED"
    assert r["code"] == "no_closed_date"
    assert out["current_status"] == "CLOSED"
    assert out["reopen_count"] == state.get("reopen_count", 0)


@pytest.mark.parametrize("status,photo,code", [
    ("INVALID", "p.jpg", "invalid_case"),
    ("PENDING_SIGNOFF", "p.jpg", "not_closed"),
    ("CLOSED", None, "no_photo"),
])
def test_rejections_carry_a_code(state, status, photo, code):
    state["current_status"] = status
    state["reopen_photo_path"] = photo
    assert recurrence_node(state, now=NOW)["recurrence_result"]["code"] == code


def test_grace_period_comes_from_rules(state):
    with patch("agents.simephony.recurrence.load_rules", return_value={"grace_period_days": 5}):
        _closed_myt(state, datetime(2026, 10, 1, 9, 0, tzinfo=MYT))
        out = recurrence_node(state, now=datetime(2026, 10, 7, 9, 0, tzinfo=MYT))
    assert out["recurrence_result"]["action"] == "NEW_CASE"


# --- PR C: escalation check after a failed buyer check (case already REOPENED) ---
from agents.simephony.recurrence import reopen_escalation_node


def _already_reopened(count):
    return {"case_id": "H-NEW", "unit_id": "A-12-08", "current_status": "REOPENED", "reopen_count": count,
            "intake_result": {"category": "water_leak"}}


def test_escalation_after_failed_check_below_threshold(stubs):
    out = reopen_escalation_node(_already_reopened(1))
    r = out["recurrence_result"]
    assert out["current_status"] == "REOPENED"
    assert out["reopen_count"] == 1  # the reopen was already counted; not counted twice
    assert r["action"] == "REOPENED" and r["accepted"] is True and r["occurrence"] == 2
    stubs[1].assert_not_called()


def test_escalation_after_failed_check_on_third_occurrence(stubs):
    out = reopen_escalation_node(_already_reopened(2))
    r = out["recurrence_result"]
    assert out["current_status"] == "ESCALATION_PENDING"
    assert r["action"] == "ESCALATED" and r["occurrence"] == 3 and r["approval_id"] == "APR-STUB"
    stubs[1].assert_called_once()
    assert stubs[1].call_args.args[1][0].startswith("Reported 3 times in this unit")


def test_earlier_cases_plus_reopens_escalate(stubs):
    stubs[0].earlier = 1  # one earlier case in the unit + this case + 1 reopen = 3rd occurrence
    out = reopen_escalation_node(_already_reopened(1))
    assert out["recurrence_result"]["occurrence"] == 3
    assert out["current_status"] == "ESCALATION_PENDING"


def test_refused_request_keeps_case_reopened(stubs):
    stubs[1].return_value = {"ok": False, "error": "Case H-NEW already has a pending extra-inspection request"}
    out = reopen_escalation_node(_already_reopened(2))
    r = out["recurrence_result"]
    assert out["current_status"] == "REOPENED"
    assert r["action"] == "REOPENED" and "pending" in r["error"]


# --- New reports escalate too (3rd occurrence / stack cluster), keeping the booked visit ---
from agents.simephony.recurrence import new_case_escalation_node


def _new_case(**extra):
    return {"event": "case.created", "case_id": "C-0016", "unit_id": "A-12-08", "current_status": "VISIT_SCHEDULED", **extra}


def test_third_occurrence_on_a_new_report_asks_sdp_and_keeps_the_visit(escalation_db):
    escalation_db.earlier = 2
    escalation_db.request.return_value = {"ok": True, "approval_id": "APR-9", "issue_id": "SI-002"}
    out = new_case_escalation_node(_new_case())
    escalation_db.request.assert_called_once()
    assert escalation_db.request.call_args.kwargs == {"keep_status": True}
    r = out["new_case_escalation"]
    assert r["escalated"] is True and r["approval_id"] == "APR-9" and r["reasons"]
    assert out["current_status"] == "VISIT_SCHEDULED"


def test_stack_cluster_on_a_new_report_asks_sdp(escalation_db):
    escalation_db.stack_units = 3
    escalation_db.request.return_value = {"ok": True, "approval_id": "APR-9", "issue_id": "SI-002"}
    assert new_case_escalation_node(_new_case())["new_case_escalation"]["escalated"] is True


def test_first_report_asks_nothing(escalation_db):
    out = new_case_escalation_node(_new_case())
    escalation_db.request.assert_not_called()
    assert out["new_case_escalation"]["escalated"] is False


def test_pending_request_is_not_repeated(escalation_db):
    escalation_db.earlier, escalation_db.pending = 2, "APR-1"
    new_case_escalation_node(_new_case())
    escalation_db.request.assert_not_called()


@pytest.mark.parametrize("case_id", [None, "C-NEW"])
def test_case_not_in_db_is_skipped(escalation_db, case_id):
    out = new_case_escalation_node(_new_case(case_id=case_id))
    assert escalation_db.calls == [] and out["new_case_escalation"]["escalated"] is False


def test_refused_request_is_recorded(escalation_db):
    escalation_db.earlier = 2
    escalation_db.request.return_value = {"ok": False, "error": "Case C-0016 is CLOSED"}
    r = new_case_escalation_node(_new_case())["new_case_escalation"]
    assert r["escalated"] is False and "CLOSED" in r["error"]
