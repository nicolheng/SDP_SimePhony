"""End-to-end case lifecycle through the compiled graph `agents.simephony.workflow.agent_app`.

One case is driven event by event (case.created -> repair.done -> verification.submitted ->
case.reopened ...). The state returned by one event is carried into the next; between events
the test only changes what the outside world would change (technician repair note / photo,
buyer sign-off -> CLOSED + closed_at, the event name). The LLM is the autouse `fake_llm`
fixture (tests/conftest.py); every step scripts exactly the responses it expects and checks
that exactly that many LLM calls were made, so the node call order is pinned too.

Scenario triage (docs/TEST_SCENARIOS.md, checked against CONTRACTS.md §1/§7 and rules.yaml)
-------------------------------------------------------------------------------------------

| Scenario | Verdict | What is tested / concrete blocker |
|---|---|---|
| 1.1 New case -> triage -> booking | PARTIAL | Tested: intake -> similar_defect -> triage -> booking -> comms reaches ASSIGNED with a plumbing technician and one buyer email. Blockers: create_case / assign_technician / book_slot / send_email in backend/tools.py raise NotImplementedError, so agents use agents/simephony/stub_tools.py and nothing is written to simephony.db (no `case_status`, `urgency` or `outbox` row to check); stub send_email does not write the outbox; book_slot is never called, so there is no BOOKED / VISIT_SCHEDULED state; triage emits HIGH/NORMAL, not "URGENT". |
| 1.2 Repair done -> verification -> closure | PARTIAL | Tested: repair.done -> photo check -> PENDING_SIGNOFF with the buyer guide in the email; FIXED keeps PENDING_SIGNOFF. Blocker: no agent ever sets CLOSED. Sign-off needs record_signoff (P3, NotImplementedError); by design vision is advisory and never closes a case. CLOSED + closed_at are simulated here. |
| 2.1 Reopen -> recurrence loop | PARTIAL | Tested: reopen #1 -> REOPENED (reopen_count 1); reopen #2 -> ESCALATION_PENDING and request_extra_inspection called (D1: occurrence = reopen_count + 1, so the 2nd reopen is the 3rd occurrence; the doc's "reopen_count=3" is out of date). Blockers: agents import the stub request_extra_inspection (the real P4 one in backend/tools.py is not wired), so no approvals row / outbox "Extra Inspection Approval" mail; no "alert the technician" step on the 2nd occurrence exists. |
| 2.2 Vertical stack cluster | PARTIAL | Tested: on the 1st reopen, get_stack_cases (patched) returning 2 other same-category, non-INVALID cases escalates with reason "stack cluster". Blockers: no `zone_mapping` table (block + stack from `units` is used instead); stub get_stack_cases returns []; no 48-hour window; the check only runs on case.reopened, never on case.created, so three fresh reports never cluster; no "Stack Cluster Detected" log. |
| 3.1 No available slots | PARTIAL | Tested: every technician rejects -> booking loop ends (no infinite loop) at ESCALATION_PENDING with one buyer email. Blockers: no PENDING_SLOT status in CONTRACTS §1 and no "High Demand" / delay notice template; no 7-day look-ahead (get_available_slots is a stub with no date range); no outbox. |
| 3.2 Expired grace reopen | TESTABLE NOW | Tested: reopen 40 days after close -> NEW_CASE -> prepare_new_case -> full new-case chain on the reopen photo, case_id "C-NEW"; the caller's CLOSED state is untouched. Caveat: "C-NEW" is a fixed placeholder until create_case (P3) issues real ids. |
| 4.1 Liability trap | TESTABLE NOW | Covered by tests/unit/test_comms.py and tests/integration/test_comms_guardrail_integration.py (scripted liable draft -> rewrite -> neutral template). Here every email of every lifecycle step is also run through scan_for_liability and scan_for_unsafe_steps. Real-model behaviour only under `-m live_llm`. |
| 4.2 Injection via description | PARTIAL | Skill comes from rules.yaml category_to_skill (deterministic), so injection cannot change the skill. Blocker: urgency is an LLM decision, so resisting the injection can only be checked with the real model (`-m live_llm`); technician choice is stub data; "URGENT" is not a label the code emits. |
| 5.1 Concurrent write-storm | NOT TESTABLE | Agents never write to SQLite (create_case etc. are NotImplementedError in backend/tools.py; agents use stub_tools). Only backend/db.py itself could be load-tested, not through agents. |
| 5.2 Long-running state recovery | NOT TESTABLE | workflow.compile() has no SqliteSaver checkpointer and no interrupt; the graph is one invoke per event and the caller carries state. (The event routing itself is tested: repair.done goes straight to verification without re-running intake.) |
| CONTRACTS §7 inspection.approved -> InitialInspectionAgent | NOT TESTABLE | `initial_inspection` is added to the graph but has no edge; route_event has no inspection.approved route; get_approval_status is not wired. SDP approval / rejection after ESCALATION_PENDING cannot be driven. |
| CONTRACTS §1 technician verdict (VALID / INVALID) | PARTIAL | No graph event for verdict.recorded (an unknown event falls through to intake and re-runs the new-case chain), so VALID/INVALID are simulated by setting current_status. Tested: INVALID is terminal (reopen rejected, no escalation); NOT_FIXED (with photo) -> REOPENED. |

Bugs this file found, now fixed and kept as regression tests:
- A stale verification_status == "verified" from an earlier repair cycle made the 2nd
  repair.done email a "thanks for confirming" note without the buyer guide
  (test_second_repair_cycle_resends_buyer_guide).
- booking.py called assign_technician with case_id="C-NEW", not the state's case_id
  (test_booking_assigns_technician_to_this_case).
"""
import base64
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from agents.simephony import booking, comms, escalation, recurrence, similar_defect
from agents.simephony.comms import INVALID_CLOSING
from agents.simephony.guardrails import scan_for_liability, scan_for_unsafe_steps
from agents.simephony.workflow import agent_app

