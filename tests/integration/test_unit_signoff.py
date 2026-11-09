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
    assert _unit() == {"unitId": UNIT, "canVerify": True, "ready": False, "waitingFor": ["C-0004"],
                       "waitingForDeveloper": [], "waitingForBuyer": ["C-0004"]}

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
                         "waitingForDeveloper": ["C-0004"], "waitingForBuyer": []}


def test_a_unit_with_nothing_open_shows_no_sign_off():
    import db
    with db.get_conn() as conn:
        conn.execute("UPDATE cases SET status = 'CLOSED' WHERE unit_id = ?", (UNIT,))
    assert _unit() == {"unitId": UNIT, "canVerify": False, "ready": False, "waitingFor": [],
                       "waitingForDeveloper": [], "waitingForBuyer": []}


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
