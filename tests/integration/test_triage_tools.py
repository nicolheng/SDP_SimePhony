# TriageAgent's urgency saved on the case: tools.set_triage_result (temp seed.db).
import pytest

pytestmark = pytest.mark.usefixtures("seed_db")
CASE = "C-0009"  # SUBMITTED in seed.db


def _tools():
    import tools
    return tools


def test_saved_urgency_is_what_booking_and_the_case_page_use():
    tools = _tools()
    r = tools.set_triage_result(CASE, "high", "Assigned plumbing. Urgency set by rule: active water leak near electrical fittings.")
    assert r == {"ok": True, "urgency": "high"}
    assert tools.get_case(CASE)["urgency"] == "high"
    assert tools.get_booking_options(CASE, "visit")["urgency"] == "high"


def test_reason_is_recorded_as_an_agent_step():
    import json
    import db
    _tools().set_triage_result(CASE, "normal", "Assigned plumbing based on drainage and normal urgency.")
    with db.get_conn() as conn:
        row = conn.execute("SELECT type, payload FROM case_events WHERE case_id = ? ORDER BY created_at DESC, "
                           "event_id DESC LIMIT 1", (CASE,)).fetchone()
    payload = json.loads(row["payload"])
    assert row["type"] == "agent.step" and payload["agent"] == "TriageAgent" and "normal" in payload["message"]


def test_bad_urgency_is_refused():
    r = _tools().set_triage_result(CASE, "urgent", "x")
    assert r["ok"] is False and "high / normal / low" in r["error"]


def test_only_before_the_visit_is_booked():
    r = _tools().set_triage_result("C-0004", "high", "x")  # PENDING_SIGNOFF
    assert r["ok"] is False and "SUBMITTED" in r["error"]


def test_triage_agent_saves_its_result(fake_llm):
    from agents.simephony.triage import triage_node
    out = triage_node({"case_id": CASE, "user_description": "Pipe under the sink drips.",
                       "intake_result": {"category": "plumbing", "urgency": "low"}})
    assert out["triage_result"]["save_error"] is None
    assert _tools().get_case(CASE)["urgency"] == "low"
