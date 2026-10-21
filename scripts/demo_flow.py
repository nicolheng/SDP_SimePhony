"""Watch the P2 agents work end to end, case by case.

    python scripts/demo_flow.py            # quick, repeatable: a stand-in model answers the LLM calls
    python scripts/demo_flow.py --live     # real Ollama (qwen2.5:7b + llava-llama3); slower, wording varies
    python scripts/demo_flow.py --scenario 2

Everything runs on a temporary copy of data/seed.db: the live data/simephony.db, uploads/ and Gmail are
never touched. Human actions (buyer reports, technician accepts / verdict / repair, sign-offs, reopen,
SDP approval) go through backend/tools.py exactly as the web app will call them; every AI step is the
real agent from agents/simephony. After each step the script prints what the agent decided, the case
status in the DB, and the message / email the buyer received.
"""
import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

IMAGES = ROOT / "tests" / "data" / "test_cases" / "images"
LEAK_PHOTO = str(IMAGES / "ceiling-water-leak.jpg")
LEAK_AGAIN_PHOTO = str(IMAGES / "water_leak_again.jpg")
FIXED_PHOTO = str(IMAGES / "ceiling_repaired.jpg")  # Pexels 3615726 (La Miko), free Pexels licence
DRAIN_PHOTO = str(IMAGES / "bathroom_pooling.jpg")


# ----------------------------------------------------------------------------- output

def banner(title: str, story: str) -> None:
    print("\n" + "=" * 78 + f"\n  {title}\n" + "=" * 78)
    print(f"  {story}\n")


def step(n: int, who: str, what: str) -> None:
    print(f"\n[{n}] {who}: {what}")


def note(text: str) -> None:
    print(f"      {text}")


def _db():
    import db
    return db.get_conn()


def show_case(case_id: str) -> dict:
    with _db() as conn:
        row = dict(conn.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone())
    tech = f", technician {row['technician_id']}" if row.get("technician_id") else ""
    booking = f", booking {row['booking_status']}" if row.get("booking_status") else ""
    hours = f", repair {row['repair_hours']:g} h" if row.get("repair_hours") else ""
    note(f"DB case {case_id}: status {row['status']}{tech}{booking}{hours}, reopens {row['reopen_count']}")
    return row


class Inbox:
    """Prints buyer in-app messages and outbox emails added since the last check."""

    def __init__(self):
        self.seen_msgs, self.seen_mail = self._ids()

    def _ids(self):
        with _db() as conn:
            msgs = {r[0] for r in conn.execute("SELECT message_id FROM buyer_messages")}
            mail = {r[0] for r in conn.execute("SELECT email_id FROM outbox")}
        return msgs, mail

    def show(self) -> None:
        with _db() as conn:
            msgs = [dict(r) for r in conn.execute("SELECT * FROM buyer_messages ORDER BY created_at, message_id")
                    if r["message_id"] not in self.seen_msgs]
            mail = [dict(r) for r in conn.execute("SELECT * FROM outbox ORDER BY created_at, email_id")
                    if r["email_id"] not in self.seen_mail]
        for m in msgs:
            note(f"BUYER APP  > {m['title']}")
            for line in m["body"].splitlines():
                note(f"             {line}")
        for e in mail:
            note(f"EMAIL ({e['status']}) to {e['to_addr']}: {e['subject']}")
        self.seen_msgs |= {m["message_id"] for m in msgs}
        self.seen_mail |= {e["email_id"] for e in mail}


# ----------------------------------------------------------------------------- stand-in model

