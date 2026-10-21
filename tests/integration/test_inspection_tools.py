# SDP approves an extra inspection -> InitialInspectionAgent's brief -> detailed inspection booked (temp seed.db).
import json

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
BRIEF = json.dumps({"timeline": [{"at": "2026-10", "text": "Leak reported again"}], "photoComparison": "Same stain.",
                    "neighbouringUnits": [], "likelyComponents": ["Riser joint"],
                    "checklist": ["Check the riser", "Test the membrane", "Photograph the ceiling void"]})


def test_approval_runs_brief_booking_and_buyer_update(fake_llm):
    import db
    import tools
    from agents.simephony.workflow import agent_app
    # H-0002: A-12-08 water leak with a pending extra-inspection request (APR-0002) in seed.db
    assert tools.decide_approval("APR-0002", True)["ok"] is True
    fake_llm.responses = [BRIEF, "A detailed inspection of your case has been arranged."]
    final = agent_app.invoke({"event": "inspection.approved", "case_id": "H-0002", "unit_id": "A-12-08",
                              "current_status": "ESCALATION_PENDING",
                              "intake_result": {"category": "water_leak", "urgency": "normal"}})
    assert final["initial_inspection_result"]["save_error"] is None
    assert final["current_status"] == "EXTRA_INSPECTION"
    with db.get_conn() as conn:
        case = dict(conn.execute("SELECT status, booking_status, technician_id FROM cases WHERE case_id = 'H-0002'").fetchone())
        brief = conn.execute("SELECT brief FROM inspection_briefs WHERE case_id = 'H-0002'").fetchone()
    assert case["status"] == "EXTRA_INSPECTION" and case["booking_status"] == "PENDING" and case["technician_id"]
    assert len(json.loads(brief["brief"])["checklist"]) == 3
    assert final["comms_result"]["title"] == "Detailed inspection scheduled"
