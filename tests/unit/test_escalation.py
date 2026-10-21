# Escalation decision on top of backend/tools.check_escalation, on a temp copy of seed.db.
import pytest

from agents.simephony.escalation import check_escalation

pytestmark = pytest.mark.usefixtures("seed_db")


def test_quiet_case_does_not_escalate():
    r = check_escalation("H-0094", reopen_count=0)  # A-3-01 drainage: no other cases in unit or stack
    assert r["escalate"] is False
    assert r["occurrence"] == 1 and r["cluster_size"] == 1
    assert r["reasons"] == []


def test_reopens_count_toward_occurrence():
    r = check_escalation("H-0094", reopen_count=2)  # 0 earlier cases + this case + 2 reopens = 3
    assert r["escalate"] is True
    assert r["occurrence"] == 3
    assert any("reopened 2" in reason for reason in r["reasons"])


def test_earlier_cases_count_toward_occurrence():
    r = check_escalation("C-0014", reopen_count=0)  # A-12-08 water_leak: H-0001, H-0002 earlier
    assert r["occurrence"] == 3
    assert r["escalate"] is True


def test_stack_cluster_escalates():
    r = check_escalation("H-0049", reopen_count=0)  # stack A-03: 3 units with ceiling cases
    assert r["cluster_size"] == 3
    assert r["escalate"] is True
    assert any("stack A-03" in reason for reason in r["reasons"])


def test_pending_approval_is_not_escalated_again():
    r = check_escalation("H-0002", reopen_count=1)  # already has pending APR-0002
    assert r["escalate"] is False
    assert r["pending_approval_id"] == "APR-0002"


def test_unknown_case_does_not_crash():
    r = check_escalation("C-NOPE", reopen_count=2)
    assert r["escalate"] is False
    assert r["error"]
