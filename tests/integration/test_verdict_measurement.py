# D4 (#130 prep): a verdict can also save an optional measurement (rule + reading; the unit comes from the rule)
# and, for an INVALID verdict, a reason code from kb/invalid_defect_reasons.yaml (temp seed.db).
import json
import math

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
VALID_CASE, OTHER_CASE = "C-0001", "C-0005"  # both VISIT_SCHEDULED, seeded jobs count as accepted
UNIT, BUYER = "A-1-01", "B-0001"  # no earlier defects in seed.db


def _tools():
    import tools
    return tools


def _verdict_event(case_id):
    import db
    with db.get_conn() as conn:
        row = conn.execute("SELECT payload FROM case_events WHERE case_id = ? AND type = 'verdict.recorded' "
                           "ORDER BY created_at DESC, event_id DESC LIMIT 1", (case_id,)).fetchone()
    payload = json.loads(row["payload"])
    return payload["message"], payload


# ---------- tools.record_verdict ----------


def test_verdict_without_measurement_or_reason():
    tools = _tools()
    assert tools.record_verdict(VALID_CASE, "VALID", "Breaker trips under load.") == {"ok": True, "status": "VALID"}
    case = tools.get_case(VALID_CASE)
    assert case["verdict_measurement"] is None and case["verdict_reason_code"] is None
    assert case["verdict_unit"] is None


def test_valid_verdict_saves_a_measure_reading_with_the_rules_unit():
    tools = _tools()
    r = tools.record_verdict(VALID_CASE, "VALID", "Step between tiles is 2 mm.",
                             measurement={"rule_id": "TOL-TILE-LIPPAGE", "reading": 2})
    assert r == {"ok": True, "status": "VALID"}
    case = tools.get_case(VALID_CASE)
    assert case["verdict_measurement"] == {"rule_id": "TOL-TILE-LIPPAGE", "reading": 2.0, "unit": "mm"}
    assert case["verdict_reason_code"] is None
    message, payload = _verdict_event(VALID_CASE)
    assert "measured 2 mm (TOL-TILE-LIPPAGE)" in message
    assert payload["measurement"] == {"rule_id": "TOL-TILE-LIPPAGE", "reading": 2.0, "unit": "mm"}


def test_invalid_verdict_saves_a_yes_no_reading_and_a_reason_code():
    tools = _tools()
    r = tools.record_verdict(OTHER_CASE, "INVALID", "No water found; stain is old.",
                             measurement={"rule_id": "TOL-LEAK-ANY", "reading": False}, reason_code="WEAR_AND_TEAR")
    assert r == {"ok": True, "status": "PENDING_REVIEW"}  # an Invalid verdict waits for SDP
    case = tools.get_case(OTHER_CASE)
    assert case["verdict_measurement"] == {"rule_id": "TOL-LEAK-ANY", "reading": False, "unit": None}
    assert case["verdict_reading"] == 0.0 and case["verdict_reason_code"] == "WEAR_AND_TEAR"
    message, payload = _verdict_event(OTHER_CASE)
    assert "measured no (TOL-LEAK-ANY)" in message and "reason WEAR_AND_TEAR" in message
    assert payload["reason_code"] == "WEAR_AND_TEAR"


def test_invalid_verdict_reason_code_is_optional():
    tools = _tools()
    assert tools.record_verdict(OTHER_CASE, "INVALID", "Hairline crack within the limit.",
                                measurement={"rule_id": "TOL-CRACK-WALL", "reading": 0.3})["ok"] is True
    case = tools.get_case(OTHER_CASE)
    assert case["verdict_measurement"]["unit"] == "mm" and case["verdict_reason_code"] is None


