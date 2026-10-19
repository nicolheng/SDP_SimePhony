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


def test_reopen_on_grace_boundary_accepted(state):
    out = recurrence_node(state, now=CLOSED_AT + timedelta(days=30))
    assert out["recurrence_result"]["accepted"] is True
    assert out["current_status"] == "REOPENED"


def test_reopen_after_grace_is_new_case(state, stubs):
    out = recurrence_node(state, now=CLOSED_AT + timedelta(days=31))
    r = out["recurrence_result"]
    assert r["accepted"] is False and r["action"] == "NEW_CASE"
    assert out["reopen_count"] == 0
    assert out["current_status"] == "CLOSED"
    stubs[1].assert_not_called()


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
