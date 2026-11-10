# Issue #73 (part of #71): the buyer's Fixed only verifies one defect; checking starts once SDP has approved every
# open defect in the unit, and /api/state says per unit whether it can be signed off.
import base64

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
PHOTO = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0unit-signoff").decode()
UNIT = "B-14-09"  # in seed.db its only defect is C-0004: PENDING_SIGNOFF, approved by SDP


def _case(case_id):
    import db
    with db.get_conn() as conn:
        return dict(conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone())


def _unit():
    import db
    import tools
    with db.get_conn() as conn:
        return tools.unit_signoff_state(conn, UNIT)


def _second_defect():
    """A new report in the same unit: still at the start, so not approved by SDP."""
    import db
    import tools
    with db.get_conn() as conn:
        buyer = conn.execute("SELECT buyer_id FROM cases WHERE case_id = 'C-0004'").fetchone()[0]
    return tools.create_case(UNIT, buyer, "Hairline crack on the living room wall.", None, PHOTO)["case_id"]


def test_fixed_verifies_the_defect_without_closing_it():
    import tools
    unit = _unit()
    assert {k: unit[k] for k in ("canVerify", "ready", "waitingFor", "waitingForDeveloper", "waitingForBuyer", "caseIds")} == {
        "canVerify": True, "ready": False, "waitingFor": ["C-0004"], "waitingForDeveloper": [],
        "waitingForBuyer": ["C-0004"], "caseIds": ["C-0004"]}
    assert unit["deadline"]

    r = tools.record_verification("C-0004", "FIXED", "Dry after the shower test")
    assert r["status"] == "PENDING_SIGNOFF"
    case = _case("C-0004")
    assert case["status"] == "PENDING_SIGNOFF" and case["verification_status"] == "verified"
    assert case["buyer_signed_at"] is None and case["closed_at"] is None
    assert r["unit"]["ready"] and r["unit"]["waitingFor"] == []


def test_buyer_cannot_check_while_another_defect_waits_for_sdp():
    import tools
    other = _second_defect()
    unit = _unit()
    assert not unit["canVerify"] and not unit["ready"]
    assert unit["waitingForDeveloper"] == [other] and unit["waitingForBuyer"] == ["C-0004"]

    for outcome, photo in (("FIXED", None), ("NOT_FIXED", PHOTO), ("CANNOT_VERIFY", None)):
        r = tools.record_verification("C-0004", outcome, "", photo)
        assert r["ok"] is False and "approved every defect" in r["error"] and other in r["error"]
    assert _case("C-0004")["verification_status"] == "pending"  # nothing was saved


def test_not_fixed_makes_the_unit_not_ready_again():
    import tools
    tools.record_verification("C-0004", "FIXED", "")
    assert _unit()["ready"]
    # Changed their mind before signing off the unit: Not Fixed reopens it, so the unit waits for SDP again
    r = tools.record_verification("C-0004", "NOT_FIXED", "Damp again", PHOTO)
    assert r["status"] == "REOPENED"
    assert r["unit"] == {"unitId": UNIT, "canVerify": False, "ready": False, "waitingFor": ["C-0004"],
                         "waitingForDeveloper": ["C-0004"], "waitingForBuyer": [], "caseIds": ["C-0004"], "deadline": None}


def test_a_unit_with_nothing_open_shows_no_sign_off():
    import db
    with db.get_conn() as conn:
        conn.execute("UPDATE cases SET status = 'CLOSED' WHERE unit_id = ?", (UNIT,))
    assert _unit() == {"unitId": UNIT, "canVerify": False, "ready": False, "waitingFor": [],
                       "waitingForDeveloper": [], "waitingForBuyer": [], "caseIds": [], "deadline": None}


def test_state_has_unit_readiness_and_verification_status():
    import db
    import tools
    from demo_api.state import build_state
    from demo_api.workflow import Ctx
    tools.record_verification("C-0004", "FIXED", "")
    with db.get_conn() as conn:
        state = build_state(Ctx(conn), "http://test")
    assert state["unitSignoff"][UNIT]["ready"] is True
    assert "A-12-08" in state["unitSignoff"]  # every unit with a defect is listed
    assert next(c for c in state["cases"] if c["id"] == "C-0004")["verificationStatus"] == "verified"


# ---------- #74: one sign-off for the whole unit ----------

def _approved(case_id, days_ago=0.0, urgency="normal"):
    """Put a defect at PENDING_SIGNOFF, approved by SDP `days_ago` days before the demo clock."""
    import db
    import tools
    from demo_api.timeutil import add_days
    with db.get_conn() as conn:
        when = add_days(tools._now(conn), -days_ago)
        conn.execute("UPDATE cases SET status = 'PENDING_SIGNOFF', developer_signed = 1, developer_signed_at = ?, "
                     "verification_status = 'pending', urgency = ?, buyer_signed_at = NULL, signoff_reminder_at = NULL, "
                     "signoff_overdue_at = NULL WHERE case_id = ?", (when, urgency, case_id))


