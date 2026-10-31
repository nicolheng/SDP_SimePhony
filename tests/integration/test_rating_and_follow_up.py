# Buyer satisfaction rating after sign-off, and a photo with a follow-up answer, through the HTTP routes on a temp seed.db.
import base64

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.usefixtures("seed_db")
JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0follow-up").decode()


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("USE_AI_AGENTS", "false")
    import db
    from demo_api.migrate import migrate
    from demo_api.routes import router
    with db.get_conn() as conn:  # as main.py's startup does: adds the rating columns seed.db predates
        migrate(conn)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _case(state, case_id):
    return next(c for c in state["cases"] if c["id"] == case_id)


def test_buyer_rates_after_signing_off_and_sdp_sees_it(client):
    # C-0004: PENDING_SIGNOFF, developer already signed in seed.db
    r = client.post("/api/cases/C-0004/rating", json={"rating": 4})
    assert r.status_code == 400 and "after you have signed off" in r.json()["detail"]

    assert client.post("/api/cases/C-0004/verification", json={"result": "FIXED"}).status_code == 200
    state = client.post("/api/cases/C-0004/rating", json={"rating": 2, "comment": "  Took too long  "}).json()["state"]
    assert _case(state, "C-0004")["rating"]["stars"] == 2
    assert _case(state, "C-0004")["rating"]["comment"] == "Took too long"

    s = state["analytics"]["satisfaction"]
    assert s["count"] >= 1 and s["low"] >= 1
    assert s["recent"][0]["caseId"] == "C-0004" and s["recent"][0]["comment"] == "Took too long"
    assert sum(d["count"] for d in s["distribution"]) == s["count"]
    assert 0 < s["responseRate"] <= 1
    assert any(e["type"] == "feedback.submitted" and e["caseId"] == "C-0004" for e in state["events"])

    r = client.post("/api/cases/C-0004/rating", json={"rating": 5})
    assert r.status_code == 400 and "already rated" in r.json()["detail"]


@pytest.mark.parametrize("stars", [0, 6])
def test_rating_must_be_one_to_five(client, stars):
    assert client.post("/api/cases/C-0004/rating", json={"rating": stars}).status_code == 422


def test_follow_up_answer_can_carry_a_photo(client):
    # C-0013: INFO_NEEDED in seed.db
    before = len(_case(client.get("/api/state").json()["state"], "C-0013")["photos"])
    r = client.post("/api/cases/C-0013/follow-up", json={"answer": "Master bedroom ceiling", "photo": JPEG})
    assert r.status_code == 200
    photos = _case(r.json()["state"], "C-0013")["photos"]
    assert len(photos) == before + 1 and photos[-1]["kind"] == "original"


def test_follow_up_photo_must_be_an_uploaded_image(client):
    # A server file path would make tools._save_photo copy that file into uploads/.
    for photo in ("backend/schema.sql", "data:image/gif;base64,R0lGOD"):
        r = client.post("/api/cases/C-0013/follow-up", json={"answer": "Kitchen", "photo": photo})
        assert r.status_code == 422
