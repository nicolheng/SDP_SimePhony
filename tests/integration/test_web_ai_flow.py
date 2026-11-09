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
    assert first["title"] == "We've received your report" and "Visit time:" in first["body"]  # CommsAgent
    assert any(t.get("agent") == "TriageAgent" and t["message"].startswith("Triage:") for t in _trace(case_id))
    assert not any((t.get("data") or {}).get("fallback_used") for t in _trace(case_id))

    _web(workflow.accept_job, case_id, c["technician_id"])
    _web(workflow.record_verdict, case_id, "VALID", "Pipe joint leaking above the wardrobe; ceiling board soaked.", None)
    c = _case(case_id)
    assert c["repair_hours"] in (2, 4, 8)  # RepairEstimateAgent
    # The buyer doesn't pick a time (#79): the repair is booked straight after the verdict
    assert c["status"] == "REPAIR_BOOKED"
    titles = [m["title"] for m in _messages(case_id)[-2:]]
    assert titles == ["Defect confirmed: repair being arranged", "Repair booked"]
    assert "We're booking the repair with the first available technician and will send you the time." in _messages(case_id)[-2]["body"]

    import tools
    _web(workflow.accept_job, case_id, _case(case_id)["technician_id"])
    _web(workflow.mark_repaired, case_id, "Resealed the joint and replaced the board.", None)
    assert _case(case_id)["status"] == "PENDING_SIGNOFF"
    assert _messages(case_id)[-1]["title"] == "Repair done"
    assert any(t.get("agent") == "VerificationAgent" and "Photo check" in t["message"] for t in _trace(case_id))

    _web(workflow.developer_signoff, case_id)
    ready = _messages(case_id)[-1]
    assert ready["title"] == "Please check the repair and sign off" and "sign off by" in ready["body"]

    # Fixed only verifies the defect; it closes when the buyer signs off the unit
    _web(workflow.submit_verification, case_id, "FIXED", "", None)
    assert _case(case_id)["status"] == "PENDING_SIGNOFF" and _case(case_id)["verification_status"] == "verified"
    _web(workflow.sign_off_unit, "A-1-01", "")
    assert _case(case_id)["status"] == "CLOSED"
    signed = _messages(case_id)[-1]
    assert signed["title"] == "Unit signed off" and case_id in signed["body"]

    _web(workflow.reopen_case, case_id, "Damp patch is back.", "tests/data/test_cases/images/water_leak_again.jpg")
    titles = [m["title"] for m in _messages(case_id)[-2:]]
    assert titles == ["Case reopened", "Technician revisit booked"]
    assert _case(case_id)["status"] == "VISIT_SCHEDULED"


def test_initial_intake_event_keeps_telemetry_without_case_id(fake_llm, ai_on):
    case_id = _report()

    intake_event = next(
        event for event in _trace(case_id)
        if event.get("agent") == "IntakeAgent"
        and event.get("message", "").startswith("Category:")
    )
    telemetry = intake_event["data"]
    assert telemetry["model"] == "llava-llama3"
    assert telemetry["timing_ms"] > 0
    assert "tokens" in telemetry
    assert telemetry["confidence_score"] == 0.95


def test_similar_agent_event_includes_confidence_telemetry(fake_llm, monkeypatch):
    import db
    from demo_api import ai_agents, workflow

    monkeypatch.setenv("USE_AI_AGENTS", "false")
    case_id = _report()
    monkeypatch.setenv("USE_AI_AGENTS", "all")

    with db.get_conn() as conn:
        ctx = workflow.Ctx(conn)
        ai_agents.similar(ctx, workflow.load_case(ctx, case_id))

    event = next(
        event for event in _trace(case_id)
        if event.get("agent") == "SimilarDefectAgent"
        and event.get("data", {}).get("model")
    )
    assert event["data"]["model"] == "qwen2.5:7b"
    assert event["data"]["timing_ms"] > 0
    assert event["data"]["confidence_score"] == 0.9


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
    assert m["body"].startswith(NEUTRAL_TEMPLATES["VISIT_SCHEDULED"]) and "Visit time:" in m["body"]


