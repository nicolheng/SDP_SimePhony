# The web app's actions (backend/demo_api/workflow.py) with the LangGraph agents switched on (USE_AI_AGENTS),
# on a temp copy of seed.db with the fake LLM: the same clicks a person makes in the browser.
import json

import pytest

pytestmark = pytest.mark.usefixtures("seed_db")


@pytest.fixture
def ai_on(monkeypatch):
    monkeypatch.setenv("USE_AI_AGENTS", "all")


def _web(fn, *args):
    import db
    import tools
    from demo_api import workflow
    tools.get_clock()  # first tools connection applies the web app's migrations
    with db.get_conn() as conn:
        return fn(workflow.Ctx(conn), *args)


def _case(case_id):
    import db
    with db.get_conn() as conn:
        return dict(conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone())


def _messages(case_id):
    import db
    with db.get_conn() as conn:
        return [dict(r) for r in conn.execute("SELECT title, body FROM buyer_messages WHERE case_id = ? "
                                              "ORDER BY created_at, message_id", (case_id,))]


def _trace(case_id):
    import db
    with db.get_conn() as conn:
        rows = conn.execute("SELECT payload FROM case_events WHERE case_id = ? AND type = 'agent.step'", (case_id,))
        return [json.loads(r["payload"]) for r in rows]


def _report(unit="A-1-01", buyer="B-0001", text="Water dripping from the master bedroom ceiling above the wardrobe."):
    from demo_api import workflow
    return _web(workflow.submit_report, unit, buyer, text, None, None)["caseId"]


def test_full_flow_with_ai_agents(fake_llm, ai_on):
    from demo_api import workflow
    case_id = _report()
    c = _case(case_id)
    assert c["status"] == "VISIT_SCHEDULED" and c["category"] == "water_leak"
    first = _messages(case_id)[-1]
    assert first["title"] == "We've received your report" and "Requested visit time:" in first["body"]  # CommsAgent
    assert any(t.get("agent") == "TriageAgent" and t["message"].startswith("Triage:") for t in _trace(case_id))

    _web(workflow.accept_job, case_id, c["technician_id"])
    _web(workflow.record_verdict, case_id, "VALID", "Pipe joint leaking above the wardrobe; ceiling board soaked.", None)
    c = _case(case_id)
    assert c["repair_hours"] in (2, 4, 8)  # RepairEstimateAgent
    assert "Please choose a repair time in the app." in _messages(case_id)[-1]["body"]

    import tools
    start = tools.get_booking_options(case_id, "repair")["options"][0]["start"]
    _web(workflow.book_repair, case_id, start)
    _web(workflow.accept_job, case_id, _case(case_id)["technician_id"])
    _web(workflow.mark_repaired, case_id, "Resealed the joint and replaced the board.", None)
    assert _case(case_id)["status"] == "PENDING_SIGNOFF"
    assert _messages(case_id)[-1]["title"] == "Repair done"
    assert any(t.get("agent") == "VerificationAgent" and "Photo check" in t["message"] for t in _trace(case_id))

    _web(workflow.developer_signoff, case_id)
    ready = _messages(case_id)[-1]
    assert ready["title"] == "Please check the repair and sign off" and "sign off by" in ready["body"]

    _web(workflow.submit_verification, case_id, "FIXED", "", None)
    assert _case(case_id)["status"] == "CLOSED"
    assert _messages(case_id)[-1]["body"].endswith("Your case is now closed.")

    _web(workflow.reopen_case, case_id, "Damp patch is back.", "tests/data/test_cases/images/water_leak_again.jpg")
    titles = [m["title"] for m in _messages(case_id)[-2:]]
    assert titles == ["Case reopened", "Technician revisit booked"]
    assert _case(case_id)["status"] == "VISIT_SCHEDULED"


def test_repeat_unit_report_approval_and_brief_with_ai(fake_llm, ai_on):
    from demo_api import workflow
    case_id = _report("A-12-08", "B-0118", "Ceiling bocor lagi in the bedroom, third time!")
    assert "our team is also reviewing" in _messages(case_id)[-1]["body"]
    import db
    with db.get_conn() as conn:
        approval = conn.execute("SELECT approval_id FROM approvals WHERE case_id = ? AND status = 'pending'",
                                (case_id,)).fetchone()["approval_id"]
    _web(workflow.decide_approval, approval, True)
    assert _case(case_id)["status"] == "EXTRA_INSPECTION"
    with db.get_conn() as conn:
        brief = json.loads(conn.execute("SELECT brief FROM inspection_briefs WHERE case_id = ?", (case_id,)).fetchone()["brief"])
    assert brief["checklist"] == ["Verify water source", "Inspect waterproofing", "Document findings"]  # the agent's
    assert brief["timeline"] and "neighbouringUnits" in brief  # facts from the web app
    assert _messages(case_id)[-1]["title"] == "Detailed inspection scheduled"


def test_llm_down_falls_back_to_the_stand_ins(fake_llm, ai_on):
    fake_llm.client.chat.completions.create.side_effect = RuntimeError("ollama down")
    from agents.simephony.comms import NEUTRAL_TEMPLATES
    case_id = _report()
    c = _case(case_id)
    assert c["status"] == "VISIT_SCHEDULED" and c["category"] == "water_leak"  # intake + triage: the stand-ins
    m = _messages(case_id)[-1]
    # CommsAgent has its own fallback: the fixed safe template, still with the visit time
    assert m["body"].startswith(NEUTRAL_TEMPLATES["VISIT_SCHEDULED"]) and "Requested visit time:" in m["body"]


def test_switch_off_uses_the_stand_ins(fake_llm, monkeypatch):
    monkeypatch.delenv("USE_AI_AGENTS", raising=False)
    case_id = _report()
    assert fake_llm.calls == []  # no agent ran
    assert "Requested visit time:" not in _messages(case_id)[-1]["body"]


@pytest.mark.parametrize("value, name, on", [("", "comms", False), ("all", "intake", True),
                                             ("comms,triage", "triage", True), ("comms,triage", "intake", False)])
def test_switch_values(monkeypatch, value, name, on):
    from demo_api.ai_agents import enabled
    monkeypatch.setenv("USE_AI_AGENTS", value)
    assert enabled(name) is on