class DemoLLM:
    """Answers each agent's LLM call by recognising its prompt. `scenario` holds the per-case answers;
    `script` (a list) overrides the next answers, used to show the guardrail catching a bad draft."""

    def __init__(self):
        self.scenario: dict = {}
        self.script: list[str] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        text = self.script.pop(0) if self.script else self._answer(kwargs.get("messages", []))
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])

    @staticmethod
    def _text(messages) -> str:
        parts = []
        for m in messages:
            c = m.get("content", "")
            parts.append(c if isinstance(c, str) else " ".join(p.get("text", "") for p in c if p.get("type") == "text"))
        return "\n".join(parts)

    def _answer(self, messages) -> str:
        t = self._text(messages)
        s = self.scenario
        if "defect intake" in t:
            return json.dumps(s["intake"])
        # before cluster_reason: the inspection prompt quotes the similar-case result
        if "Senior Property Inspector" in t:
            return json.dumps(s.get("brief") or {
                "timeline": [{"at": "2026-09", "text": "Earlier ceiling leaks in this unit"}],
                "photoComparison": "Stain in the same spot as the earlier reports.",
                "neighbouringUnits": [], "likelyComponents": ["Shared riser joint", "Waterproofing membrane"],
                "checklist": ["Trace the water path from the unit above", "Pressure-test the riser joint",
                              "Photograph the ceiling void before and after"]})
        if "cluster_reason" in t:
            return json.dumps({"cluster_reason": s.get("cluster", "No earlier cases of this defect in the unit.")})
        if "safety triage expert" in t:
            return json.dumps({"urgency": s.get("intake", {}).get("urgency", "normal"), "rule": "none"})
        if "repair photo checker" in t:
            return json.dumps({"assessment": "looks_resolved", "observations": s.get("photo_seen", "Repair looks complete."),
                               "matches_location": True})
        if "verification checks for a home buyer" in t:
            return "\n".join(line[2:] for line in t.splitlines() if line.startswith("- "))
        if "inspection note and report the scope" in t:
            return json.dumps(s["scope"])
        if "legal compliance officer" in t:
            return "Our team has reviewed your case and will update you shortly."
        if "professional property manager" in t:
            return self._buyer_update(t)
        return "OK."

    @staticmethod
    def _buyer_update(t: str) -> str:
        if "repair is fixed" in t:
            return "Thank you for confirming the repair."
        if "developer has approved" in t:
            return "The developer has approved the repair, so it is ready for you to check."
        if "repair is complete" in t:
            return "The technician has completed the repair."
        if "detailed inspection of the resident" in t:
            return "Our team has arranged a detailed inspection of your case."
        if "has changed" in t:
            return "The technician for your visit has changed."
        if "confirmed the" in t:
            return "Good news: our technician has confirmed the defect."
        if "not a developer defect" in t:
            return "Our technician has inspected the reported issue and assessed that it is not a developer defect."
        if "requested a technician visit" in t and "reopened" not in t:
            return "We have received your report and requested a technician visit."
        if "more detailed inspection" in t:
            return "As this problem has come back, our team is arranging a more detailed inspection and will confirm the visit soon."
        if "high demand" in t:
            return "We are experiencing high demand. Our team will contact you with the earliest available visit date."
        if "reopened" in t:
            return "Your case has been reopened and a technician revisit has been requested. We will confirm the time once the technician accepts."
        return "There is an update on your case. We will contact you shortly."


def use_model(live: bool) -> DemoLLM | None:
    if live:
        print("Using the real Ollama models (qwen2.5:7b, llava-llama3).")
        return None
    import importlib
    llm = DemoLLM()
    for name in ("comms", "triage", "verification", "repair_estimate"):
        mod = importlib.import_module(f"agents.simephony.{name}")
        mod.get_client = lambda: llm
        mod.get_models = lambda: ("demo-vision", "demo-text")
    for name in ("intake", "similar_defect", "initial_inspection"):
        importlib.import_module(f"agents.simephony.{name}").client = llm
    print("Using the stand-in model (repeatable answers). Add --live to use Ollama.")
    return llm


# ----------------------------------------------------------------------------- helpers

def setup_temp_db() -> Path:
    import db
    import tools
    tmp = Path(tempfile.mkdtemp(prefix="simephony-demo-"))
    shutil.copyfile(ROOT / "data" / "seed.db", tmp / "demo.db")
    db.DB_PATH = tmp / "demo.db"
    tools.UPLOADS_DIR = tmp / "uploads"
    os.environ["EMAIL_ENABLED"] = "false"
    os.environ["EMBEDDINGS_ENABLED"] = "false"
    print(f"Temporary DB: {db.DB_PATH} (copy of data/seed.db)")
    return tmp


def ok(result: dict, what: str) -> dict:
    if result.get("ok") is False:
        raise SystemExit(f"tools.py refused {what}: {result.get('error')}")
    return result