@pytest.mark.parametrize("verdict, measurement, reason, error", [
    ("VALID", None, "WEAR_AND_TEAR", "only for an Invalid"),                                  # VALID needs no reason
    ("INVALID", None, "NOT_A_CODE", "Unknown reason code"),
    ("VALID", {"rule_id": "TOL-NOPE", "reading": 1}, None, "Unknown rule"),
    ("VALID", {"rule_id": "TOL-TILE-LIPPAGE", "reading": True}, None, "needs a number"),      # measure rule, yes/no reading
    ("VALID", {"rule_id": "TOL-LEAK-ANY", "reading": 1}, None, "True or False"),              # yes/no rule, number
    ("VALID", {"rule_id": "TOL-TILE-LIPPAGE", "reading": -1}, None, "negative"),
    ("VALID", {"rule_id": "TOL-TILE-LIPPAGE", "reading": math.inf}, None, "real number"),
    ("VALID", {"rule_id": "TOL-TILE-LIPPAGE"}, None, "rule it is for and the reading"),
])
def test_bad_measurement_or_reason_is_refused_and_nothing_saved(verdict, measurement, reason, error):
    tools = _tools()
    r = tools.record_verdict(OTHER_CASE, verdict, "Checked on site.", measurement=measurement, reason_code=reason)
    assert r["ok"] is False and error in r["error"]
    case = tools.get_case(OTHER_CASE)
    assert case["status"] == "VISIT_SCHEDULED" and case["verdict_rule_id"] is None and case["verdict_reason_code"] is None


def test_a_new_inspection_clears_the_old_measurement_and_reason():
    import db
    tools = _tools()
    tools.record_verdict(OTHER_CASE, "INVALID", "Within the limit.",
                         measurement={"rule_id": "TOL-CRACK-WALL", "reading": 0.3}, reason_code="WITHIN_TOLERANCE")
    with db.get_conn() as conn:
        case = tools._get_case(conn, OTHER_CASE)
        tools._save(conn, OTHER_CASE, status="EXTRA_INSPECTION", **tools._cleared_verdict(case))
    case = tools.get_case(OTHER_CASE)
    assert case["verdict_measurement"] is None and case["verdict_reason_code"] is None and case["verdict_note"] is None


# ---------- POST /api/cases/{id}/verdict ----------


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
                                         "description": "Water dripping from the master bedroom ceiling."})
    assert r.status_code == 200, r.text
    case_id = r.json()["caseId"]
    tech = next(c for c in r.json()["state"]["cases"] if c["id"] == case_id)["technicianId"]
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": tech})
    return case_id


def _case(state, case_id):
    return next(c for c in state["cases"] if c["id"] == case_id)


def test_route_saves_measurement_and_reason_and_the_case_shows_them(client):
    case_id = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={
        "outcome": "INVALID", "note": "No active leak; old stain.",
        "measurement": {"rule_id": "TOL-LEAK-ANY", "reading": False}, "reason_code": "LACK_OF_MAINTENANCE"})
    assert r.status_code == 200, r.text
    verdict = _case(r.json()["state"], case_id)["verdict"]
    assert verdict["outcome"] == "INVALID"
    assert verdict["measurement"] == {"ruleId": "TOL-LEAK-ANY", "reading": False, "unit": None}
    assert verdict["reasonCode"] == "LACK_OF_MAINTENANCE"


def test_route_without_measurement_shows_none(client):
    case_id = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "Pipe joint leaking."})
    assert r.status_code == 200, r.text
    verdict = _case(r.json()["state"], case_id)["verdict"]
    assert verdict["measurement"] is None and verdict["reasonCode"] is None


def test_route_measure_reading_gets_the_rules_unit(client):
    case_id = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={
        "outcome": "VALID", "note": "Ceiling crack 2 mm.", "measurement": {"rule_id": "TOL-CRACK-WALL", "reading": 2}})
    assert r.status_code == 200, r.text
    assert _case(r.json()["state"], case_id)["verdict"]["measurement"] == {"ruleId": "TOL-CRACK-WALL", "reading": 2.0, "unit": "mm"}


def test_route_refuses_a_sent_unit(client):
    case_id = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={
        "outcome": "VALID", "note": "x", "measurement": {"rule_id": "TOL-TILE-LIPPAGE", "reading": 0.2, "unit": "cm"}})
    assert r.status_code == 422


