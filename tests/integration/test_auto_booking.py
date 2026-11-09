# Issue #79 (part of #72): the buyer no longer picks inspection or repair times. A report with no time gets the
# earliest free technician; a valid defect gets its repair booked with no buyer action; no message asks to book.
import re

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
UNIT, BUYER = "A-1-01", "B-0001"  # no earlier defects in seed.db
ASKS_TO_BOOK = re.compile(r"please (book|choose)|choose a repair|book a (new )?repair|repair slot", re.I)


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


def _case(state, case_id):
    return next(c for c in state["cases"] if c["id"] == case_id)


def _report(client):
    r = client.post("/api/cases", json={"unit_id": UNIT, "buyer_id": BUYER,
                                         "description": "Water dripping from the master bedroom ceiling."})
    assert r.status_code == 200, r.text
    return r.json()["caseId"], r.json()["state"]


def test_a_report_with_no_time_gets_the_earliest_free_visit(client):
    case_id, state = _report(client)
    c = _case(state, case_id)
    assert c["status"] == "VISIT_SCHEDULED" and c["technicianId"] and c["visitSlot"]
    assert c["preferredVisitAt"] is None
    triage = [e["message"] for e in state["events"] if e["caseId"] == case_id and e.get("agent") == "TriageAgent"]
    assert any("earliest free time" in m for m in triage)


def test_a_valid_defect_gets_its_repair_booked_with_no_buyer_action(client):
    case_id, state = _report(client)
    tech = _case(state, case_id)["technicianId"]
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": tech})
    state = client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "Pipe joint leaking."}).json()["state"]
    c = _case(state, case_id)
    assert c["status"] == "REPAIR_BOOKED" and c["repairSlot"]
    titles = [m["title"] for m in state["messages"] if m["caseId"] == case_id]
    assert titles[-2:] == ["Defect confirmed: repair being arranged", "Repair booked"]


def test_no_message_asks_the_buyer_to_book(client):
    case_id, state = _report(client)
    tech = _case(state, case_id)["technicianId"]
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": tech})
    client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "Pipe joint leaking."})
    state = client.get("/api/state").json()["state"]
    repairer = _case(state, case_id)["technicianId"]
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": repairer})
    client.post(f"/api/cases/{case_id}/repaired", json={"note": "Resealed the joint."})
    state = client.post(f"/api/cases/{case_id}/reject-repair", json={"note": "Stain still there."}).json()["state"]
    assert _case(state, case_id)["status"] == "REPAIR_BOOKED"  # SDP sent it back: booked again
    bodies = [f"{m['title']} {m['body']}" for m in state["messages"] if m["caseId"] == case_id]
    assert bodies and not [b for b in bodies if ASKS_TO_BOOK.search(b)]


def test_nobody_free_for_the_repair_is_flagged_to_sdp(client, monkeypatch):
    import tools
    case_id, state = _report(client)
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": _case(state, case_id)["technicianId"]})
    monkeypatch.setattr(tools, "get_booking_options", lambda *a, **k: {"ok": True, "options": []})
    r = client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "Pipe joint leaking."})
    assert r.status_code == 200  # the technician's click still works
    c = tools.get_case(case_id)
    assert c["status"] == "VALID" and c["booking_status"] == "NEEDS_STAFF"


def test_with_the_ai_on_a_valid_defect_is_booked_too(fake_llm, monkeypatch):
    import db
    import tools
    from demo_api import workflow
    monkeypatch.setenv("USE_AI_AGENTS", "all")
    with db.get_conn() as conn, tools.use_connection(conn):  # one connection, as a web request uses
        case_id = workflow.submit_report(workflow.Ctx(conn), UNIT, BUYER, "Water dripping from the master bedroom ceiling.",
                                         None, None)["caseId"]
    with db.get_conn() as conn, tools.use_connection(conn):
        ctx = workflow.Ctx(conn)
        workflow.accept_job(ctx, case_id, workflow.load_case(ctx, case_id)["technician_id"])
        workflow.record_verdict(ctx, case_id, "VALID", "Pipe joint leaking.", None)
    assert tools.get_case(case_id)["status"] == "REPAIR_BOOKED"