def test_intake_deletes_temporary_browser_photo_after_vision_call(monkeypatch):
    import db
    import tools
    from agents.simephony import intake as intake_agent
    from demo_api import ai_agents, workflow

    monkeypatch.setenv("USE_AI_AGENTS", "all")
    tools.get_clock()
    photo_path = None

    def inspect_photo(state):
        nonlocal photo_path
        from pathlib import Path

        photo_path = Path(state["image_path"])
        assert photo_path.is_file()
        assert photo_path.read_bytes() == b"buyer photo"
        return {
            "intake_result": {
                "category": "water_leak",
                "sub_category": "Ceiling leak",
                "location_in_unit": "Bedroom",
                "summary": "Ceiling leak in bedroom",
                "urgency": "normal",
                "missing_info": [],
                "confidence_score": 0.9,
            },
            "needs_human_review": False,
        }

    monkeypatch.setattr(intake_agent, "intake_node", inspect_photo)
    with db.get_conn() as conn:
        ctx = workflow.Ctx(conn)
        result = ai_agents.intake(
            ctx,
            "Water dripping from the bedroom ceiling.",
            "data:image/png;base64,YnV5ZXIgcGhvdG8=",
            True,
        )

    assert result["category"] == "water_leak"
    assert photo_path is not None
    assert not photo_path.exists()


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
    assert fallback_events[0]["telemetry"]["fallback_used"] is True
    assert fallback_events[0]["telemetry"]["fallback_reason"] == "agent service unavailable"
    assert isinstance(fallback_events[0]["telemetry"]["guardrail_hits"], list)
    event_payload = next(
        payload for payload in _trace(case_id)
        if payload.get("data", {}).get("fallback_used")
    )["data"]
    assert event_payload["fallback_reason"] == "agent service unavailable"
    assert "model" in event_payload
    assert event_payload["timing_ms"] >= 0
    assert event_payload["tokens"] is None
    assert isinstance(event_payload["guardrail_hits"], list)


def test_agent_step_records_telemetry_and_guardrail_hits(monkeypatch):
    import db
    from demo_api import ai_agents, state, workflow

    monkeypatch.setenv("USE_AI_AGENTS", "false")
    case_id = _report()
    monkeypatch.setenv("USE_AI_AGENTS", "all")

    with db.get_conn() as conn:
        ctx = workflow.Ctx(conn)
        result = ai_agents.intake(ctx, "Water leak and a scratch on wall in the bedroom.", None, True, case_id)
        response_state = state.build_state(ctx, "http://testserver")

    assert result["category"] == "paint"
    event = next(
        event for event in _trace(case_id)
        if event.get("agent") == "IntakeAgent" and event.get("data", {}).get("model")
    )
    telemetry = event["data"]
    assert telemetry["model"] == "llava-llama3"
    assert telemetry["timing_ms"] >= 0
    assert telemetry["tokens"] is None
    assert telemetry["confidence_score"] == 0.95
    assert telemetry["fallback_used"] is False
    assert telemetry["fallback_reason"] is None
    assert "category_guardrail_triggered" in telemetry["guardrail_hits"]
    assert "urgency_guardrail_triggered" in telemetry["guardrail_hits"]
    assert telemetry["confidence_score"] == 0.95
    assert telemetry["reasoning"]["matched_rule"] == "Rule: scratches on a wall are classified as paint"
    assert telemetry["reasoning"]["evidence"] == "Water leak and a scratch on wall in the bedroom."
    assert telemetry["reasoning"]["related_cases"] == []
    response_event = next(
        event for event in response_state["events"]
        if event["caseId"] == case_id and event.get("telemetry", {}).get("model")
    )
    # The saved event also keeps a nested copy under "telemetry" (tools._emit); the browser gets the fields once
    assert response_event["telemetry"] == {k: v for k, v in telemetry.items() if k != "telemetry"}


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
    assert fallback["data"]["model"] == "llava-llama3"
    assert fallback["data"]["timing_ms"] > 0
    assert fallback["data"]["tokens"] is None
    visible_fallback = next(
        event for event in response_state["events"]
        if event["caseId"] == case_id and event["fallbackUsed"]
    )
    assert visible_fallback["fallbackReason"] == "LLM JSON validation failed after 1 retry"
    assert visible_fallback["telemetry"]["model"] == "llava-llama3"
    assert visible_fallback["telemetry"]["timing_ms"] > 0
    assert raw_output not in json.dumps(_case(case_id))
    assert raw_output not in json.dumps(_trace(case_id))


