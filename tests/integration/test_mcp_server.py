"""Integration tests for backend/tools.py and the MCP server (backend/mcp_server.py).

Agent tools are called through a real in-memory MCP client; human actions (verdict, repair booking,
verification, sign-off, approval, reopen) are not exposed over MCP, so they are called directly, as the
web app will. Each test runs on a fresh copy of data/seed.db with the web app's migrations and demo
clock; the live DB, uploads/ and Gmail are never touched. Run: pytest tests/integration/test_mcp_server.py -v
"""
import asyncio
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import db  # noqa: E402
import tools  # noqa: E402
from demo_api.state import build_state  # noqa: E402
from demo_api.timeutil import demo_now  # noqa: E402
from demo_api.workflow import Ctx  # noqa: E402
from fastmcp import Client  # noqa: E402
from mcp_server import mcp  # noqa: E402

PHOTO = str(ROOT / "tests" / "data" / "test_cases" / "images" / "water_leak_again.jpg")

AGENT_TOOLS = {
    "get_clock", "get_case", "get_unit", "get_case_history", "get_available_slots", "get_booking_options",
    "get_verification_protocol", "find_similar_cases", "check_escalation", "get_stack_cases", "get_recurring_stats",
    "get_systemic_issues", "get_approval_status", "save_intake_result", "save_similar_cases", "assign_technician",
    "escalate_booking", "start_verification", "request_extra_inspection", "attach_inspection_brief", "notify_buyer",
    "notify_technician", "send_email", "log_agent_step",
}
HUMAN_ACTIONS = {"create_case", "add_photo", "answer_follow_up", "respond_to_assignment", "book_repair", "record_verdict",
                 "mark_repaired", "record_verification", "record_signoff", "reopen_case", "decide_approval"}

LEAK_INTAKE = {"category": "water_leak", "sub_category": "ceiling_leak", "location_in_unit": "master bedroom ceiling",
               "summary": "Ceiling leak above wardrobe", "urgency": "high", "missing_info": [], "follow_up_question": "",
               "preliminary_outcome": "VALID_DEFECT"}


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    shutil.copyfile(ROOT / "data" / "seed.db", path)
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(tools, "UPLOADS_DIR", tmp_path / "uploads")
    monkeypatch.setenv("EMAIL_ENABLED", "false")
    monkeypatch.setenv("EMBEDDINGS_ENABLED", "false")
    return path


def run(scenario):
    """Run an async scenario with a connected in-memory MCP client."""
    async def main():
        async with Client(mcp) as client:
            async def call(name, **args):
                res = await client.call_tool(name, args, raise_on_error=False)
                assert not res.is_error, f"{name} raised: {res.content[0].text}"
                data = res.structured_content
                return data["result"] if data and set(data) == {"result"} else data
            await scenario(client, call)
    asyncio.run(main())


def ok(result):
    assert isinstance(result, dict) and result.get("ok") is not False, result
    return result


def refused(result, contains):
    assert result.get("ok") is False and contains in result["error"], result


def ui_case(case_id):
    """The case as the web app's /api/state shows it."""
    with db.get_conn() as conn:
        state = build_state(Ctx(conn), "http://test")
    return next(c for c in state["cases"] if c["id"] == case_id), state


async def reported_and_triaged(call, unit_id="A-12-08", accept=True):
    """Buyer reports with a preferred time; intake; triage requests the preferred time; technician accepts."""
    unit = await call("get_unit", unit_id=unit_id)
    preferred = (await call("get_available_slots", block=unit["block"], skill=["plumbing", "waterproofing"], limit=1))[0]["start"]
    cid = ok(tools.create_case(unit_id, unit["buyer"]["buyer_id"], "Ceiling bocor lagi above the wardrobe", preferred, PHOTO))["case_id"]
    ok(await call("save_intake_result", case_id=cid, intake=LEAK_INTAKE))
    options = ok(await call("get_booking_options", case_id=cid))
    assert options["preferred"]["start"] == preferred
    tech = options["preferred"]["technicians"][0]["technician_id"]
    res = ok(await call("assign_technician", case_id=cid, technician_id=tech, start=preferred, reason="Free at the buyer's time"))
    assert res["status"] == "ASSIGNED" and res["booking_status"] == "PENDING"
    if accept:
        assert ok(tools.respond_to_assignment(cid, True))["status"] == "VISIT_SCHEDULED"
    return cid, preferred, tech


