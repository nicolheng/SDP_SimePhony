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
    assert not any((t.get("data") or {}).get("fallback_used") for t in _trace(case_id))

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
    assert any((t.get("data") or {}).get("step") == "intake" and (t.get("data") or {}).get("fallback_used")
               for t in _trace(case_id))
    m = _messages(case_id)[-1]
    # CommsAgent has its own fallback: the fixed safe template, still with the visit time
    assert m["body"].startswith(NEUTRAL_TEMPLATES["VISIT_SCHEDULED"]) and "Requested visit time:" in m["body"]


def test_agent_fallback_is_saved_and_returned_in_case_events(monkeypatch):
    import db
    from agents.simephony import intake as intake_agent
    from demo_api import ai_agents, state, workflow

    monkeypatch.setenv("USE_AI_AGENTS", "false")
    case_id = _report()
    monkeypatch.setenv("USE_AI_AGENTS", "all")

    def failed_intake(_state):
        raise RuntimeError("agent service unavailable")

    monkeypatch.setattr(intake_agent, "intake_node", failed_intake)
    with db.get_conn() as conn:
        ctx = workflow.Ctx(conn)
        case = workflow.load_case(ctx, case_id)
        ai_agents.intake(ctx, case["description"], None, True, case_id)
        response_state = state.build_state(ctx, "http://testserver")

    fallback_events = [
        event for event in response_state["events"]
        if event["caseId"] == case_id and event["fallbackUsed"]
    ]
    assert len(fallback_events) == 1
    assert fallback_events[0]["agent"] == "IntakeAgent"
    assert fallback_events[0]["fallbackStep"] == "intake"
    assert fallback_events[0]["fallbackReason"] == "agent service unavailable"


def test_invalid_json_twice_falls_back_without_saving_raw_output(fake_llm, monkeypatch):
    import db
    from demo_api import ai_agents, state, workflow

    monkeypatch.setenv("USE_AI_AGENTS", "false")
    case_id = _report()
    monkeypatch.setenv("USE_AI_AGENTS", "all")
    raw_output = "not valid JSON -- do not persist"
    fake_llm.responses.extend([raw_output, raw_output])

    with db.get_conn() as conn:
        ctx = workflow.Ctx(conn)
        case = workflow.load_case(ctx, case_id)
        result = ai_agents.intake(ctx, case["description"], None, True, case_id)
        response_state = state.build_state(ctx, "http://testserver")

    assert len(fake_llm.calls) == 2
    assert raw_output not in json.dumps(result)
    fallback = next(event for event in _trace(case_id) if event.get("data", {}).get("fallback_used"))
    assert fallback["data"]["fallback_used"] is True
    assert fallback["data"]["reason"] == "LLM JSON validation failed after 1 retry"
    visible_fallback = next(
        event for event in response_state["events"]
        if event["caseId"] == case_id and event["fallbackUsed"]
    )
    assert visible_fallback["fallbackReason"] == "LLM JSON validation failed after 1 retry"
    assert raw_output not in json.dumps(_case(case_id))
    assert raw_output not in json.dumps(_trace(case_id))


def test_switch_off_uses_the_stand_ins(fake_llm, monkeypatch):
    monkeypatch.delenv("USE_AI_AGENTS", raising=False)
    case_id = _report()
    assert fake_llm.calls == []  # no agent ran
    assert "Requested visit time:" not in _messages(case_id)[-1]["body"]