UNIT = "A-12-08"  # block A, stack 08
CASE = "C-0001"
BUYER = "buyer@lifecycle.test"

INTAKE_JSON = json.dumps({
    "category": "water_leak", "sub_category": "ceiling leak",
    "location_in_unit": "master bathroom ceiling",
    "summary": "Water dripping from the master bathroom ceiling.", "urgency": "normal",
    "mentions_previous_issue": False, "mentioned_recurrence_count": None, "missing_info": [],
    "follow_up_question": "", "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False,
})
SIMILAR_JSON = json.dumps({"cluster_reason": "No earlier cases in this unit."})
URGENCY = "NORMAL"
VISION_OK = json.dumps({"assessment": "looks_resolved",
                        "observations": "Ceiling board replaced, no staining visible.",
                        "matches_location": True})
VISION_UNCLEAR = json.dumps({"assessment": "unclear", "observations": "Photo is blurry.",
                             "matches_location": False})
PHRASED_CHECKS = (
    "Look at the repaired ceiling area in the master bathroom for damp patches, staining or bubbling paint.\n"
    "Run the shower for a few minutes, then check the repaired ceiling area for drips or dampness."
)
REPAIR_NOTE = "Resealed the pipe joint above the shower and replaced the stained ceiling board."

MSG_ASSIGNED = "A technician has been assigned to your water leak case. We will share the visit slot soon."
MSG_REPAIR_INTRO = "The technician has completed the repair. Please check it using the steps below before signing off."
MSG_THANKS = "Thank you for checking the repair. Your case now waits for final sign-off."
MSG_REOPENED = "Your case has been reopened. We will arrange a technician visit."
MSG_ESCALATED = "Your case has been referred to our team for a further inspection."
MSG_VALID = "Our technician confirmed the defect still needs work. We will arrange another repair visit."
MSG_INVALID = "Our technician reviewed your report and found it is not a developer defect."

SLOTS = [
    {"slot_id": "S-1", "technician_id": "T-PLUMB-1", "start": "2026-10-22T10:00:00+08:00", "block": "A"},
    {"slot_id": "S-2", "technician_id": "T-PLUMB-2", "start": "2026-10-23T10:00:00+08:00", "block": "A"},
]

CREATED = [INTAKE_JSON, SIMILAR_JSON, URGENCY, MSG_ASSIGNED]   # intake, similar_defect, triage, comms
REPAIR_OK = [VISION_OK, PHRASED_CHECKS, MSG_REPAIR_INTRO]       # vision, phrase checks, comms


# ---------------------------------------------------------------- helpers

def _photo(tmp_path, name: str) -> str:
    path = tmp_path / name
    path.write_bytes(f"fake-jpeg:{name}".encode())
    return str(path)