def sync(state: dict, case_id: str) -> dict:
    """Bring the agent state in line with the DB after a human action in the web app."""
    with _db() as conn:
        row = dict(conn.execute("SELECT status, closed_at, reopen_count FROM cases WHERE case_id = ?", (case_id,)).fetchone())
    state.update(current_status=row["status"], closed_at=row["closed_at"] or "", reopen_count=row["reopen_count"] or 0)
    return state


def new_case_chain(n: int, case_id: str, unit_id: str, description: str, photo: str, inbox: Inbox) -> dict:
    """IntakeAgent -> SimilarDefectAgent -> TriageAgent -> BookingAgent -> new-case escalation -> CommsAgent."""
    from agents.simephony.booking import booking_node
    from agents.simephony.comms import comms_node
    from agents.simephony.intake import intake_node
    from agents.simephony.recurrence import new_case_escalation_node
    from agents.simephony.similar_defect import similar_defect_node
    from agents.simephony.triage import triage_node

    state = {"event": "case.created", "case_id": case_id, "unit_id": unit_id, "user_description": description,
             "image_path": photo, "current_status": "SUBMITTED", "reopen_count": 0, "tried_technicians": [],
             "reassignment_count": 0}
    state = intake_node(state)
    i = state["intake_result"]
    step(n, "IntakeAgent (P1)", f"category {i.get('category')}, location '{i.get('location_in_unit')}', urgency {i.get('urgency')}")
    saved = state.get("intake_save") or {}
    note("saved to the case" if saved.get("ok") else f"NOT saved: {saved.get('error')}")
    state = similar_defect_node(state)
    sim = state["similar_cases_result"]
    step(n + 1, "SimilarDefectAgent (P1)", f"{sim.get('past_case_count')} earlier case(s) in this unit; links saved")
    state = triage_node(state)
    t = state["triage_result"]
    step(n + 2, "TriageAgent (P2)", f"urgency {t['urgency']}, skill {t['assigned_skill']} (saved)")
    if "rule:" in t.get("justification", ""):
        note(t["justification"].split("Urgency set by ")[-1])
    state = booking_node(state)
    b = state["booking_result"]
    if b.get("booking_status") == "PENDING":
        step(n + 3, "BookingAgent (P2)", f"booked {b['technician_name']} ({b['assigned_technician']}) for {b['start_local']}; "
             "waits for the technician to accept")
    else:
        step(n + 3, "BookingAgent (P2)", f"booking {b.get('booking_status')}: {b.get('reason') or b.get('error')}")
    state = new_case_escalation_node(state)
    e = state["new_case_escalation"]
    if e["escalated"]:
        step(n + 4, "RecurrenceAgent (P2)", f"repeat defect on a new report: SDP request {e['approval_id']} "
             f"({e['issue_id']}); the visit stays booked")
        for reason in e["reasons"]:
            note(f"reason: {reason}")
    else:
        step(n + 4, "RecurrenceAgent (P2)", "below the escalation threshold: nothing to ask SDP")
    state = comms_node(state)
    step(n + 5, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case_id)
    return state


def run_event(state: dict, event: str, **changes) -> dict:
    from agents.simephony.workflow import agent_app
    return agent_app.invoke({**state, **changes, "event": event})


# ----------------------------------------------------------------------------- scenarios

