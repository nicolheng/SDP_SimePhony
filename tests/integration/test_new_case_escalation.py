# New reports escalate too (3rd occurrence in the unit, or a stack cluster) without blocking the normal visit:
# tools.request_extra_inspection(keep_status=True), the web app's new-report flow and the agents' new-case chain.
# Temp copy of seed.db: A-12-08 / B-0118 already has 3 water leaks; A-1-01 / B-0001 has none.
import json

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
BRIEF = {"timeline": [], "photoComparison": "Same stain.", "neighbouringUnits": [], "likelyComponents": ["Riser"],
         "checklist": ["Check the riser", "Test the membrane", "Photograph the ceiling void"]}


def _tools():
    import tools
    return tools


def _case(case_id):
    import db
    with db.get_conn() as conn:
        return dict(conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone())


def _pending_approval(case_id):
    import db
    with db.get_conn() as conn:
        row = conn.execute("SELECT approval_id FROM approvals WHERE case_id = ? AND status = 'pending'", (case_id,)).fetchone()
    return row["approval_id"] if row else None


def _booked_new_leak(unit="A-12-08", buyer="B-0118"):
    """A new water-leak report with its inspection visit booked (VISIT_SCHEDULED)."""
    tools = _tools()
    case_id = tools.create_case(unit, buyer, "Ceiling leaking in the bedroom")["case_id"]
    tools.save_intake_result(case_id, {"category": "water_leak", "sub_category": "ceiling_leak", "urgency": "normal",
                                       "location_in_unit": "bedroom ceiling", "summary": "Ceiling leak", "missing_info": []})
    options = tools.get_booking_options(case_id, "visit")
    slot = options["preferred"] or options["alternatives"][0]
    tools.assign_technician(case_id, slot["technicians"][0]["technician_id"], slot["start"], "test booking")
    return case_id


# ---------------------------------------------------------------- tools.py

def test_keep_status_request_leaves_the_visit_booked():
    tools = _tools()
    case_id = _booked_new_leak()
    r = tools.request_extra_inspection(case_id, ["Reported 4 times in this unit."], keep_status=True)
    assert r["ok"] is True and r["issue_id"] == "SI-002"
    assert _case(case_id)["status"] == "VISIT_SCHEDULED"
    assert _pending_approval(case_id) == r["approval_id"]


def test_approval_turns_the_booked_visit_into_the_detailed_inspection():
    tools = _tools()
    case_id = _booked_new_leak()
    approval = tools.request_extra_inspection(case_id, ["Reported 4 times in this unit."], keep_status=True)["approval_id"]
    tools.decide_approval(approval, True)
    assert tools.attach_inspection_brief(case_id, BRIEF)["status"] == "EXTRA_INSPECTION"


def test_rejection_leaves_a_case_that_was_never_escalated_alone():
    tools = _tools()
    case_id = _booked_new_leak()
    approval = tools.request_extra_inspection(case_id, ["Reported 4 times in this unit."], keep_status=True)["approval_id"]
    tools.decide_approval(approval, False)
    assert _case(case_id)["status"] == "VISIT_SCHEDULED"  # the normal visit just goes ahead


def test_rejected_reopen_escalation_still_goes_to_a_normal_repair():
    tools = _tools()
    assert _case("C-0011")["status"] == "ESCALATION_PENDING"  # escalated reopen in seed.db
    approval = tools.request_extra_inspection("C-0011", ["Reported 3 times in this unit."])["approval_id"]
    tools.decide_approval(approval, False)
    assert _case("C-0011")["status"] == "VALID"


# ---------------------------------------------------------------- web app (backend/demo_api/workflow.py)

def _web(action, *args):
    import db
    from demo_api import workflow
    _tools().get_clock()  # first tools connection applies the web app's migrations
    with db.get_conn() as conn:
        return action(workflow.Ctx(conn), *args)


def test_web_new_report_in_a_repeat_unit_books_the_visit_and_asks_sdp():
    from demo_api import workflow
    r = _web(workflow.submit_report, "A-12-08", "B-0118", "Water leaking from the bedroom ceiling again, bocor lagi.", None, None)
    case = _case(r["caseId"])
    assert case["status"] == "VISIT_SCHEDULED" and case["technician_id"]
    assert _pending_approval(r["caseId"])


def test_web_new_report_in_a_clean_unit_asks_nothing():
    from demo_api import workflow
    r = _web(workflow.submit_report, "A-1-01", "B-0001", "Water leaking from the bedroom ceiling.", None, None)
    assert _case(r["caseId"])["status"] == "VISIT_SCHEDULED"
    assert _pending_approval(r["caseId"]) is None


# ---------------------------------------------------------------- agents (new-case chain)

def test_agent_new_case_escalates_without_blocking_the_visit(fake_llm):
    from agents.simephony.workflow import agent_app
    tools = _tools()
    case_id = tools.create_case("A-12-08", "B-0118", "Ceiling bocor lagi in the bedroom")["case_id"]
    fake_llm.responses = [
        json.dumps({"category": "water_leak", "sub_category": "ceiling_leak", "location_in_unit": "bedroom ceiling",
                    "summary": "Ceiling leak again", "urgency": "normal", "mentions_previous_issue": True,
                    "mentioned_recurrence_count": None, "missing_info": [], "follow_up_question": "",
                    "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False}),
        json.dumps({"cluster_reason": "Fourth leak in this unit."}),
        json.dumps({"urgency": "normal", "rule": "none"}),
        "We have received your report and requested a technician visit.",
    ]
    final = agent_app.invoke({"event": "case.created", "case_id": case_id, "unit_id": "A-12-08",
                              "user_description": "Ceiling bocor lagi in the bedroom", "current_status": "SUBMITTED"})
    assert final["current_status"] == "VISIT_SCHEDULED"
    assert final["new_case_escalation"]["escalated"] is True
    assert _pending_approval(case_id) == final["new_case_escalation"]["approval_id"]
    assert _case(case_id)["status"] == "VISIT_SCHEDULED"
    assert final["comms_result"]["message"].endswith(
        "As this problem has been reported before in your unit, our team is also reviewing whether a more detailed "
        "inspection is needed.")
