# #128 / #134: GET /api/cases/{id}/technician-guide gives the technician's job page the "what to check" card and,
# once the defect is Valid, its repair guide. Buyer pages read /api/state, which must never carry the steps.
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
    with db.get_conn() as conn:
        migrate(conn)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _accepted_case(client, description="Floor tiles in the kitchen sound hollow when tapped."):
    r = client.post("/api/cases", json={"unit_id": UNIT, "buyer_id": BUYER, "description": description})
    assert r.status_code == 200, r.text
    case_id = r.json()["caseId"]
    case = next(c for c in r.json()["state"]["cases"] if c["id"] == case_id)
    client.post(f"/api/cases/{case_id}/accept", json={"technician_id": case["technicianId"]})
    return case_id, case["category"]


def test_card_before_the_inspection_and_no_guide_yet(client):
    case_id, category = _accepted_case(client)
    r = client.get(f"/api/cases/{case_id}/technician-guide")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["caseId"] == case_id and body["repairMethod"] is None
    assert all(item["lines"] for item in body["checkCard"])


def test_valid_verdict_unlocks_the_repair_guide(client):
    case_id, _ = _accepted_case(client)
    r = client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "Hollow tiles near the sink."})
    assert r.status_code == 200, r.text
    method = client.get(f"/api/cases/{case_id}/technician-guide").json()["repairMethod"]
    assert method is not None and method["title"] and method["steps"]


def test_invalid_verdict_keeps_the_guide_hidden(client):
    case_id, _ = _accepted_case(client)
    client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "INVALID", "note": "Tiles are sound."})
    assert client.get(f"/api/cases/{case_id}/technician-guide").json()["repairMethod"] is None


def test_unknown_case_is_404(client):
    assert client.get("/api/cases/C-NOPE/technician-guide").status_code == 404


def test_buyer_state_never_contains_repair_steps(client):
    from agents.simephony import kb
    case_id, _ = _accepted_case(client)
    client.post(f"/api/cases/{case_id}/verdict", json={"outcome": "VALID", "note": "Hollow tiles near the sink."})
    state_text = json.dumps(client.get("/api/state").json())
    for method in kb.get()["methods"].values():
        for step in method["steps"]:
            assert step not in state_text, f"repair step from {method['id']} leaked into /api/state"