def _days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _new_case(tmp_path, case_id: str = CASE) -> dict:
    return {
        "case_id": case_id, "unit_id": UNIT,
        "user_description": "Water is dripping from the master bathroom ceiling.",
        "image_path": _photo(tmp_path, "original.jpg"),
        "current_status": "SUBMITTED", "reopen_count": 0,
        "intake_result": {}, "similar_cases_result": {}, "triage_result": {}, "booking_result": {},
        "comms_result": {}, "initial_inspection_result": {}, "missing_info": [],
    }


def _step(fake_llm, state: dict, event: str, responses: list[str], **world_changes) -> dict:
    """Run one event. Scripts exactly `responses` and checks exactly that many LLM calls were made."""
    before = len(fake_llm.calls) if fake_llm else 0
    if fake_llm:
        fake_llm.responses[:] = list(responses)
    out = agent_app.invoke({**state, **world_changes, "event": event})
    if fake_llm:
        assert len(fake_llm.calls) - before == len(responses), f"{event}: unexpected number of LLM calls"
        assert fake_llm.responses == []
    return out


def _user_text(messages: list[dict]) -> str:
    content = messages[-1]["content"]
    if isinstance(content, str):
        return content
    return "\n".join(p.get("text", "") for p in content if p.get("type") == "text")


def _image_urls(messages: list[dict]) -> list[str]:
    content = messages[-1]["content"]
    if isinstance(content, str):
        return []
    return [p["image_url"]["url"] for p in content if p.get("type") == "image_url"]


def _b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def _emails(world) -> list[dict]:
    return [c.kwargs for c in world.send_email.call_args_list]


def _assert_emails_safe(world):
    for mail in _emails(world):
        assert scan_for_liability(mail["body"]) == (False, []), mail
        assert scan_for_unsafe_steps(mail["body"]) == [], mail


@pytest.fixture
def world(monkeypatch):
    """Patch every tool where the agents look it up; nothing touches the DB or the network."""
    w = SimpleNamespace(
        send_email=MagicMock(return_value={"status": "stub_sent"}),
        get_unit=MagicMock(side_effect=lambda unit_id: {
            "unit_id": unit_id, "block": "A", "floor": 12, "stack": "08",
            "contractor": "Contractor X", "buyer": {"buyer_id": "B-0001", "email": BUYER}}),
        get_stack_cases=MagicMock(return_value=[]),
        request_extra_inspection=MagicMock(return_value={"approval_id": "APR-1"}),
        get_available_slots=MagicMock(return_value={"slots": [dict(s) for s in SLOTS]}),
        assign_technician=MagicMock(return_value={"ok": True}),
    )
    monkeypatch.setattr(comms, "send_email", w.send_email)
    monkeypatch.setattr(comms, "get_unit", w.get_unit)
    monkeypatch.setattr(escalation, "get_unit", w.get_unit)
    monkeypatch.setattr(escalation, "get_stack_cases", w.get_stack_cases)
    monkeypatch.setattr(recurrence, "request_extra_inspection", w.request_extra_inspection)
    monkeypatch.setattr(booking, "get_available_slots", w.get_available_slots)
    monkeypatch.setattr(booking, "assign_technician", w.assign_technician)
    # similar_defect would otherwise read data/simephony.db through backend/tools.py
    monkeypatch.setattr(similar_defect, "find_similar_cases", lambda **kw: [])
    return w


def _closed_case(fake_llm, world, tmp_path) -> dict:
    """case.created -> repair.done -> verification.submitted FIXED -> buyer signs (CLOSED)."""
    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)
    s = _step(fake_llm, s, "repair.done", REPAIR_OK, current_status="REPAIRED",
              repair_note=REPAIR_NOTE, repair_photo_path=_photo(tmp_path, "after.jpg"))
    s = _step(fake_llm, s, "verification.submitted", [MSG_THANKS], verification_outcome="FIXED")
    return {**s, "current_status": "CLOSED", "closed_at": _days_ago(5)}


# ---------------------------------------------------------------- happy path

