from unittest.mock import patch

from agents.simephony.escalation import check_escalation


def _cases(*specs):
    return [{"case_id": f"H-{i}", "category": c, "status": s} for i, (c, s) in enumerate(specs, 1)]


def _check(others, occurrence=1, category="water_leak"):
    with patch("agents.simephony.escalation.get_stack_cases", return_value=others):
        return check_escalation("H-NEW", "A-12-08", category, occurrence)


def test_occurrence_threshold():
    r = _check([], occurrence=3)
    assert r["escalate"] is True
    assert "3rd occurrence" in r["reasons"]
    r = _check([], occurrence=2)
    assert r["escalate"] is False
    assert r["reasons"] == []


def test_stack_cluster():
    r = _check(_cases(("water_leak", "OPEN"), ("water_leak", "CLOSED")))
    assert r["cluster_size"] == 3
    assert r["escalate"] is True
    assert "stack cluster" in r["reasons"]


def test_cluster_ignores_invalid_cases():
    r = _check(_cases(("water_leak", "OPEN"), ("water_leak", "INVALID")))
    assert r["cluster_size"] == 2
    assert r["escalate"] is False


def test_cluster_ignores_other_categories():
    r = _check(_cases(("water_leak", "OPEN"), ("cracks", "OPEN")))
    assert r["cluster_size"] == 2
    assert r["escalate"] is False


def test_cluster_excludes_current_case_from_list():
    others = [{"case_id": "H-NEW", "category": "water_leak", "status": "OPEN"},
              {"case_id": "H-1", "category": "water_leak", "status": "OPEN"}]
    assert _check(others)["cluster_size"] == 2
