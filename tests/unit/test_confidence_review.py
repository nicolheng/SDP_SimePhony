import json

import pytest


pytestmark = pytest.mark.usefixtures("seed_db")


def test_flag_case_for_human_review_persists_status_and_event():
    import db
    import tools

    created = tools.create_case("A-12-08", "B-0118", "Unclear ceiling defect report")
    case_id = created["case_id"]

    result = tools.flag_case_for_human_review(
        case_id,
        "IntakeAgent",
        "AI abstained due to low confidence (score: 0.50). Routed to human review.",
        0.5,
    )

    assert result == {"ok": True, "status": "PENDING_REVIEW"}
    case = tools.get_case(case_id)
    assert case["status"] == "PENDING_REVIEW"
    with db.get_conn() as conn:
        event = conn.execute(
            "SELECT type, payload FROM case_events WHERE case_id = ? ORDER BY created_at DESC LIMIT 1",
            (case_id,),
        ).fetchone()
    payload = json.loads(event["payload"])
    assert event["type"] == "case.review_requested"
    assert "score: 0.50" in payload["message"]
    assert payload["confidence_score"] == 0.5


def test_human_review_request_is_idempotent():
    import db
    import tools

    case_id = tools.create_case("A-12-08", "B-0118", "Review routing test")["case_id"]
    tools.flag_case_for_human_review(case_id, "IntakeAgent", "First review reason", 0.4)
    tools.flag_case_for_human_review(case_id, "TriageAgent", "Duplicate review reason", 0.3)

    with db.get_conn() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM case_events WHERE case_id = ? AND type = 'case.review_requested'",
            (case_id,),
        ).fetchone()[0]
    assert count == 1


def test_low_confidence_intake_saves_classification_before_review(fake_llm):
    import tools
    from agents.simephony.intake import intake_node

    case_id = tools.create_case("A-12-08", "B-0118", "Water dripping from the ceiling")["case_id"]
    fake_llm.responses = [json.dumps({
        "category": "water_leak",
        "sub_category": "ceiling leak",
        "location_in_unit": "bedroom ceiling",
        "summary": "Water dripping from the ceiling",
        "urgency": "normal",
        "mentions_previous_issue": False,
        "mentioned_recurrence_count": None,
        "missing_info": [],
        "follow_up_question": "",
        "preliminary_outcome": "VALID_DEFECT",
        "mismatch_detected": False,
        "confidence_score": 0.5,
    })]

    result = intake_node({
        "case_id": case_id,
        "user_description": "Water dripping from the ceiling",
        "decide_only": False,
    })

    case = tools.get_case(case_id)
    assert result["intake_save"]["ok"] is True
    assert result["needs_human_review"] is True
    assert case["status"] == "PENDING_REVIEW"
    assert case["category"] == "water_leak"