def test_switch_off_uses_the_stand_ins(fake_llm, monkeypatch):
    monkeypatch.delenv("USE_AI_AGENTS", raising=False)
    case_id = _report()
    assert fake_llm.calls == []  # no agent ran
    assert "Visit time:" not in _messages(case_id)[-1]["body"]


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
    agent_events = {
        event["agent"]: event["data"]
        for event in _trace(response["caseId"])
        if (event.get("data") or {}).get("model")
    }
    for agent in ("IntakeAgent", "SimilarDefectAgent", "TriageAgent"):
        assert agent_events[agent]["confidence_score"] is not None
        assert agent_events[agent]["reasoning"] is not None
    assert agent_events["IntakeAgent"]["reasoning"]["evidence"]
    assert "cluster_reason" in agent_events["SimilarDefectAgent"]["reasoning"]
    assert agent_events["TriageAgent"]["reasoning"]["evidence"]
    api_events = routes.get_state(request)["state"]["events"]
    api_agent_events = {
        event["agent"]: event["telemetry"]
        for event in api_events
        if event["caseId"] == response["caseId"] and event["type"] == "agent.step"
        and event.get("telemetry", {}).get("model")
    }
    for agent in ("IntakeAgent", "SimilarDefectAgent", "TriageAgent"):
        assert api_agent_events[agent]["confidence_score"] is not None
        assert api_agent_events[agent]["reasoning"] is not None


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
                                             ("comms,triage", "triage", True), ("comms,triage", "intake", False),
                                             ("only", "comms", True)])
def test_switch_values(monkeypatch, value, name, on):
    from demo_api.ai_agents import enabled
    monkeypatch.setenv("USE_AI_AGENTS", value)
    assert enabled(name) is on


def _api_report(text="Water dripping from the master bedroom ceiling."):
    """POST /api/cases the way the browser sends it, with FastAPI's background tasks."""
    from fastapi import BackgroundTasks
    from starlette.requests import Request

    import tools
    from demo_api import routes
    tools.get_clock()
    request = Request({"type": "http", "method": "POST", "scheme": "http", "server": ("testserver", 80),
                       "client": ("testclient", 123), "root_path": "", "path": "/api/cases", "query_string": b"",
                       "headers": []})
    tasks = BackgroundTasks()
    response = routes.create_case(routes.NewReport(unit_id="A-1-01", buyer_id="B-0001", description=text, slot=""),
                                  request, tasks)
    return response, tasks


def _run_task(tasks, fn):
    task = next(t for t in tasks.tasks if t.func is fn)
    task.func(*task.args, **task.kwargs)


def test_only_mode_saves_the_report_first_then_runs_the_agents(fake_llm, monkeypatch):
    from demo_api import workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    response, tasks = _api_report()
    case_id = response["caseId"]
    assert fake_llm.calls == []  # the request returned before any model call
    assert _case(case_id)["status"] == "SUBMITTED"

    _run_task(tasks, workflow.process_new_report)
    assert fake_llm.calls
    assert _case(case_id)["status"] == "VISIT_SCHEDULED"
    trace = _trace(case_id)
    agents_with_a_model = {t.get("agent") for t in trace if (t.get("data") or {}).get("model")}
    assert {"IntakeAgent", "TriageAgent"} <= agents_with_a_model
    assert not any((t.get("data") or {}).get("fallback_used") for t in trace)
    assert _messages(case_id)  # CommsAgent told the buyer
    order = [t.get("agent") for t in trace]
    assert order.index("TriageAgent") < order.index("SimilarDefectAgent")  # booked first, related cases after


def test_only_mode_keeps_the_booking_when_similar_cases_fail(fake_llm, monkeypatch):
    from demo_api import workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    answer = fake_llm.client.chat.completions.create.side_effect

    def create(**kwargs):
        if "defect analysis expert" in json.dumps(kwargs.get("messages")):
            raise RuntimeError("similar model down")
        return answer(**kwargs)

    fake_llm.client.chat.completions.create.side_effect = create
    response, tasks = _api_report()
    case_id = response["caseId"]
    _run_task(tasks, workflow.process_new_report)
    c = _case(case_id)
    assert c["status"] == "VISIT_SCHEDULED" and c["technician_id"]  # not held for review, visit kept
    assert any(t.get("agent") == "SimilarDefectAgent" and t["message"].startswith("Could not link related cases")
               for t in _trace(case_id))