async def repaired_and_verifying(call, cid, technician_id=None):
    ok(tools.record_verdict(cid, "VALID", "Active leak from the slab above"))
    option = ok(await call("get_booking_options", case_id=cid, kind="repair"))["options"][0]
    booked = ok(tools.book_repair(cid, option["start"], technician_id))
    ok(tools.mark_repaired(cid, "Resealed pipe sleeve, replaced ceiling board above wardrobe"))
    steps = ok(await call("get_verification_protocol", category="water_leak"))["steps"]
    ok(await call("start_verification", case_id=cid, guide={"intro": "Your ceiling leak was repaired.", "steps": steps}))
    return booked


def test_mcp_exposes_agent_tools_but_not_human_decisions():
    async def scenario(client, call):
        names = {t.name for t in await client.list_tools()}
        assert names == AGENT_TOOLS
        assert not names & HUMAN_ACTIONS
        rules = await client.read_resource("simephony://rules")
        assert "verification_protocols" in rules[0].text
        clock = await call("get_clock")
        assert clock["now"].endswith("Z")
    run(scenario)


def test_new_case_intake_follow_up_and_triage_at_preferred_time():
    async def scenario(client, call):
        unit = await call("get_unit", unit_id="A-12-08")
        preferred = (await call("get_available_slots", block="A", skill="plumbing", limit=1))[0]["start"]
        cid = ok(tools.create_case("A-12-08", unit["buyer"]["buyer_id"], "bocor", preferred, PHOTO))["case_id"]
        res = ok(await call("save_intake_result", case_id=cid, intake={**LEAK_INTAKE, "location_in_unit": "",
                                                                        "follow_up_question": "Which room is the leak in?"}))
        assert res["status"] == "INFO_NEEDED"
        refused(await call("assign_technician", case_id=cid, technician_id="T-01", start=preferred, reason="x"), "INFO_NEEDED")
        ok(tools.answer_follow_up(cid, "Master bedroom, above the wardrobe"))
        assert ok(await call("save_intake_result", case_id=cid, intake=LEAK_INTAKE))["status"] == "SUBMITTED"

        # The buyer's chosen time survived the follow-up question
        options = ok(await call("get_booking_options", case_id=cid))
        assert options["preferred_at"] == preferred and options["preferred"]
        assert set(options["skills"]) == {"plumbing", "waterproofing"}
        assert all(a["start"] != preferred for a in options["alternatives"])
        tech = options["preferred"]["technicians"][0]["technician_id"]
        res = ok(await call("assign_technician", case_id=cid, technician_id=tech, start=preferred, reason="Free at the buyer's time"))
        assert res["status"] == "ASSIGNED"
        refused(tools.record_verdict(cid, "VALID", "x"), "Cannot record a verdict")
        assert ok(tools.respond_to_assignment(cid, True))["status"] == "VISIT_SCHEDULED"
        refused(tools.respond_to_assignment(cid, True), "no visit waiting")

        case, state = ui_case(cid)
        assert case["visitSlot"] == preferred and case["technicianId"] == tech
        assert "Master bedroom" in case["description"]
        messages = [e["message"] for e in state["events"] if e["caseId"] == cid]
        assert all(messages) and any("Assigned to" in m for m in messages)
    run(scenario)


