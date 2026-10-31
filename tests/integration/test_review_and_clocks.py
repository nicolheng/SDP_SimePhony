# Held-for-review cases (PENDING_REVIEW), the one-round follow-up, and the statutory clocks, through the HTTP
# routes on a temp seed.db.
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("seed_db")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    import db
    from demo_api.migrate import migrate
    from demo_api.routes import router
    with db.get_conn() as conn:  # as main.py's startup does: adds the columns seed.db predates
        migrate(conn)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _case(state, case_id):
    return next(c for c in state["cases"] if c["id"] == case_id)


def _hold(case_id, agent="IntakeAgent", score=0.42):
    import tools
    assert tools.flag_case_for_human_review(case_id, agent, "AI abstained due to low confidence (score: 0.42).", score)["ok"]


def test_follow_up_answer_is_taken_as_given(client):
    # C-0013: INFO_NEEDED in seed.db; the stand-in can't read "beside the window" as a room, but the answer is accepted
    state = client.post("/api/cases/C-0013/follow-up", json={"answer": "Beside the window, near the floor."}).json()["state"]
    c = _case(state, "C-0013")
    assert c["status"] == "VISIT_SCHEDULED"
    assert c["location"] == "Beside the window, near the floor"
    assert not c["followUpQuestion"]


def test_held_case_shows_why_and_approval_books_the_visit(client):
    _hold("C-0013")
    c = _case(client.get("/api/state").json()["state"], "C-0013")
    assert c["status"] == "PENDING_REVIEW"
    assert c["review"]["agent"] == "IntakeAgent" and c["review"]["confidence"] == 0.42
    assert c["review"]["previousStatus"] == "INFO_NEEDED" and "low confidence" in c["review"]["reason"]

    state = client.post("/api/cases/C-0013/review-decision", json={"approve": True}).json()["state"]
    c = _case(state, "C-0013")
    assert c["status"] == "VISIT_SCHEDULED" and c["technicianId"] and "review" not in c
    assert any(e["type"] == "case.review_approved" and e["caseId"] == "C-0013" for e in state["events"])


def test_rejecting_a_held_report_closes_it_as_not_a_defect(client):
    _hold("C-0013")
    state = client.post("/api/cases/C-0013/review-decision", json={"approve": False, "note": "Condensation, not a defect"}).json()["state"]
    c = _case(state, "C-0013")
    assert c["status"] == "INVALID"
    assert c["verdict"]["note"] == "Condensation, not a defect"
    assert any(m["caseId"] == "C-0013" and "Condensation" in m["body"] for m in state["messages"])


def test_approving_a_held_repair_check_asks_the_buyer_to_sign_off(client):
    # C-0007: REPAIRED in seed.db; the VerificationAgent was unsure about the repair photo
    _hold("C-0007", "VerificationAgent", 0.5)
    state = client.post("/api/cases/C-0007/review-decision", json={"approve": True}).json()["state"]
    c = _case(state, "C-0007")
    assert c["status"] == "PENDING_SIGNOFF" and c["verificationGuide"]["steps"]


def test_review_decision_needs_a_held_case(client):
    r = client.post("/api/cases/C-0007/review-decision", json={"approve": True})
    assert r.status_code == 400 and "isn't waiting for review" in r.json()["detail"]


def test_statutory_clocks(client):
    state = client.get("/api/state").json()["state"]
    s = state["analytics"]["statutory"]
    assert s["dlpMonths"] == 24 and s["repairDays"] == 30
    assert {b["block"]: b["dlpExpiry"] for b in s["dlp"]} == {"A": "2027-04-01", "B": "2027-01-15", "C": "2026-11-20"}
    assert 0 <= s["onTimeRate"] <= 1
    c = _case(state, "C-0013")
    assert c["repairClock"]["noticeAt"] == c["createdAt"]
    unit = next(u for u in state["reference"]["units"] if u["id"] == "C-1-01")
    assert unit["vpDate"] == "2024-11-20" and unit["dlpExpiry"] == "2026-11-20"


def test_no_new_reports_after_the_dlp_ends(client):
    slot = client.get("/api/slots/visit").json()["slots"][0]
    report = {"unit_id": "C-1-01", "buyer_id": "B-0301", "description": "Ceiling leak in the kitchen", "slot": slot}
    import db
    with db.get_conn() as conn:  # block C handed over long ago: its DLP has ended
        conn.execute("UPDATE units SET vp_date = '2020-01-01' WHERE block = 'C'")
    r = client.post("/api/cases", json=report)
    assert r.status_code == 400 and "defect liability period" in r.json()["detail"]


def test_unsure_intake_after_a_follow_up_still_books_the_visit(client, monkeypatch):
    from demo_api import ai_agents, agents
    unsure = lambda ctx, description, *a, **k: {**agents.intake(description, True), "needs_human_review": True,  # noqa: E731
                                                  "confidence_score": 0.3, "review_reason": "low confidence"}
    monkeypatch.setattr(ai_agents, "intake", unsure)
    state = client.post("/api/cases/C-0013/follow-up", json={"answer": "Living room wall"}).json()["state"]
    assert _case(state, "C-0013")["status"] == "VISIT_SCHEDULED"


def test_dlp_block_row_is_worked_out_from_its_units(client):
    import db
    with db.get_conn() as conn:  # two units in block A handed over late; one in block C long ago
        conn.execute("UPDATE units SET vp_date = '2025-09-01' WHERE unit_id IN ('A-1-01', 'A-1-02')")
        conn.execute("UPDATE units SET vp_date = '2020-01-01' WHERE unit_id = 'C-1-01'")
    dlp = {b["block"]: b for b in client.get("/api/state").json()["state"]["analytics"]["statutory"]["dlp"]}
    a, c = dlp["A"], dlp["C"]
    assert (a["vpDate"], a["vpDateLast"], a["dlpExpiryLast"]) == ("2025-04-01", "2025-09-01", "2027-09-01")
    assert a["active"] == a["units"] == 150
    assert c["vpDate"] == "2020-01-01" and c["state"] == "expired" and c["expired"] == 1 and c["expired"] + c["expiring"] == 150