def test_only_mode_holds_the_report_for_review_when_an_agent_fails(fake_llm, monkeypatch):
    import db
    from demo_api import workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    fake_llm.client.chat.completions.create.side_effect = RuntimeError("ollama down")
    response, tasks = _api_report()  # saving the report needs no model
    case_id = response["caseId"]

    _run_task(tasks, workflow.process_new_report)
    assert _case(case_id)["status"] == "PENDING_REVIEW"
    with db.get_conn() as conn:
        reason = json.loads(conn.execute("SELECT payload FROM case_events WHERE case_id = ? AND type = 'case.review_requested'",
                                         (case_id,)).fetchone()["payload"])["message"]
    assert "could not finish" in reason and "IntakeAgent failed" in reason
    assert not _messages(case_id)  # no rule-based message was sent instead


# ---------- Repair sign-off: VerificationAgent's photo check goes to SDP, never to "Held for review" ----------

_LEAK_PHOTO = "tests/data/test_cases/images/ceiling-water-leak.jpg"


@pytest.fixture
def photo_check_resolved(monkeypatch):
    """The vision model's answer for a real repair photo (the fake LLM has no photo-check JSON)."""
    from agents.simephony import verification
    monkeypatch.setattr(verification, "assess_repair_photo", lambda state: {
        "assessment": "looks_resolved", "observations": "The ceiling board is dry and repainted.",
        "matches_location": True, "confidence_score": 0.9})


def _repaired(repair_photo, report_photo=_LEAK_PHOTO):
    """A water leak report taken through to Mark Repaired with the AI agents on."""
    import tools
    from demo_api import workflow
    case_id = _web(workflow.submit_report, "A-1-01", "B-0001",
                   "Water dripping from the master bedroom ceiling above the wardrobe.", report_photo, None)["caseId"]
    _web(workflow.accept_job, case_id, _case(case_id)["technician_id"])
    _web(workflow.record_verdict, case_id, "VALID", "Pipe joint leaking above the wardrobe.", None)
    assert _case(case_id)["status"] == "REPAIR_BOOKED"  # booked automatically (#79)
    _web(workflow.accept_job, case_id, _case(case_id)["technician_id"])
    _web(workflow.mark_repaired, case_id, "Resealed the joint and replaced the board.", repair_photo)
    return case_id


def test_repair_photo_check_is_saved_for_the_developer_signoff(fake_llm, ai_on, photo_check_resolved):
    case_id = _repaired("tests/data/test_cases/images/ceiling_repaired.jpg")
    c = _case(case_id)
    assert c["status"] == "PENDING_SIGNOFF" and not c["developer_signed_at"]
    check = json.loads(c["repair_photo_check"])
    assert check["assessment"] == "looks_resolved" and check["flagged"] is False and check["source"] == "ai" and check["at"]
    assert "dry and repainted" in check["observations"]


def test_same_repair_photo_is_flagged_at_signoff_not_held(fake_llm, ai_on):
    case_id = _repaired(_LEAK_PHOTO)  # the technician uploads the buyer's own photo
    c = _case(case_id)
    assert c["status"] == "PENDING_SIGNOFF"  # SDP decides at the developer sign-off
    check = json.loads(c["repair_photo_check"])
    assert check["flagged"] is True and check["source"] == "rule" and check["confidence"] is None
    assert _messages(case_id)[-1]["title"] == "Repair done"