def _repair_and_signoff(n: int, case: str, state: dict, repair_note: str, inbox: Inbox) -> dict:
    """Technician repairs -> photo check + guide saved -> buyer told SDP reviews first -> SDP signs -> buyer gets
    the guide and deadline -> buyer FIXED -> CLOSED."""
    import tools
    ok(tools.respond_to_assignment(case, True), "accept the repair")
    ok(tools.mark_repaired(case, repair_note, FIXED_PHOTO), "mark_repaired")
    step(n, "Technician (app)", f"accepts the repair job, then marks it repaired with an after photo: \"{repair_note}\"")
    state = run_event(sync(state, case), "repair.done", repair_note=repair_note, repair_photo_path=FIXED_PHOTO)
    v = state["verification_result"]
    step(n + 1, "VerificationAgent (P2)", f"photo check: {v['assessment']} ({v['observations'] or 'no observations'})")
    if v.get("needs_technician_input"):
        note(f"HELD, buyer not messaged. Technician is told: {v['technician_message']}")
        _issue_standard_guide(case)
    else:
        note(f"guide saved for the sign-off page: {v.get('verification_id')}")
        step(n + 2, "CommsAgent (P2)", "buyer update (no checklist yet: SDP reviews first)")
        inbox.show()
    show_case(case)

    ok(tools.record_signoff(case, "developer"), "developer sign-off")
    step(n + 3, "SDP staff (web app)", "signs off the repair")
    state = run_event(sync(state, case), "developer.signed")
    step(n + 4, "CommsAgent (P2)", "buyer update with the checklist and deadline")
    inbox.show()

    state = run_event(sync(state, case), "verification.submitted", verification_outcome="FIXED")
    ok(tools.record_verification(case, "FIXED", "Dry after the shower test"), "record_verification")
    step(n + 5, "Buyer (web app)", "checks the repair: FIXED, signs off")
    step(n + 6, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case)
    return sync(state, case)