def test_full_lifecycle_escalation_reuses_si002_and_reopen_grace():
    async def scenario(client, call):
        cid, _, _ = await reported_and_triaged(call)

        # Water leak repair: 4 h by the waterproofing subcontractor, two 2-hour blocks
        booked = await repaired_and_verifying(call, cid)
        assert booked["repair_hours"] == 4 and booked["technician_id"].startswith("SC-")
        assert len([b for b in (await call("get_case", case_id=cid))["bookings"] if b["kind"] == "repair"]) == 0  # released when repaired
        case, _ = ui_case(cid)
        assert case["status"] == "PENDING_SIGNOFF" and case["verificationGuide"]["intro"] == "Your ceiling leak was repaired."

        # Developer signs, buyer says not fixed (photo required) -> reopened
        ok(tools.record_signoff(cid, "developer"))
        refused(tools.record_verification(cid, "NOT_FIXED", "Still damp"), "photo")
        assert ok(tools.record_verification(cid, "NOT_FIXED", "Still damp", PHOTO))["status"] == "REOPENED"

        # 3 earlier leaks in A-12-08 + stack A-08 cluster; SI-002 is already open for the stack
        esc = ok(await call("check_escalation", case_id=cid))
        assert esc["occurrence_count"] == 4 and esc["repeated_defect"] and esc["stack_cluster"] and esc["should_escalate"]
        assert esc["existing_systemic_issue"]["issue_id"] == "SI-002"
        req = ok(await call("request_extra_inspection", case_id=cid, reasons=esc["reasons"]))
        assert req["issue_id"] == "SI-002" and req["reused_issue"]
        refused(await call("request_extra_inspection", case_id=cid, reasons=["again"]), "pending")
        si = next(i for i in await call("get_systemic_issues") if i["issue_id"] == "SI-002")
        assert cid in si["related_cases"] and si["approval_id"] == req["approval_id"]

        # Brief only after approval
        refused(await call("attach_inspection_brief", case_id=cid, brief={"checklist": ["x"]}), "no approved")
        ok(tools.decide_approval(req["approval_id"], True))
        refused(tools.decide_approval(req["approval_id"], False), "already")
        ok(await call("attach_inspection_brief", case_id=cid, brief={
            "timeline": [{"at": "2026-10-19T01:00:00.000Z", "text": "Reported"}], "photoComparison": "Stain grew",
            "neighbouringUnits": [], "likelyComponents": ["Riser"], "checklist": ["Check riser", "Moisture readings"]}))

        # Joint extra inspection with the subcontractor, then repair by that subcontractor
        options = ok(await call("get_booking_options", case_id=cid))
        slot = options["alternatives"][0]
        res = ok(await call("assign_technician", case_id=cid, technician_id=slot["technicians"][0]["technician_id"],
                            start=slot["start"], reason="Extra inspection", support_id="SC-01"))
        assert res["status"] == "EXTRA_INSPECTION" and res["booking_status"] == "PENDING"
        refused(tools.record_verdict(cid, "VALID", "x"), "isn't confirmed")
        assert ok(tools.respond_to_assignment(cid, True))["status"] == "EXTRA_INSPECTION"
        case, _ = ui_case(cid)
        assert case["supportId"] == "SC-01" and case["inspectionBrief"]["checklist"] == ["Check riser", "Moisture readings"]
        booked = await repaired_and_verifying(call, cid)
        assert booked["technician_id"] == "SC-01"

        # The developer signs off first; the buyer can't sign before them
        refused(tools.record_verification(cid, "FIXED", "Dry after shower test"), "developer")
        assert ok(tools.record_signoff(cid, "developer"))["status"] == "PENDING_SIGNOFF"
        assert ok(tools.record_verification(cid, "FIXED", "Dry after shower test"))["status"] == "CLOSED"

        # Reopen within 30 days (demo clock); refused once the clock passes the grace period
        assert ok(tools.reopen_case(cid, "Leaking again", PHOTO))["reopen_count"] == 2
        with db.get_conn() as conn:
            conn.execute("UPDATE cases SET status = 'CLOSED', closed_at = ? WHERE case_id = ?", (demo_now(conn), cid))
            conn.execute("UPDATE app_meta SET value = CAST(value AS REAL) + 31 WHERE key = 'clock_offset_days'")
        refused(tools.reopen_case(cid, "Again", PHOTO), "within 30 days")

        events = [e["type"] for e in await call("get_case_history", case_id=cid)]
        for expected in ("case.created", "case.assigned", "repair.booked", "repair.done", "verification.requested",
                         "case.reopened", "recurrence.detected", "inspection.requested", "inspection.approved", "case.closed", "email.sent"):
            assert expected in events
    run(scenario)