def test_happy_path_lifecycle_to_escalation(fake_llm, world, tmp_path):
    # 1. case.created -> intake -> similar_defect -> triage -> booking -> comms
    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)
    assert s["current_status"] == "ASSIGNED"
    assert s["intake_result"]["category"] == "water_leak"
    assert s["triage_result"]["assigned_skill"] == "plumbing"
    assert s["triage_result"]["urgency"] == "normal"  # CONTRACTS lowercase
    assert s["booking_result"]["assigned_technician"] == "T-PLUMB-1"
    assert s["booking_result"]["assignment_ok"] is True
    assert _b64(s["image_path"]) in _image_urls(fake_llm.calls[0])[0]  # intake saw the buyer's photo
    assert len(_emails(world)) == 1
    assert _emails(world)[0]["subject"] == "[C-0001] We've received your report"

    # 2. technician marks the repair done with an after-photo -> verification -> comms
    after = _photo(tmp_path, "after.jpg")
    s = _step(fake_llm, s, "repair.done", REPAIR_OK, current_status="REPAIRED",
              repair_note=REPAIR_NOTE, repair_photo_path=after)
    assert s["current_status"] == "PENDING_SIGNOFF"
    vision_call = fake_llm.calls[-3]
    assert len(_image_urls(vision_call)) == 2  # original + after photo
    assert _b64(after) in _image_urls(vision_call)[1]
    guide = s["verification_result"]["protocol"]
    assert s["verification_result"]["needs_technician_input"] is False
    assert "master bathroom ceiling" in guide
    assert "Run the shower for a few minutes" in guide
    assert "do not sign off. Reopen the case within 30 days with a new photo." in guide
    mail = _emails(world)[-1]
    assert mail["subject"] == "[C-0001] Please check the repair and sign off"
    assert guide in mail["body"]

    # 3. buyer submits FIXED -> still waiting for sign-off, no guide re-sent
    s = _step(fake_llm, s, "verification.submitted", [MSG_THANKS], verification_outcome="FIXED")
    assert s["current_status"] == "PENDING_SIGNOFF"
    assert s["verification_status"] == "verified"
    assert _emails(world)[-1]["body"] == MSG_THANKS

    # 4. both parties sign -> CLOSED (outside world); buyer reopens within grace
    s = _step(fake_llm, {**s, "current_status": "CLOSED", "closed_at": _days_ago(5)},
              "case.reopened", [MSG_REOPENED], reopen_photo_path=_photo(tmp_path, "reopen1.jpg"))
    assert s["current_status"] == "REOPENED"
    assert s["reopen_count"] == 1
    assert s["recurrence_result"]["action"] == "REOPENED"
    assert s["recurrence_result"]["occurrence"] == 2
    world.get_stack_cases.assert_called_with("A", "08")
    world.request_extra_inspection.assert_not_called()

    # 5. repaired and closed again (outside world); 2nd reopen = 3rd occurrence (D1)
    s = _step(fake_llm, {**s, "current_status": "CLOSED", "closed_at": _days_ago(2)},
              "case.reopened", [MSG_ESCALATED], reopen_photo_path=_photo(tmp_path, "reopen2.jpg"))
    assert s["current_status"] == "ESCALATION_PENDING"
    assert s["reopen_count"] == 2
    assert s["recurrence_result"]["occurrence"] == 3
    assert s["recurrence_result"]["escalation_reasons"] == ["3rd occurrence"]
    assert s["recurrence_result"]["approval_id"] == "APR-1"
    world.request_extra_inspection.assert_called_once_with(CASE, ["3rd occurrence"])

    mails = _emails(world)
    assert [m["subject"] for m in mails] == [
        "[C-0001] We've received your report", "[C-0001] Please check the repair and sign off",
        "[C-0001] Thank you for confirming", "[C-0001] Case reopened", "[C-0001] Your case is being reviewed",
    ]
    assert {m["to"] for m in mails} == {BUYER}
    assert {m["case_id"] for m in mails} == {CASE}
    _assert_emails_safe(world)


# ---------------------------------------------------------------- side paths

def test_unclear_after_photo_holds_buyer_email(fake_llm, world, tmp_path):
    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)
    s = _step(fake_llm, s, "repair.done", [VISION_UNCLEAR], current_status="REPAIRED",
              repair_note=REPAIR_NOTE, repair_photo_path=_photo(tmp_path, "blurry.jpg"))
    assert s["current_status"] == "REPAIRED"
    result = s["verification_result"]
    assert result["needs_technician_input"] is True
    assert result["protocol"] is None
    assert "could not be confirmed as resolved at master bathroom ceiling" in result["technician_message"]
    assert [m["subject"] for m in _emails(world)] == ["[C-0001] We've received your report"]  # no buyer email
    _assert_emails_safe(world)


