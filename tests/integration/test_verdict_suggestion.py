# D4 #131: when the technician's verdict goes against the rule's suggestion for their measurement, the verdict needs
# one short line of reason, and whether they agreed is saved on the case (temp seed.db).
import json

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
UNIT, BUYER = "A-1-01", "B-0001"


@pytest.fixture
def client(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import db
    from demo_api.migrate import migrate
    from demo_api.routes import router
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    with db.get_conn() as conn:  # as main.py's startup does: adds the columns seed.db predates
        migrate(conn)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _accepted_case(client):
    r = client.post("/api/cases", json={"unit_id": UNIT, "buyer_id": BUYER,
                                         "description": "Floor tiles in the kitchen are uneven at the joints."})
    assert r.status_code == 200, r.text
    case_id = r.json()["caseId"]
    tech = next(c for c in r.json()["state"]["cases"] if c["id"] == case_id)["technicianId"]
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": tech})
    return case_id


def _verdict(client, case_id, **body):
    return client.post(f"/api/cases/{case_id}/verdict", json={"note": "Checked on site.", **body})


def _shown(r, case_id):
    return next(c for c in r.json()["state"]["cases"] if c["id"] == case_id)["verdict"]


def _event(case_id, kind):
    import db
    with db.get_conn() as conn:
        row = conn.execute("SELECT payload FROM case_events WHERE case_id = ? AND type = ? "
                           "ORDER BY created_at DESC, event_id DESC LIMIT 1", (case_id, kind)).fetchone()
    return json.loads(row["payload"])


LIPPAGE_2MM = {"rule_id": "TOL-TILE-LIPPAGE", "reading": 2}    # over the 1 mm limit -> likely a real defect
LIPPAGE_HALF = {"rule_id": "TOL-TILE-LIPPAGE", "reading": 0.5}  # within the limit


@pytest.mark.parametrize("outcome, measurement, answer", [
    ("VALID", LIPPAGE_2MM, "likely_defect"),
    ("INVALID", LIPPAGE_HALF, "within_limit"),
])
def test_agreeing_needs_no_reason_and_is_saved(client, outcome, measurement, answer):
    case_id = _accepted_case(client)
    r = _verdict(client, case_id, outcome=outcome, measurement=measurement)
    assert r.status_code == 200, r.text
    assert _shown(r, case_id)["suggestion"] == {"answer": answer, "agreed": True, "disagreeReason": None}
    assert _event(case_id, "verdict.recorded")["agreed_with_rule"] is True


@pytest.mark.parametrize("outcome, measurement", [
    ("INVALID", LIPPAGE_2MM),   # rule says likely a real defect
    ("VALID", LIPPAGE_HALF),    # rule says within the limit
])
def test_disagreeing_without_a_reason_is_refused_and_nothing_is_saved(client, outcome, measurement):
    case_id = _accepted_case(client)
    for reason in (None, "", "   "):
        body = {"outcome": outcome, "measurement": measurement}
        if reason is not None:
            body["disagree_reason"] = reason
        r = _verdict(client, case_id, **body)
        assert r.status_code == 400
        assert "Add one short line saying why" in r.json()["detail"]
    import tools
    assert tools.get_case(case_id)["status"] == "VISIT_SCHEDULED"  # still waiting for a verdict


def test_disagreeing_with_a_reason_is_saved_and_logged(client):
    case_id = _accepted_case(client)
    r = _verdict(client, case_id, outcome="VALID", measurement=LIPPAGE_HALF,
                 disagree_reason="  Several tiles rock underfoot even though the step is small.  ")
    assert r.status_code == 200, r.text
    assert _shown(r, case_id)["suggestion"] == {
        "answer": "within_limit", "agreed": False,
        "disagreeReason": "Several tiles rock underfoot even though the step is small."}
    payload = _event(case_id, "verdict.recorded")
    assert payload["agreed_with_rule"] is False
    assert "went against the rule (within the limit)" in payload["message"]


def test_sdp_review_card_quotes_the_reason_for_an_invalid_verdict(client):
    case_id = _accepted_case(client)
    r = _verdict(client, case_id, outcome="INVALID", measurement=LIPPAGE_2MM,
                 disagree_reason="Step is from the buyer's own floor mat trim, not the tiles.")
    assert r.status_code == 200, r.text
    message = _event(case_id, "case.review_requested")["message"]
    assert "Went against the rule's suggestion" in message and "floor mat trim" in message


def test_yes_no_rule_works_the_same_way(client):
    case_id = _accepted_case(client)
    hollow = {"rule_id": "TOL-TILE-HOLLOW", "reading": True}  # "yes, it sounds hollow" -> likely a real defect
    assert _verdict(client, case_id, outcome="INVALID", measurement=hollow).status_code == 400
    r = _verdict(client, case_id, outcome="INVALID", measurement=hollow, disagree_reason="Hollow only under grout repair.")
    assert r.status_code == 200, r.text
    assert _shown(r, case_id)["suggestion"]["agreed"] is False


def test_no_measurement_means_no_suggestion_and_no_reason_needed(client):
    case_id = _accepted_case(client)
    r = _verdict(client, case_id, outcome="VALID", disagree_reason="ignored without a measurement")
    assert r.status_code == 200, r.text
    assert _shown(r, case_id)["suggestion"] is None


def test_reason_on_an_agreeing_verdict_is_not_saved(client):
    case_id = _accepted_case(client)
    r = _verdict(client, case_id, outcome="VALID", measurement=LIPPAGE_2MM, disagree_reason="not needed")
    assert r.status_code == 200, r.text
    assert _shown(r, case_id)["suggestion"]["disagreeReason"] is None


def test_reason_longer_than_one_line_is_refused(client):
    case_id = _accepted_case(client)
    r = _verdict(client, case_id, outcome="VALID", measurement=LIPPAGE_HALF, disagree_reason="x" * 201)
    assert r.status_code == 422