def test_api_defers_ai_until_the_action_is_committed(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from starlette.requests import Request

    import tools
    from demo_api import ai_agents, routes

    monkeypatch.setenv("USE_AI_AGENTS", "all")
    tools.get_clock()
    request = Request({
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "root_path": "",
        "path": "/api/cases",
        "query_string": b"",
        "headers": [],
    })
    tasks = BackgroundTasks()
    response = routes.create_case(
        routes.NewReport(
            unit_id="A-1-01",
            buyer_id="B-0001",
            description="Water dripping from the master bedroom ceiling.",
            slot="",
        ),
        request,
        tasks,
    )

    assert response["caseId"]
    assert fake_llm.calls == []
    assert len(tasks.tasks) == 1
    task = tasks.tasks[0]
    assert task.func is ai_agents.run_background_steps
    assert task.args[0] == response["caseId"]

    task.func(*task.args, **task.kwargs)
    assert fake_llm.calls


def test_case_action_succeeds_while_background_agent_is_running(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from threading import Event, Thread
    from starlette.requests import Request

    import tools
    from agents.simephony import intake as intake_agent
    from demo_api import routes

    monkeypatch.setenv("USE_AI_AGENTS", "all")
    tools.get_clock()
    request = Request({
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "root_path": "",
        "path": "/api/cases",
        "query_string": b"",
        "headers": [],
    })
    tasks = BackgroundTasks()
    response = routes.create_case(
        routes.NewReport(
            unit_id="A-1-01",
            buyer_id="B-0001",
            description="Water dripping from the master bedroom ceiling.",
            slot="",
        ),
        request,
        tasks,
    )
    started, release = Event(), Event()
    original_intake_node = intake_agent.intake_node

    def blocked_intake_node(state):
        started.set()
        assert release.wait(5)
        return original_intake_node(state)

    monkeypatch.setattr(intake_agent, "intake_node", blocked_intake_node)
    task = tasks.tasks[0]
    agent_thread = Thread(target=task.func, args=task.args, kwargs=task.kwargs)
    agent_thread.start()
    try:
        assert started.wait(5)
        case = _case(response["caseId"])
        accepted = routes.accept(
            response["caseId"],
            routes.Worker(technician_id=case["technician_id"]),
            request,
            BackgroundTasks(),
        )
        assert "state" in accepted
    finally:
        release.set()
        agent_thread.join(timeout=10)

    assert not agent_thread.is_alive()


def test_rain_uses_background_ai_and_state_refresh_sees_results(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from threading import Event, Thread
    from starlette.requests import Request

    import db
    import tools
    from agents.simephony import intake as intake_agent
    from demo_api import routes

    monkeypatch.setenv("USE_AI_AGENTS", "true")
    tools.get_clock()
    request = Request({
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "root_path": "",
        "path": "/api/demo/rain",
        "query_string": b"",
        "headers": [],
    })
    with db.get_conn() as conn:
        existing_ids = {row["case_id"] for row in conn.execute(
            "SELECT case_id FROM cases WHERE unit_id IN ('A-13-08', 'A-11-08')"
        )}

    tasks = BackgroundTasks()
    response = routes.rain(request, tasks)
    with db.get_conn() as conn:
        new_ids = {row["case_id"] for row in conn.execute(
            "SELECT case_id FROM cases WHERE unit_id IN ('A-13-08', 'A-11-08')"
        )} - existing_ids

    assert new_ids
    assert len(tasks.tasks) == len(new_ids)
    assert all(next(c for c in response["state"]["cases"] if c["id"] == case_id)["status"] == "SUBMITTED"
               for case_id in new_ids)

    started, release = Event(), Event()
    original_intake_node = intake_agent.intake_node

    def blocked_intake_node(state):
        started.set()
        assert release.wait(5)
        return original_intake_node(state)

    monkeypatch.setattr(intake_agent, "intake_node", blocked_intake_node)
    first_task = tasks.tasks[0]
    agent_thread = Thread(target=first_task.func, args=first_task.args, kwargs=first_task.kwargs)
    agent_thread.start()
    try:
        assert started.wait(5)
        while_running = routes.get_state(request)["state"]
        assert all(next(c for c in while_running["cases"] if c["id"] == case_id)["status"] == "SUBMITTED"
                   for case_id in new_ids)
    finally:
        release.set()
        agent_thread.join(timeout=10)

    assert not agent_thread.is_alive()
    for task in tasks.tasks[1:]:
        task.func(*task.args, **task.kwargs)

    refreshed_state = routes.get_state(request)["state"]
    refreshed_cases = [case for case in refreshed_state["cases"] if case["id"] in new_ids]
    assert all(case["status"] == "VISIT_SCHEDULED" for case in refreshed_cases)
    assert fake_llm.calls
    assert any(event["caseId"] in new_ids and event["agent"] == "SimilarDefectAgent"
               for event in refreshed_state["events"])


def test_rain_keeps_rule_based_flow_when_ai_is_off(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from starlette.requests import Request

    import db
    import tools
    from demo_api import routes

    monkeypatch.setenv("USE_AI_AGENTS", "false")
    tools.get_clock()
    request = Request({
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "root_path": "",
        "path": "/api/demo/rain",
        "query_string": b"",
        "headers": [],
    })
    with db.get_conn() as conn:
        existing_ids = {row["case_id"] for row in conn.execute(
            "SELECT case_id FROM cases WHERE unit_id IN ('A-13-08', 'A-11-08')"
        )}

    tasks = BackgroundTasks()
    response = routes.rain(request, tasks)
    with db.get_conn() as conn:
        new_ids = {row["case_id"] for row in conn.execute(
            "SELECT case_id FROM cases WHERE unit_id IN ('A-13-08', 'A-11-08')"
        )} - existing_ids

    assert new_ids
    assert not tasks.tasks
    assert all(next(c for c in response["state"]["cases"] if c["id"] == case_id)["status"] == "VISIT_SCHEDULED"
               for case_id in new_ids)
    assert fake_llm.calls == []


@pytest.mark.parametrize("value, name, on", [("", "comms", False), ("all", "intake", True),
                                             ("comms,triage", "triage", True), ("comms,triage", "intake", False)])
def test_switch_values(monkeypatch, value, name, on):
    from demo_api.ai_agents import enabled
    monkeypatch.setenv("USE_AI_AGENTS", value)
    assert enabled(name) is on