def test_route_refuses_a_reason_code_on_valid(client):
    case_id = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "x", "reason_code": "WEAR_AND_TEAR"})
    assert r.status_code == 400 and "only for an Invalid" in r.json()["detail"]


# ---------- An Invalid verdict waits for SDP: confirm or overturn (POST /api/cases/{id}/review-decision) ----------


def _messages(state, case_id):
    return [m for m in state["messages"] if m["caseId"] == case_id]


def _invalid(client):
    case_id = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={
        "outcome": "INVALID", "note": "Hairline crack, within the limit.",
        "measurement": {"rule_id": "TOL-CRACK-WALL", "reading": 0.4}, "reason_code": "WITHIN_TOLERANCE"})
    assert r.status_code == 200, r.text
    return case_id, r.json()["state"]


def test_invalid_verdict_is_held_for_sdp_and_the_buyer_waits(client):
    case_id, state = _invalid(client)
    c = _case(state, case_id)
    assert c["status"] == "PENDING_REVIEW" and not c.get("closedAt")
    assert c["verdict"]["outcome"] == "INVALID"  # SDP sees what the technician said
    review = c["review"]
    assert review["previousStatus"] == "INVALID" and review["agent"] == "Technician" and review["confidence"] is None
    assert "Within Acceptable Industry Tolerance" in review["reason"]
    assert "crack width: 0.4 mm (a defect above 1 mm)" in review["reason"]
    last = _messages(state, case_id)[-1]
    assert last["title"] == "Inspection done" and "not a defect" not in last["body"].lower()


def test_sdp_confirms_the_invalid_verdict(client):
    case_id, _ = _invalid(client)
    r = client.post(f"/api/cases/{case_id}/review-decision", json={"approve": True, "note": ""})
    assert r.status_code == 200, r.text
    state = r.json()["state"]
    c = _case(state, case_id)
    assert c["status"] == "INVALID" and c["closedAt"]
    assert c["verdict"]["reasonCode"] == "WITHIN_TOLERANCE" and c["verdict"]["measurement"]["reading"] == 0.4
    last = _messages(state, case_id)[-1]
    assert last["title"] == "Inspection result"
    assert "(Within Acceptable Industry Tolerance)" in last["body"] and "now closed" in last["body"]


def test_sdp_overturns_the_invalid_verdict_and_the_repair_is_booked(client):
    case_id, _ = _invalid(client)
    r = client.post(f"/api/cases/{case_id}/review-decision", json={"approve": False, "note": "Crack runs through the beam."})
    assert r.status_code == 200, r.text
    state = r.json()["state"]
    c = _case(state, case_id)
    assert c["status"] == "REPAIR_BOOKED" and c["repairSlot"]
    assert c["verdict"]["outcome"] == "VALID" and c["verdict"]["note"] == "Crack runs through the beam."
    assert c["verdict"]["reasonCode"] is None  # no longer applies
    assert c["verdict"]["measurement"] == {"ruleId": "TOL-CRACK-WALL", "reading": 0.4, "unit": "mm"}  # the reading stays
    titles = [m["title"] for m in _messages(state, case_id)]
    assert "Defect confirmed: repair being arranged" in titles and titles[-1] == "Repair booked"


def test_kb_endpoint_lists_rules_and_reasons(client):
    r = client.get("/api/kb")
    assert r.status_code == 200
    body = r.json()
    lippage = next(x for x in body["rules"] if x["id"] == "TOL-TILE-LIPPAGE")
    assert lippage["unit"] == "mm" and lippage["threshold"] == 1.0 and lippage["howToMeasure"]
    assert lippage["source"]["id"] == "CIS7-2021"
    leak = next(x for x in body["rules"] if x["id"] == "TOL-LEAK-ANY")
    assert leak["check"] == "yes_no" and leak["question"] and leak["unit"] is None
    codes = {x["code"]: x["label"] for x in body["reasons"]}
    assert codes["WEAR_AND_TEAR"] == "Normal Wear and Tear" and len(codes) == 10