def scenario_happy_path(llm: DemoLLM | None) -> None:
    import tools
    banner("Scenario 1: ceiling leak, repaired, closed, then reopened",
           "Buyer in A-1-01 reports a leak. Visit booked -> technician accepts -> VALID + repair estimate -> buyer "
           "books -> repair -> photo check -> SDP signs -> buyer checks with the checklist -> CLOSED -> leak back "
           "within 30 days -> reopen below the threshold books a revisit.")
    if llm:
        llm.scenario = {
            "intake": {"category": "water_leak", "sub_category": "ceiling_leak", "location_in_unit": "master bedroom ceiling",
                       "summary": "Water dripping from the master bedroom ceiling above the wardrobe.", "urgency": "normal",
                       "mentions_previous_issue": False, "mentioned_recurrence_count": None, "missing_info": [],
                       "follow_up_question": "", "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False},
            "scope": {"area": "medium", "parts_to_replace": True, "multiple_spots": False, "needs_drying_or_curing": True},
            "photo_seen": "Clean, freshly painted ceiling; no stain or damp visible.",
        }
    inbox = Inbox()
    description = "Water is dripping from the master bedroom ceiling above the wardrobe and the stain is getting bigger."
    case = ok(tools.create_case("A-1-01", "B-0001", description, photo=LEAK_PHOTO), "create_case")["case_id"]
    step(1, "Buyer (web app)", f"reports a ceiling leak with a photo -> case {case}")
    state = new_case_chain(2, case, "A-1-01", description, LEAK_PHOTO, inbox)

    ok(tools.respond_to_assignment(case, True), "accept visit")
    step(8, "Technician (app)", "accepts the visit")
    inbox.show()
    show_case(case)

    verdict = ("Leaking pipe joint above the wardrobe; about 1 m2 of ceiling board soaked, needs replacing and "
               "repainting once dry.")
    ok(tools.record_verdict(case, "VALID", verdict), "record_verdict")
    step(9, "Technician (app)", f"VALID: \"{verdict}\"")
    state = run_event(sync(state, case), "verdict.recorded", verdict_note=verdict)
    e = state["repair_estimate"]
    step(10, "RepairEstimateAgent (P2)", f"about {e['hours']} h (category normal: {e['base_hours']:g} h)")
    note(f"facts read from the note: {e['facts']}")
    note(f"reason: {e['reason']}")
    step(11, "CommsAgent (P2)", "buyer update")
    inbox.show()

    options = tools.get_booking_options(case, "repair")
    first = options["options"][0]
    note(f"repair slots offered to the buyer: {options['plan']['hours']:g} h jobs, first {first['start_local']} "
         f"({len(first['slots'])} x 2-hour blocks)")
    ok(tools.book_repair(case, first["start"]), "book_repair")
    step(12, "Buyer (web app)", f"books the repair for {first['start_local']}")
    show_case(case)

    state = _repair_and_signoff(13, case, state, "Resealed the pipe joint and replaced the ceiling board above the "
                                "wardrobe; repainted.", inbox)

    before = dict(state)
    ok(tools.reopen_case(case, "A small damp patch is back near the wardrobe.", LEAK_AGAIN_PHOTO), "reopen_case")
    step(20, "Buyer (web app)", "reopens within 30 days with a new photo")
    state = run_event(before, "case.reopened", reopen_photo_path=LEAK_AGAIN_PHOTO,
                      reopen_description="A small damp patch is back near the wardrobe.")
    r = state["recurrence_result"]
    step(21, "RecurrenceAgent (P2)", f"{r['action']}: occurrence {r['occurrence']} (threshold 3), stack units {r['cluster_size']}")
    b = state.get("booking_result") or {}
    step(22, "Triage + BookingAgent (P2)", f"revisit booked with {b.get('technician_name')} for {b.get('start_local')}"
         if b.get("booking_status") == "PENDING" else f"revisit: {b.get('booking_status')} {b.get('reason') or ''}")
    step(23, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case)


def _issue_standard_guide(case: str) -> None:
    """If the vision model holds the after photo as unclear, the technician would retake it. The script has no
    second photo, so to carry on it issues the standard rules.yaml guide itself."""
    import tools
    with _db() as conn:
        category = conn.execute("SELECT category FROM cases WHERE case_id = ?", (case,)).fetchone()[0]
    ok(tools.start_verification(case, tools.get_verification_protocol(category)["steps"]), "start_verification")
    note("(script: no second photo to resend, so the standard check guide is issued with tools.start_verification)")


def scenario_repeat_unit(llm: DemoLLM | None) -> None:
    import tools
    banner("Scenario 2: a new report in a unit with repeat leaks",
           "A-12-08 already had 3 water leaks (H-0001, H-0002, C-0014) and its stack has a cluster. A new report "
           "books the normal visit AND asks SDP for an extra inspection. SDP approves -> InitialInspectionAgent "
           "writes the technician's brief -> the booked visit becomes the detailed inspection -> buyer told.")
    if llm:
        llm.scenario = {
            # answers like live qwen did on 21 Oct ('other', no location); intake must correct it from the words
            "intake": {"category": "other", "sub_category": "", "location_in_unit": None,
                       "summary": "Ceiling issue reported again.", "urgency": "normal", "mentions_previous_issue": True,
                       "mentioned_recurrence_count": None, "missing_info": [], "follow_up_question": "",
                       "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False},
            "cluster": "Fourth water leak in A-12-08, and units above and below in stack A-08 report the same.",
        }
    inbox = Inbox()
    description = "Ceiling bocor lagi in the bedroom, this is the third time!"
    case = ok(tools.create_case("A-12-08", "B-0118", description, photo=LEAK_AGAIN_PHOTO), "create_case")["case_id"]
    step(1, "Buyer (web app)", f"reports the leak again -> case {case}")
    state = new_case_chain(2, case, "A-12-08", description, LEAK_AGAIN_PHOTO, inbox)
    approval = (state.get("new_case_escalation") or {}).get("approval_id")
    if not approval:
        note("(no SDP request was made, so there is nothing to approve)")
        return
    ok(tools.decide_approval(approval, True), "decide_approval")
    step(8, "SDP staff (web app)", f"approves the extra inspection {approval}")
    state = run_event(sync(state, case), "inspection.approved")
    brief = state.get("initial_inspection_result") or {}
    step(9, "InitialInspectionAgent (P1)", f"brief for the technician: {len(brief.get('checklist') or [])}-point checklist"
         + (f" (NOT saved: {brief['save_error']})" if brief.get("save_error") else ""))
    for item in (brief.get("checklist") or [])[:5]:
        note(f"- {item}")
    if brief.get("save_error"):
        return  # tools.py refused the brief: nothing booked, nobody told
    b = state.get("booking_result") or {}
    step(10, "BookingAgent (P2)", f"detailed inspection with {b.get('technician_name')} for {b.get('start_local')}"
         if b.get("booking_status") == "PENDING" else f"booking {b.get('booking_status')}: {b.get('reason') or b.get('error')}")
    step(11, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case)


def scenario_handover(llm: DemoLLM | None) -> str:
    import tools
    banner("Scenario 3: the technician hands the job over",
           "B-3-08 (block B, two plumbers): T-01 hands the visit over -> BookingAgent gives it to the colleague at the "
           "same time -> buyer told. Then a drain in block C, where T-02 is the only plumber: T-02 hands it over -> "
           "nobody else -> SDP is asked to book by hand, buyer told we're arranging it.")
    drain = {"intake": {"category": "drainage", "sub_category": "floor_trap", "location_in_unit": "common bathroom",
                        "summary": "Water pooling around the bathroom floor trap.", "urgency": "normal",
                        "mentions_previous_issue": False, "mentioned_recurrence_count": None, "missing_info": [],
                        "follow_up_question": "", "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False}}
    with _db() as conn:
        pick = ("SELECT u.unit_id, b.buyer_id FROM units u JOIN buyers b ON b.unit_id = u.unit_id WHERE u.block = ? "
                "AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.unit_id = u.unit_id) ORDER BY u.unit_id LIMIT 1")
        unit_b, buyer_b = conn.execute(pick, ("B",)).fetchone()
        unit_c, buyer_c = conn.execute(pick, ("C",)).fetchone()
    description = "Water pools around the floor trap in the common bathroom and doesn't drain."
    last = None
    for n, (unit, buyer) in ((1, (unit_b, buyer_b)), (12, (unit_c, buyer_c))):
        if llm:
            llm.scenario = drain
        inbox = Inbox()
        case = ok(tools.create_case(unit, buyer, description, photo=DRAIN_PHOTO), "create_case")["case_id"]
        step(n, "Buyer (web app)", f"reports a drain problem in {unit} -> case {case}")
        state = new_case_chain(n + 1, case, unit, description, DRAIN_PHOTO, inbox)
        ok(tools.respond_to_assignment(case, False, "Called to an emergency that day"), "hand over")
        step(n + 7, "Technician (app)", "hands the visit over: \"Called to an emergency that day\"")
        show_case(case)
        state = run_event(sync(state, case), "booking.rejected")
        b = state["booking_result"]
        step(n + 8, "BookingAgent (P2)", b.get("reason") or f"booking {b.get('booking_status')}")
        step(n + 9, "CommsAgent (P2)", "buyer update")
        inbox.show()
        show_case(case)
        last = case
    return last


def scenario_guardrail(llm: DemoLLM | None, case: str | None) -> None:
    banner("Scenario 4: the guardrail stops a bad draft",
           "The model writes an INVALID update that admits fault and offers a refund. CommsAgent catches it, the "
           "rewrite is still unsafe, so the buyer gets the fixed safe template instead.")
    from agents.simephony.comms import comms_node
    if llm is None:
        note("(needs the stand-in model to force a bad draft; skipped with --live)")
        return
    inbox = Inbox()
    llm.script = ["We admit our pipe was installed badly and we will refund you for the damage.",
                  "We are sorry for our mistake and will pay for the repair."]
    step(1, "Model draft", llm.script[0])
    note(f"rewrite attempt: {llm.script[1]}")
    state = comms_node({"case_id": case, "current_status": "INVALID", "intake_result": {"category": "sanitary_fittings"},
                        "verdict_note": "We admit the trap was fitted wrongly."})
    step(2, "CommsAgent (P2)", f"sent the safe version (delivery: {state['comms_result']['delivery']})")
    inbox.show()
    note("(the technician's note itself admits fault, so it is left out of the message too)")


# ----------------------------------------------------------------------------- main

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live", action="store_true", help="use the real Ollama models")
    parser.add_argument("--scenario", type=int, choices=[1, 2, 3, 4], help="run just one scenario")
    args = parser.parse_args()

    tmp = setup_temp_db()
    llm = use_model(args.live)
    want = {args.scenario} if args.scenario else {1, 2, 3, 4}
    try:
        if 1 in want:
            scenario_happy_path(llm)
        if 2 in want:
            scenario_repeat_unit(llm)
        case = scenario_handover(llm) if 3 in want or 4 in want else None
        if 4 in want:
            scenario_guardrail(llm, case)
    finally:
        print(f"\nDone. The temporary DB is kept for a look: {tmp / 'demo.db'}")


if __name__ == "__main__":
    main()