def test_not_fixed_reopens_the_case(fake_llm, world, tmp_path):
    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)
    s = _step(fake_llm, s, "repair.done", REPAIR_OK, current_status="REPAIRED",
              repair_note=REPAIR_NOTE, repair_photo_path=_photo(tmp_path, "after.jpg"))
    s = _step(fake_llm, s, "verification.submitted", [MSG_REOPENED], verification_outcome="NOT_FIXED",
              reopen_photo_path=_photo(tmp_path, "still-leaking.jpg"))
    assert s["current_status"] == "REOPENED"
    assert s["reopen_count"] == 1
    assert s["verification_status"] == "not_verified"
    assert s["recurrence_result"]["action"] == "REOPENED"
    world.request_extra_inspection.assert_not_called()
    assert _emails(world)[-1]["subject"] == "[C-0001] Case reopened"
    _assert_emails_safe(world)


def test_reopen_after_grace_starts_new_case(fake_llm, world, tmp_path):
    closed = _closed_case(fake_llm, world, tmp_path)
    closed["closed_at"] = _days_ago(40)
    reopen_photo = _photo(tmp_path, "reopen-late.jpg")
    calls_before = len(fake_llm.calls)

    s = _step(fake_llm, closed, "case.reopened", CREATED, reopen_photo_path=reopen_photo)

    assert s["recurrence_result"]["action"] == "NEW_CASE"
    assert s["recurrence_result"]["accepted"] is False
    assert s["case_id"] == "C-NEW"
    assert s["image_path"] == reopen_photo
    assert s["reopen_count"] == 0
    assert s["current_status"] == "ASSIGNED"
    assert s["verification_result"] == {}
    intake_call = fake_llm.calls[calls_before]
    assert _b64(reopen_photo) in _image_urls(intake_call)[0]  # new intake reads the reopen photo
    assert _emails(world)[-1]["case_id"] == "C-NEW"
    world.request_extra_inspection.assert_not_called()
    # the old case is untouched
    assert closed["case_id"] == CASE
    assert closed["current_status"] == "CLOSED"
    _assert_emails_safe(world)


def test_invalid_case_cannot_be_reopened(fake_llm, world, tmp_path):
    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)
    # technician rejects the defect (technician app; no graph event for verdict.recorded)
    invalid = {**s, "current_status": "INVALID", "verdict_note": "Stain is condensation from the exhaust fan."}

    s = _step(fake_llm, invalid, "case.reopened", [],  # fixed reply, no LLM call
              reopen_photo_path=_photo(tmp_path, "reopen.jpg"), closed_at=_days_ago(3))

    assert s["current_status"] == "INVALID"
    assert s["reopen_count"] == 0
    assert s["recurrence_result"]["accepted"] is False
    assert s["recurrence_result"]["action"] == "REJECTED"
    assert "INVALID" in s["recurrence_result"]["reason"]
    world.get_stack_cases.assert_not_called()
    world.request_extra_inspection.assert_not_called()
    assert s["recurrence_result"]["code"] == "invalid_case"
    # rejected reopen: the buyer is told why it can't be reopened and what to do instead
    body = _emails(world)[-1]["body"]
    assert "cannot be reopened" in body
    assert body.endswith(INVALID_CLOSING)
    _assert_emails_safe(world)


def test_stack_cluster_escalates_on_first_reopen(fake_llm, world, tmp_path):
    world.get_stack_cases.return_value = [
        {"case_id": "C-1101", "category": "water_leak", "status": "CLOSED"},
        {"case_id": "C-1301", "category": "water_leak", "status": "REOPENED"},
        {"case_id": "C-1401", "category": "water_leak", "status": "INVALID"},   # not counted
        {"case_id": "C-1501", "category": "paint", "status": "CLOSED"},         # other category
        {"case_id": CASE, "category": "water_leak", "status": "CLOSED"},        # this case
    ]
    closed = _closed_case(fake_llm, world, tmp_path)

    s = _step(fake_llm, closed, "case.reopened", [MSG_ESCALATED],
              reopen_photo_path=_photo(tmp_path, "reopen.jpg"))

    assert s["current_status"] == "ESCALATION_PENDING"
    assert s["reopen_count"] == 1
    assert s["recurrence_result"]["cluster_size"] == 3
    assert s["recurrence_result"]["escalation_reasons"] == ["stack cluster"]
    world.request_extra_inspection.assert_called_once_with(CASE, ["stack cluster"])
    _assert_emails_safe(world)