def test_rejected_escalation_returns_to_valid():
    async def scenario(client, call):
        cid, _, _ = await reported_and_triaged(call)
        await repaired_and_verifying(call, cid)
        ok(tools.record_verification(cid, "NOT_FIXED", "Still damp", PHOTO))
        req = ok(await call("request_extra_inspection", case_id=cid, reasons=["test"]))
        ok(tools.decide_approval(req["approval_id"], False))
        assert (await call("get_case", case_id=cid))["status"] == "VALID"
        assert next(i for i in await call("get_systemic_issues") if i["issue_id"] == req["issue_id"])["status"] == "monitoring"
    run(scenario)


def test_revisit_after_reopen_below_threshold():
    async def scenario(client, call):
        # B-2-01 has no water-leak history: reopen -> no escalation -> revisit booking
        cid, _, _ = await reported_and_triaged(call, unit_id="B-2-01")
        await repaired_and_verifying(call, cid)
        ok(tools.record_verification(cid, "NOT_FIXED", "Still damp", PHOTO))
        assert not ok(await call("check_escalation", case_id=cid))["should_escalate"]
        slot = ok(await call("get_booking_options", case_id=cid))["alternatives"][0]
        first = slot["technicians"][0]["technician_id"]
        assert ok(await call("assign_technician", case_id=cid, technician_id=first, start=slot["start"], reason="Revisit"))["status"] == "ASSIGNED"
        assert (await call("get_case", case_id=cid))["verdict_at"] is None  # new inspection, new verdict

        # A rejected revisit goes back to REOPENED, not SUBMITTED
        assert ok(tools.respond_to_assignment(cid, False, "On leave"))["status"] == "REOPENED"
        slot = ok(await call("get_booking_options", case_id=cid))["alternatives"][0]
        second = slot["technicians"][0]["technician_id"]
        assert second != first
        ok(await call("assign_technician", case_id=cid, technician_id=second, start=slot["start"], reason="Revisit"))
        assert ok(tools.respond_to_assignment(cid, True))["status"] == "VISIT_SCHEDULED"
    run(scenario)


def test_technician_rejects_then_reassigned_then_all_reject_escalates():
    async def scenario(client, call):
        cid, preferred, first = await reported_and_triaged(call, accept=False)
        refused(tools.respond_to_assignment(cid, False), "reason")
        res = ok(tools.respond_to_assignment(cid, False, "Emergency elsewhere"))
        assert res == {"ok": True, "status": "SUBMITTED", "booking_status": "REJECTED", "needs_reassignment": True,
                       "rejected_technicians": [first]}
        case = await call("get_case", case_id=cid)
        assert case["technician_id"] is None and not case["bookings"]   # held time released

        options = ok(await call("get_booking_options", case_id=cid))
        assert options["excluded_technicians"] == [first]
        assert all(first not in [t["technician_id"] for t in a["technicians"]] for a in options["alternatives"])
        refused(await call("assign_technician", case_id=cid, technician_id=first, start=preferred, reason="x"), "already rejected")

        # Every remaining qualified technician rejects -> nobody left -> escalate to SDP
        qualified = {s["technician_id"] for s in await call("get_available_slots", block="A", skill=options["skills"], limit=500)}
        for _ in range(len(qualified) - 1):
            options = ok(await call("get_booking_options", case_id=cid))
            slot = (options["preferred"] or options["alternatives"][0])
            ok(await call("assign_technician", case_id=cid, technician_id=slot["technicians"][0]["technician_id"], start=slot["start"], reason="x"))
            ok(tools.respond_to_assignment(cid, False, "Busy"))
        options = ok(await call("get_booking_options", case_id=cid))
        assert options["no_availability"] and set(options["excluded_technicians"]) == qualified
        assert ok(await call("escalate_booking", case_id=cid, reason="All qualified technicians rejected"))["booking_status"] == "NEEDS_STAFF"
        history = (await call("get_case", case_id=cid))["assignment_history"]
        assert [h["outcome"] for h in history] == ["REJECTED"] * len(qualified)

        _, state = ui_case(cid)
        messages = [e["message"] for e in state["events"] if e["caseId"] == cid]
        assert any("rejected the visit" in m for m in messages)
    run(scenario)