def _two_approved_defects():
    other = _second_defect()
    _approved("C-0004")
    _approved(other)
    return ["C-0004", other]


def test_sign_off_is_refused_until_every_defect_is_approved_and_checked():
    import tools
    other = _second_defect()
    assert "approve some repairs" in tools.sign_off_unit(UNIT)["error"]
    _approved(other)
    assert f"Still to check: C-0004, {other}" in tools.sign_off_unit(UNIT)["error"]
    tools.record_verification("C-0004", "FIXED", "")
    assert tools.sign_off_unit(UNIT)["error"].endswith(f"Still to check: {other}.")
    assert _case("C-0004")["status"] == "PENDING_SIGNOFF"  # nothing closed by the refused calls


def test_one_sign_off_closes_every_defect_in_the_unit():
    import tools
    ids = _two_approved_defects()
    for cid in ids:
        tools.record_verification(cid, "FIXED", "")
    r = tools.sign_off_unit(UNIT, "All good")
    assert r["closed"] == ids
    for cid in ids:
        case = _case(cid)
        assert case["status"] == "CLOSED" and case["buyer_signed_at"] and case["buyer_signoff_note"] == "All good"
    assert not _unit()["ready"] and _unit()["caseIds"] == []


def test_a_buyer_cannot_sign_off_one_defect_on_its_own():
    import tools
    tools.record_verification("C-0004", "FIXED", "")
    assert "whole unit" in tools.record_signoff("C-0004", "buyer")["error"]


def test_reopening_one_defect_makes_the_unit_not_ready_again():
    import tools
    ids = _two_approved_defects()
    for cid in ids:
        tools.record_verification(cid, "FIXED", "")
    tools.sign_off_unit(UNIT)
    assert tools.reopen_case(ids[1], "Crack is back", PHOTO)["ok"]
    unit = _unit()
    assert not unit["canVerify"] and not unit["ready"] and unit["caseIds"] == [ids[1]]
    assert _case(ids[0])["status"] == "CLOSED"  # the other defect stays closed