def test_technician_rejection_reassigns(fake_llm, world, tmp_path):
    world.assign_technician.side_effect = [{"ok": False, "reason": "Rejected"}, {"ok": True}]

    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)

    assert world.assign_technician.call_count == 2
    assert s["booking_result"]["assigned_technician"] == "T-PLUMB-2"
    assert s["booking_result"]["assignment_ok"] is True
    assert s["tried_technicians"] == ["T-PLUMB-1"]
    assert s["reassignment_count"] == 1
    assert s["current_status"] == "ASSIGNED"
    assert "T-PLUMB-2" in _user_text(fake_llm.calls[-1])  # comms names the new technician
    assert len(_emails(world)) == 1
    _assert_emails_safe(world)


def test_all_technicians_reject_escalates_without_looping(fake_llm, world, tmp_path):
    world.assign_technician.return_value = {"ok": False, "reason": "Rejected"}

    s = _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)

    assert world.assign_technician.call_count == len(SLOTS)
    assert s["current_status"] == "ESCALATION_PENDING"
    assert "No more available technicians" in s["booking_result"]["error"]
    assert [m["subject"] for m in _emails(world)] == ["[C-0001] We're arranging your visit"]
    _assert_emails_safe(world)


# ---------------------------------------------------------------- bugs exposed by the lifecycle

def test_second_repair_cycle_resends_buyer_guide(fake_llm, world, tmp_path):
    closed = _closed_case(fake_llm, world, tmp_path)
    s = _step(fake_llm, closed, "case.reopened", [MSG_REOPENED],
              reopen_photo_path=_photo(tmp_path, "reopen.jpg"))
    assert s["current_status"] == "REOPENED"

    s = _step(fake_llm, s, "repair.done", REPAIR_OK, current_status="REPAIRED",
              repair_note="Replaced the leaking elbow joint above the shower.",
              repair_photo_path=_photo(tmp_path, "after2.jpg"))
    assert s["current_status"] == "PENDING_SIGNOFF"
    assert s["verification_result"]["protocol"] in _emails(world)[-1]["body"]


def test_booking_assigns_technician_to_this_case(fake_llm, world, tmp_path):
    _step(fake_llm, _new_case(tmp_path), "case.created", CREATED)
    assert world.assign_technician.call_args.kwargs["case_id"] == CASE


# ---------------------------------------------------------------- real model (deselected by default)

LIVE_IMAGE = "tests/data/test_cases/images/ceiling-water-leak.jpg"


@pytest.mark.live_llm
def test_live_happy_path_prints_emails(world, tmp_path):
    """Same lifecycle on real Ollama (qwen2.5:7b + llava-llama3). Run with `-m live_llm -s`."""
    state = {**_new_case(tmp_path), "image_path": LIVE_IMAGE}
    s = _step(None, state, "case.created", [])
    assert s["current_status"] == "ASSIGNED"

    s = _step(None, s, "repair.done", [], current_status="REPAIRED",
              repair_note=REPAIR_NOTE, repair_photo_path=LIVE_IMAGE)
    if s["current_status"] == "PENDING_SIGNOFF":  # vision is advisory; it may hold the email
        assert s["verification_result"]["protocol"] in _emails(world)[-1]["body"]
        s = _step(None, s, "verification.submitted", [], verification_outcome="FIXED")
    else:
        print("\n[technician message]", s["verification_result"]["technician_message"])

    s = _step(None, {**s, "current_status": "CLOSED", "closed_at": _days_ago(5)},
              "case.reopened", [], reopen_photo_path=LIVE_IMAGE)
    assert s["current_status"] == "REOPENED"
    s = _step(None, {**s, "current_status": "CLOSED", "closed_at": _days_ago(2)},
              "case.reopened", [], reopen_photo_path=LIVE_IMAGE)
    assert s["current_status"] == "ESCALATION_PENDING"

    for mail in _emails(world):
        print(f"\n--- {mail['subject']} ---\n{mail['body']}")
    _assert_emails_safe(world)