def test_acceptance_starts_a_new_round_of_exclusions():
    async def scenario(client, call):
        cid, _, first = await reported_and_triaged(call, accept=False)
        ok(tools.respond_to_assignment(cid, False, "Busy"))
        slot = ok(await call("get_booking_options", case_id=cid))["alternatives"][0]
        ok(await call("assign_technician", case_id=cid, technician_id=slot["technicians"][0]["technician_id"], start=slot["start"], reason="x"))
        ok(tools.respond_to_assignment(cid, True))
        # A later reschedule may use the technician who declined the earlier round
        assert ok(await call("get_booking_options", case_id=cid))["excluded_technicians"] == []
    run(scenario)


def test_business_rule_refusals():
    async def scenario(client, call):
        cid, preferred, tech = await reported_and_triaged(call)
        # Wrong skill, subcontractor for a visit, busy technician, invalid time
        refused(await call("assign_technician", case_id=cid, technician_id="T-03", start=preferred, reason="x"), "not an in-house technician")
        refused(await call("assign_technician", case_id=cid, technician_id="SC-01", start=preferred, reason="x"), "not an in-house technician")
        refused(await call("assign_technician", case_id=cid, technician_id=tech, start="2026-10-20T03:30:00.000Z", reason="x"), "not a bookable")
        other, _, _ = await reported_and_triaged(call, unit_id="A-11-08")
        refused(await call("assign_technician", case_id=other, technician_id=tech, start=preferred, reason="x"), "already booked")
        refused(await call("assign_technician", case_id=cid, technician_id=tech, start=preferred, reason="x", support_id="SC-01"), "extra inspections only")

        # Human actions in the wrong state
        refused(tools.book_repair(cid, preferred), "Cannot book a repair")
        refused(tools.mark_repaired(cid, "x"), "Cannot mark repaired")
        refused(tools.reopen_case("C-0006", "x", PHOTO), "Only closed cases")   # INVALID
        refused(tools.reopen_case("H-0001", "x", PHOTO), "Only closed cases")   # closed long ago
        refused(tools.create_case("A-12-08", "B-0001", "leak"), "Unknown buyer")
        refused(tools.add_photo(cid, "missing.jpg", "original"), "Photo not found")
        refused(await call("start_verification", case_id=cid, guide=["x"]), "Cannot start verification")
        refused(await call("get_case", case_id="C-9999"), "not found")
    run(scenario)


def test_escalate_booking_and_notifications():
    async def scenario(client, call):
        cid, _, _ = await reported_and_triaged(call)
        res = ok(await call("escalate_booking", case_id=cid, reason="All technicians on leave"))
        assert res["booking_status"] == "NEEDS_STAFF" and res["email_status"] == "logged, not sent"
        ok(await call("notify_buyer", case_id=cid, title="Visit booked", body="A technician will visit."))
        ok(await call("notify_technician", case_id=cid, subject="New inspection visit", body="Please attend."))
        ok(await call("log_agent_step", case_id=cid, agent="TriageAgent", message="Booked preferred time"))
        _, state = ui_case(cid)
        assert any(m["caseId"] == cid and m["title"] == "Visit booked" for m in state["messages"])
        assert sum(1 for o in state["outbox"] if o["caseId"] == cid) >= 3
        assert any(e["caseId"] == cid and e["agent"] == "TriageAgent" for e in state["events"])
    run(scenario)


def test_find_similar_cases_links_unit_stack_and_next_door():
    async def scenario(client, call):
        cid, _, _ = await reported_and_triaged(call)
        similar = await call("find_similar_cases", case_id=cid, top_k=20)
        by_id = {s["case_id"]: s for s in similar}
        assert {"H-0001", "H-0002"} <= set(by_id)                    # same unit
        assert {"H-0003", "H-0005", "H-0006"} <= set(by_id)          # same stack, floors below
        assert "Next door" in by_id["H-0007"]["reason"]              # A-12-07
        assert by_id["H-0001"]["score"] > by_id["H-0006"]["score"]
        ok(await call("save_similar_cases", case_id=cid, occurrence_count=4,
                      links=[{"related_case_id": s["case_id"], "reason": s["reason"], "score": s["score"]} for s in similar[:3]]))
        case, _ = ui_case(cid)
        assert len(case["similar"]) == 3 and case["occurrence"] == 4
    run(scenario)