def _client(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from demo_api.routes import router
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_unit_sign_off_route_closes_the_unit_and_tells_the_buyer(monkeypatch):
    import tools
    client = _client(monkeypatch)
    _approved("C-0004")
    tools.record_verification("C-0004", "FIXED", "")

    state = client.post(f"/api/units/{UNIT}/signoff", json={}).json()["state"]
    assert next(c for c in state["cases"] if c["id"] == "C-0004")["status"] == "CLOSED"
    message = [m for m in state["messages"] if m["caseId"] == "C-0004"][-1]
    assert message["title"] == "Unit signed off" and "C-0004" in message["body"]
    again = client.post(f"/api/units/{UNIT}/signoff", json={})
    assert again.status_code == 400 and "no repairs to sign off" in again.json()["detail"]


def test_buyer_is_told_to_check_only_when_the_whole_unit_is_approved(monkeypatch):
    import db
    from demo_api import workflow
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    other = _second_defect()
    with db.get_conn() as conn:  # both repaired, SDP has approved neither yet
        conn.execute("UPDATE cases SET status = 'PENDING_SIGNOFF', developer_signed_at = NULL "
                     "WHERE case_id IN ('C-0004', ?)", (other,))

    def ready_messages():
        with db.get_conn() as conn:
            return conn.execute("SELECT body FROM buyer_messages WHERE title = 'Please check your repairs and sign off' "
                                "AND case_id IN ('C-0004', ?)", (other,)).fetchall()

    with db.get_conn() as conn:
        workflow.developer_signoff(workflow.Ctx(conn), "C-0004")
    assert ready_messages() == []  # the other defect still waits for SDP
    with db.get_conn() as conn:
        workflow.developer_signoff(workflow.Ctx(conn), other)
    [msg] = ready_messages()
    assert "all 2 repairs" in msg[0] and UNIT in msg[0]


# ---------- #75: the sign-off timer counts per unit ----------

def _sweep():
    import tools
    return [d for d in tools.sweep_signoffs() if d["unit_id"] == UNIT]


def _move_clock(days):
    import db
    with db.get_conn() as conn:
        conn.execute("UPDATE app_meta SET value = CAST(value AS REAL) + ? WHERE key = 'clock_offset_days'", (days,))


def _unit_messages(title):
    import db
    with db.get_conn() as conn:
        return conn.execute("SELECT case_id, body FROM buyer_messages WHERE title = ? AND body LIKE ?",
                            (title, f"%Unit {UNIT}%")).fetchall()


def test_no_defect_auto_closes_while_another_in_the_unit_is_not_approved():
    _approved("C-0004", days_ago=60)  # its own 14 days are long over
    other = _second_defect()
    assert _sweep() == []
    assert _case("C-0004")["status"] == "PENDING_SIGNOFF" and _case(other)["status"] != "CLOSED"


def test_deadline_counts_from_the_last_approval_in_the_unit():
    import db
    import tools
    from demo_api.timeutil import days_between
    other = _second_defect()
    _approved("C-0004", days_ago=20)  # alone, this would be 6 days overdue
    _approved(other, days_ago=5)
    with db.get_conn() as conn:
        assert round(days_between(tools._now(conn), _unit()["deadline"])) == 9  # 14 days from the approval 5 days ago
    assert _sweep() == []  # not due, and more than 3 days left so no reminder yet


def test_reminder_and_auto_close_happen_once_for_the_whole_unit():
    ids = _two_approved_defects()
    _move_clock(12)  # 12 of 14 days gone: reminder time
    assert sorted(d["case_id"] for d in _sweep() if d["action"] == "reminder") == sorted(ids)
    assert _sweep() == []  # once only
    [reminder] = _unit_messages("Reminder: please sign off your repairs")
    assert all(cid in reminder["body"] for cid in ids)

    _move_clock(3)  # past the deadline: every defect closes together, with one message
    assert sorted(d["case_id"] for d in _sweep() if d["action"] == "auto_closed") == sorted(ids)
    assert all(_case(cid)["status"] == "CLOSED" and _case(cid)["auto_closed_at"] for cid in ids)
    assert len(_unit_messages("Repairs closed automatically")) == 1


def test_a_high_urgency_defect_flags_the_whole_unit_instead_of_closing_it():
    other = _second_defect()
    _approved("C-0004", days_ago=20)
    _approved(other, days_ago=20, urgency="high")
    assert sorted(d["action"] for d in _sweep()) == ["overdue", "overdue"]
    assert _case("C-0004")["status"] == "PENDING_SIGNOFF" and _case("C-0004")["signoff_overdue_at"]
    assert _sweep() == []  # flagged once
    assert len(_unit_messages("Sign-off overdue")) == 1


def test_skip_days_in_the_demo_still_auto_closes(monkeypatch):
    client = _client(monkeypatch)
    _approved("C-0004")
    state = client.post("/api/demo/skip-days", json={"days": 15}).json()["state"]
    assert next(c for c in state["cases"] if c["id"] == "C-0004")["status"] == "CLOSED"


def test_one_rating_per_unit_sign_off():
    import tools
    assert "after you have signed off" in tools.record_unit_rating(UNIT, 4)["error"]
    ids = _two_approved_defects()
    for cid in ids:
        tools.record_verification(cid, "FIXED", "")
    tools.sign_off_unit(UNIT)
    r = tools.record_unit_rating(UNIT, 4, "Quick and tidy")
    assert r["ok"] and r["case_ids"] == ids
    for cid in ids:  # saved on every defect the sign-off closed
        case = _case(cid)
        assert case["buyer_rating"] == 4 and case["buyer_rating_comment"] == "Quick and tidy"
    assert "already rated" in tools.record_unit_rating(UNIT, 5)["error"]


def _records():
    import json

    import db
    with db.get_conn() as conn:
        rows = conn.execute("SELECT * FROM unit_signoffs WHERE unit_id = ? ORDER BY signed_at", (UNIT,)).fetchall()
    return [{**dict(r), "case_ids": json.loads(r["case_ids"])} for r in rows]


def test_each_sign_off_writes_one_rectification_record_with_its_rating():
    import tools
    before = len(_records())
    ids = _two_approved_defects()
    for cid in ids:
        tools.record_verification(cid, "FIXED", "")
    r = tools.sign_off_unit(UNIT, "All good")
    records = _records()
    assert len(records) == before + 1 and r["record_id"] == records[-1]["record_id"].replace("", "")
    rec = records[-1]
    assert rec["kind"] == "signed" and rec["case_ids"] == ids and rec["note"] == "All good" and rec["rating"] is None
    tools.record_unit_rating(UNIT, 5, "Great")
    rec = _records()[-1]
    assert rec["rating"] == 5 and rec["rating_comment"] == "Great"


def test_auto_close_writes_an_auto_closed_record():
    before = len(_records())
    ids = _two_approved_defects()
    _move_clock(15)  # past the 14-day deadline
    _sweep()
    rec = _records()[-1]
    assert len(_records()) == before + 1 and rec["kind"] == "auto_closed" and sorted(rec["case_ids"]) == sorted(ids)