def test_sdp_rejects_the_repair_and_a_new_repair_is_booked(fake_llm, ai_on, photo_check_resolved):
    from demo_api import workflow
    case_id = _repaired(_LEAK_PHOTO)
    with pytest.raises(workflow.WorkflowError):
        _web(workflow.reject_repair, case_id, "   ")  # a reason is required
    _web(workflow.reject_repair, case_id, "The photo still shows the stain; please redo the repair.")
    c = _case(case_id)
    # A new repair is booked straight away (#79); the buyer is told why, then the new time
    assert c["status"] == "REPAIR_BOOKED" and c["repaired_at"] is None and c["booking_status"] == "PENDING"
    told, booked = _messages(case_id)[-2:]
    assert told["title"] == "Your repair needs another visit" and "still shows the stain" in told["body"]
    assert booked["title"] == "Repair booked"
    # A fresh Mark Repaired clears the old photo check
    _web(workflow.accept_job, case_id, _case(case_id)["technician_id"])
    _web(workflow.mark_repaired, case_id, "Redid the seal.", "tests/data/test_cases/images/ceiling_repaired.jpg")
    assert json.loads(_case(case_id)["repair_photo_check"])["flagged"] is False  # the old flagged check is replaced


def test_reject_is_refused_after_the_developer_signed(fake_llm, ai_on, photo_check_resolved):
    from demo_api import workflow
    case_id = _repaired("tests/data/test_cases/images/ceiling_repaired.jpg")
    _web(workflow.developer_signoff, case_id)
    with pytest.raises(workflow.WorkflowError):
        _web(workflow.reject_repair, case_id, "Changed my mind")


# ---------- USE_AI_AGENTS=only: a click returns before CommsAgent / RepairEstimateAgent run ----------

def _request(path):
    from starlette.requests import Request
    return Request({"type": "http", "method": "POST", "scheme": "http", "server": ("testserver", 80),
                    "client": ("testclient", 123), "root_path": "", "path": path, "query_string": b"", "headers": []})


