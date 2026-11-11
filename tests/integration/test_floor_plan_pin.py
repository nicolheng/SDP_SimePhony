# The buyer pins each defect on the unit floor plan: the room comes from the pin, so IntakeAgent never asks
# which room it is. Other follow-up questions (too little detail, a blurry photo) are still asked.
import base64

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
UNIT, BUYER = "A-1-01", "B-0001"  # no earlier defects in seed.db
VAGUE = "There's a mark here, please check it."  # names no room: without a pin the stand-in asks which room
JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0floor-plan").decode()


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


def _report(client, description, pin=None):
    r = client.post("/api/cases", json={"unit_id": UNIT, "buyer_id": BUYER, "description": description, "photo": JPEG,
                                         "pin": pin})
    assert r.status_code == 200, r.text
    state = r.json()["state"]
    return next(c for c in state["cases"] if c["id"] == r.json()["caseId"])


@pytest.mark.parametrize("x, y, room", [
    (0.1, 0.1, "Master bedroom"), (0.39, 0.1, "Master bathroom"), (0.52, 0.1, "Common bathroom"),
    (0.7, 0.1, "Bedroom 2"), (0.9, 0.2, "Bedroom 3"), (0.5, 0.43, "Corridor"), (0.2, 0.7, "Living room"),
    (0.2, 0.93, "Balcony"), (0.55, 0.6, "Dining area"), (0.95, 0.6, "Kitchen"),
    (0.7, 0.95, "Kitchen"),  # the kitchen's L reaching down beside the foyer
    (0.53, 0.93, "Foyer"), (0.95, 0.93, "Service yard"),
    (0.0, 0.0, "Master bedroom"), (1.0, 1.0, "Service yard"),  # corners of the outer wall still name a room
])
def test_room_at(x, y, room):
    import floor_plan
    assert floor_plan.room_at(UNIT, x, y) == room


def test_pin_outside_the_plan_is_refused():
    import floor_plan
    with pytest.raises(ValueError):
        floor_plan.resolve_pin(UNIT, 1.2, 0.5)
    with pytest.raises(ValueError):
        floor_plan.resolve_pin(UNIT, None, None)
    assert floor_plan.resolve_pin(UNIT, None, None, whole_unit=True) == {"x": None, "y": None, "room": "Whole unit"}


def test_pinned_report_skips_the_room_question(client):
    c = _report(client, VAGUE, {"x": 0.95, "y": 0.6})
    assert c["status"] != "INFO_NEEDED" and not c["followUpQuestion"]
    assert c["location"] == "Kitchen"
    assert c["pin"] == {"x": 0.95, "y": 0.6, "room": "Kitchen"}


def test_report_without_a_pin_still_asks_which_room(client):
    c = _report(client, VAGUE)
    assert c["status"] == "INFO_NEEDED"
    assert "which room" in c["followUpQuestion"].lower()
    assert c["pin"] is None


def test_pinned_room_keeps_the_part_of_the_room_named(client):
    c = _report(client, "Water dripping from the ceiling, getting worse.", {"x": 0.7, "y": 0.1})
    assert c["location"] == "Bedroom 2 ceiling"


def test_pinned_room_wins_over_the_room_in_the_text(client):
    c = _report(client, "Water dripping from the master bedroom ceiling.", {"x": 0.95, "y": 0.6})
    assert c["location"] == "Kitchen ceiling"


def test_whole_unit_needs_no_pin_and_no_room_question(client):
    c = _report(client, VAGUE, {"whole_unit": True})
    assert c["status"] != "INFO_NEEDED"
    assert c["location"] == "Whole unit"
    assert c["pin"] == {"x": None, "y": None, "room": "Whole unit"}


def test_other_follow_up_questions_are_still_asked_with_a_pin(client):
    # "Bocor" is too short: the stand-in wants more detail as well as the room; only the room is answered by the pin
    c = _report(client, "Bocor", {"x": 0.1, "y": 0.1})
    assert c["status"] == "INFO_NEEDED"
    assert c["location"] == "Master bedroom"
    assert "room" not in c["followUpQuestion"].lower()
    assert "location_in_unit" not in c["missingInfo"] and c["missingInfo"]


def test_invalid_pin_is_rejected(client):
    r = client.post("/api/cases", json={"unit_id": UNIT, "buyer_id": BUYER, "description": VAGUE, "pin": {"x": 1.5, "y": 0.2}})
    assert r.status_code == 422
    r = client.post("/api/cases", json={"unit_id": UNIT, "buyer_id": BUYER, "description": VAGUE, "pin": {}})
    assert r.status_code == 400 and "floor plan" in r.json()["detail"]


def test_ai_room_question_is_dropped_but_other_details_are_kept():
    # The AI's own wording: a pin answers its location question; a blurry photo still needs asking about.
    import floor_plan
    ai = {"category": "water_leak", "summary": "Ceiling stain", "location_in_unit": None,
          "missing_info": ["exact location of the stain", "Photo is too blurry or lacks clear defect details."],
          "follow_up_question": "Where in the unit is this stain?"}
    out = floor_plan.apply_pin(ai, "Foyer", "Stain on the siling")
    assert out["location_in_unit"] == "foyer ceiling"
    assert out["missing_info"] == ["Photo is too blurry or lacks clear defect details."]
    assert out["follow_up_question"] == floor_plan.DETAIL_QUESTION
    assert out["summary"] == "Ceiling stain in foyer"
    assert floor_plan.apply_pin({**ai, "missing_info": ["location"]}, "Foyer", "x")["follow_up_question"] is None
