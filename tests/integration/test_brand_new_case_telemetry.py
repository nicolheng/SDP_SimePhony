import json
import os
import pytest
from starlette.requests import Request


def test_new_case_has_non_null_reasoning_and_confidence_score(seed_db, monkeypatch):
    """Verify that brand new cases save non-null reasoning and confidence_score in case_events and /api/state."""
    import db
    import tools
    from demo_api import routes, workflow

    monkeypatch.setenv("USE_AI_AGENTS", "all")
    monkeypatch.setenv("EMAIL_ENABLED", "false")
    monkeypatch.setenv("EMBEDDINGS_ENABLED", "false")

    tools.get_clock()  # ensure migrations are applied

    test_cases_to_run = [
        ("A-12-08", "B-0118", "Sparking sound and burning smell from the bedroom wall socket."),
        ("A-12-08", "B-0118", "Siling bilik tidur utama bocor lagi, ini kali ketiga!"),
        ("A-12-08", "B-0118", "Small scratch on wall near the living room door."),
    ]

    new_case_ids = []
    with db.get_conn() as conn:
        ctx = workflow.Ctx(conn)
        for unit_id, buyer_id, desc in test_cases_to_run:
            res = workflow.submit_report(ctx, unit_id, buyer_id, desc, None, "")
            new_case_ids.append(res["caseId"])

    assert len(new_case_ids) == 3

    # 1. Verify case_events directly in the database for each new case
    with db.get_conn() as conn:
        for cid in new_case_ids:
            rows = conn.execute(
                "SELECT event_id, type, payload FROM case_events WHERE case_id = ? AND type = 'agent.step' ORDER BY event_id",
                (cid,),
            ).fetchall()

            assert len(rows) > 0, f"Expected agent.step events for new case {cid}"

            for r in rows:
                payload = json.loads(r["payload"])
                agent = payload.get("agent")
                data = payload.get("data")
                assert data is not None, f"Case {cid} event {r['event_id']} ({agent}) has no data field"

                confidence = data.get("confidence_score")
                reasoning = data.get("reasoning")

                assert confidence is not None, f"Case {cid} event {r['event_id']} ({agent}) has null confidence_score"
                assert isinstance(confidence, (int, float)), f"Case {cid} event {r['event_id']} ({agent}) confidence_score is not float/int"
                assert 0.0 <= confidence <= 1.0, f"Case {cid} event {r['event_id']} ({agent}) confidence_score out of range: {confidence}"

                assert reasoning is not None, f"Case {cid} event {r['event_id']} ({agent}) has null reasoning"
                assert isinstance(reasoning, dict), f"Case {cid} event {r['event_id']} ({agent}) reasoning is not a dict"
                assert (
                    reasoning.get("matched_rule") is not None
                    or reasoning.get("evidence") is not None
                    or reasoning.get("cluster_reason") is not None
                ), f"Case {cid} event {r['event_id']} ({agent}) reasoning has no explanation content: {reasoning}"

    # 2. Verify /api/state endpoint returns telemetry with reasoning and confidence_score
    request = Request({
        "type": "http",
        "method": "GET",
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "root_path": "",
        "path": "/api/state",
        "query_string": b"",
        "headers": [],
    })
    state_response = routes.get_state(request)

    for cid in new_case_ids:
        events = [
            e for e in state_response["state"]["events"]
            if e["caseId"] == cid and e["type"] == "agent.step"
        ]
        assert len(events) > 0, f"Expected agent.step events in /api/state for case {cid}"

        for e in events:
            telemetry = e.get("telemetry")
            assert telemetry is not None, f"Case {cid} event {e['id']} ({e.get('agent')}) has no telemetry in /api/state"
            assert telemetry.get("confidence_score") is not None, f"Case {cid} event {e['id']} ({e.get('agent')}) has null confidence_score in /api/state"
            assert telemetry.get("reasoning") is not None, f"Case {cid} event {e['id']} ({e.get('agent')}) has null reasoning in /api/state"
            reasoning = telemetry["reasoning"]
            assert (
                reasoning.get("matched_rule") is not None
                or reasoning.get("evidence") is not None
                or reasoning.get("cluster_reason") is not None
            ), f"Case {cid} event {e['id']} ({e.get('agent')}) telemetry.reasoning empty in /api/state: {reasoning}"