def test_only_mode_clicks_return_before_the_ai_writes_the_message(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from demo_api import routes, workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    response, tasks = _api_report()
    case_id = response["caseId"]
    _run_task(tasks, workflow.process_new_report)
    tech = _case(case_id)["technician_id"]

    # Accept: the job is accepted at once; the "Technician confirmed" message comes after the click
    calls, before = len(fake_llm.calls), len(_messages(case_id))
    tasks = BackgroundTasks()
    routes.accept(case_id, routes.Worker(technician_id=tech), _request("/accept"), tasks)
    assert len(fake_llm.calls) == calls and len(_messages(case_id)) == before
    assert _case(case_id)["booking_status"] == "CONFIRMED"
    _run_task(tasks, workflow.run_after_click)
    assert _messages(case_id)[-1]["title"] == "Technician confirmed"

    # Valid: saved at once; the estimate, then the message quoting it, come after the click
    calls = len(fake_llm.calls)
    tasks = BackgroundTasks()
    routes.verdict(case_id, routes.Verdict(outcome="VALID", note="Pipe joint leaking above the wardrobe."),
                   _request("/verdict"), tasks)
    assert len(fake_llm.calls) == calls and _case(case_id)["status"] == "VALID"
    assert _case(case_id)["repair_hours"] is None
    # RepairEstimateAgent's scope facts (the fake LLM has none of its own)
    fake_llm.responses.append(json.dumps({"area": "small", "parts_to_replace": True, "multiple_spots": False,
                                          "needs_drying_or_curing": False}))
    _run_task(tasks, workflow.run_after_click)
    assert _case(case_id)["repair_hours"]
    # After the estimate and the message quoting it, the repair is booked (#79)
    assert _case(case_id)["status"] == "REPAIR_BOOKED"
    confirmed, booked = _messages(case_id)[-2:]
    assert "We're booking the repair with the first available technician and will send you the time." in confirmed["body"] and booked["title"] == "Repair booked"
    trace = _trace(case_id)
    assert any(t.get("agent") == "RepairEstimateAgent" and (t.get("data") or {}).get("model") for t in trace)


def test_only_mode_failed_message_after_click_is_shown_in_the_trace(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from demo_api import routes, workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    response, tasks = _api_report()
    case_id = response["caseId"]
    _run_task(tasks, workflow.process_new_report)
    fake_llm.client.chat.completions.create.side_effect = RuntimeError("ollama down")
    tasks = BackgroundTasks()
    routes.accept(case_id, routes.Worker(technician_id=_case(case_id)["technician_id"]), _request("/accept"), tasks)
    _run_task(tasks, workflow.run_after_click)
    assert _case(case_id)["booking_status"] == "CONFIRMED"  # the click itself stays
    assert any(t.get("agent") == "CommsAgent" and "Could not finish the buyer message" in t["message"] for t in _trace(case_id))


def _escalated_report_in_only_mode():
    """A 4th water leak in A-12-08 (stack A-08 cluster in seed.db): booked, with an extra inspection requested."""
    from fastapi import BackgroundTasks
    from demo_api import routes, workflow
    tasks = BackgroundTasks()
    response = routes.create_case(routes.NewReport(unit_id="A-12-08", buyer_id="B-0118", slot="",
                                                   description="Siling bilik tidur utama bocor lagi, ini kali ketiga!"),
                                  _request("/api/cases"), tasks)
    case_id = response["caseId"]
    _run_task(tasks, workflow.process_new_report)
    import db
    with db.get_conn() as conn:
        approval_id = conn.execute("SELECT approval_id FROM approvals WHERE case_id = ? AND status = 'pending'",
                                   (case_id,)).fetchone()["approval_id"]
    return case_id, approval_id


def _brief(case_id):
    import db
    with db.get_conn() as conn:
        return conn.execute("SELECT brief FROM inspection_briefs WHERE case_id = ?", (case_id,)).fetchone()


def test_only_mode_approving_an_extra_inspection_returns_before_the_brief(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from demo_api import routes, workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    case_id, approval_id = _escalated_report_in_only_mode()
    calls = len(fake_llm.calls)
    tasks = BackgroundTasks()
    routes.decision(approval_id, routes.Decision(approve=True), _request("/decision"), tasks)
    assert len(fake_llm.calls) == calls and _brief(case_id) is None  # the click returned before the model ran
    _run_task(tasks, workflow.run_after_click)
    assert _brief(case_id) is not None
    c = _case(case_id)
    assert c["status"] == "EXTRA_INSPECTION" and c["technician_id"]


def test_only_mode_failed_brief_can_be_tried_again(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from demo_api import routes, workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    case_id, approval_id = _escalated_report_in_only_mode()
    working = fake_llm.client.chat.completions.create.side_effect
    fake_llm.client.chat.completions.create.side_effect = RuntimeError("ollama down")
    tasks = BackgroundTasks()
    routes.decision(approval_id, routes.Decision(approve=True), _request("/decision"), tasks)
    _run_task(tasks, workflow.run_after_click)
    assert _brief(case_id) is None  # nothing half-saved
    assert any(t.get("agent") == "InitialInspectionAgent" and t["message"].startswith("Could not finish")
               for t in _trace(case_id))

    fake_llm.client.chat.completions.create.side_effect = working
    tasks = BackgroundTasks()
    routes.retry_brief(approval_id, _request("/retry-brief"), tasks)
    _run_task(tasks, workflow.run_after_click)
    assert _brief(case_id) is not None and _case(case_id)["status"] == "EXTRA_INSPECTION"
    with pytest.raises(Exception):  # nothing left to retry
        routes.retry_brief(approval_id, _request("/retry-brief"), BackgroundTasks())


def test_only_mode_follow_up_answer_returns_before_the_agents_run(fake_llm, monkeypatch):
    from fastapi import BackgroundTasks
    from demo_api import routes, workflow
    monkeypatch.setenv("USE_AI_AGENTS", "only")
    response, tasks = _api_report(text="Water keeps dripping from the ceiling.")  # names no room: IntakeAgent asks
    case_id = response["caseId"]
    _run_task(tasks, workflow.process_new_report)
    assert _case(case_id)["status"] == "INFO_NEEDED"

    calls = len(fake_llm.calls)
    tasks = BackgroundTasks()
    routes.follow_up(case_id, routes.FollowUp(answer="In the master bedroom, above the wardrobe."), _request("/follow-up"), tasks)
    c = _case(case_id)
    assert len(fake_llm.calls) == calls  # Send returned before any model call
    assert c["status"] == "SUBMITTED" and not c["follow_up_question"]

    _run_task(tasks, workflow.process_new_report)
    c = _case(case_id)
    assert c["status"] == "VISIT_SCHEDULED" and c["technician_id"]  # no second question: the answer is taken as given
    assert "bedroom" in (c["location_in_unit"] or "").lower()
    import db
    with db.get_conn() as conn:
        assert conn.execute("SELECT 1 FROM case_events WHERE case_id = ? AND type = 'case.answered'", (case_id,)).fetchone()
