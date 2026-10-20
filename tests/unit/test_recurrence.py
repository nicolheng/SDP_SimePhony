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
def stubs():
    with patch("agents.simephony.escalation.get_stack_cases", return_value=[]) as gs, \
         patch("agents.simephony.recurrence.request_extra_inspection",
               return_value={"approval_id": "APR-STUB"}) as ri:
        yield gs, ri


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
    assert "3rd occurrence" in r["escalation_reasons"]
    stubs[1].assert_called_once_with("H-NEW", r["escalation_reasons"])


def test_first_reopen_stack_cluster_escalates(state, stubs):
    stubs[0].return_value = [
        {"case_id": "H-1", "category": "water_leak", "status": "OPEN"},
        {"case_id": "H-2", "category": "water_leak", "status": "CLOSED"},
    ]
    out = recurrence_node(state, now=NOW)
    r = out["recurrence_result"]
    assert out["current_status"] == "ESCALATION_PENDING"
    assert r["escalation_reasons"] == ["stack cluster"]
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
