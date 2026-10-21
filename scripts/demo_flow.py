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
FIXED_PHOTO = str(IMAGES / "image.jpg")
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
        hours = re.search(r"about (\d+) hours", t)
        if "now closed" in t:
            return "Thank you for confirming the repair. Your case is now closed."
        if "confirmed the" in t:
            return "Good news: our technician has confirmed the defect."
        if "not a developer defect" in t:
            return "Our technician has inspected the reported issue and assessed that it is not a developer defect."
        if "requested a technician visit" in t:
            return "We have received your report and requested a technician visit. You will get the visit time once the technician confirms."
        if "check the repair using the steps that follow" in t:
            return "The repair has been completed. Please check the repaired area using the steps below before signing off."
        if "more detailed inspection" in t:
            return "As this problem has come back, our team is arranging a more detailed inspection and will confirm the visit soon."
        if "high demand" in t:
            return "We are experiencing high demand. Our team will contact you with the earliest available visit date."
        if "reopened" in t:
            return "Your case has been reopened. A technician will look at it again and we will confirm the visit."
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
    """IntakeAgent -> SimilarDefectAgent -> TriageAgent -> BookingAgent -> CommsAgent, one by one."""
    import tools
    from agents.simephony.booking import booking_node
    from agents.simephony.comms import comms_node
    from agents.simephony.intake import intake_node
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
    step(n + 1, "SimilarDefectAgent (P1)", f"{sim.get('past_case_count')} earlier case(s) in this unit; "
         f"{sim.get('ai_analysis', {}).get('recommendation')}")
    state = triage_node(state)
    t = state["triage_result"]
    step(n + 2, "TriageAgent (P2)", f"urgency {t['urgency']}, skill {t['assigned_skill']}")
    if "rule:" in t.get("justification", ""):
        note(t["justification"].split("Urgency set by ")[-1])
    state = booking_node(state)
    b = state["booking_result"]
    if b.get("booking_status") == "PENDING":
        step(n + 3, "BookingAgent (P2)", f"requested {b['technician_name']} ({b['assigned_technician']}) for {b['start_local']}")
        note(f"reason saved: {b['reason']}")
    else:
        step(n + 3, "BookingAgent (P2)", f"booking {b.get('booking_status')}: {b.get('reason') or b.get('error')}")
    state = comms_node(state)
    step(n + 4, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case_id)
    return state


def run_event(state: dict, event: str, **changes) -> dict:
    from agents.simephony.workflow import agent_app
    return agent_app.invoke({**state, **changes, "event": event})


# ----------------------------------------------------------------------------- scenarios

def scenario_happy_path(llm: DemoLLM | None) -> None:
    import tools
    banner("Scenario 1: ceiling leak, repaired and closed",
           "Buyer in A-1-01 reports a leak. Booking -> technician accepts -> VALID + repair estimate -> "
           "repair -> photo check + safe guide -> SDP and buyer sign -> CLOSED.")
    if llm:
        llm.scenario = {
            "intake": {"category": "water_leak", "sub_category": "ceiling_leak", "location_in_unit": "master bedroom ceiling",
                       "summary": "Water dripping from the master bedroom ceiling above the wardrobe.", "urgency": "normal",
                       "mentions_previous_issue": False, "mentioned_recurrence_count": None, "missing_info": [],
                       "follow_up_question": "", "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False},
            "scope": {"area": "medium", "parts_to_replace": True, "multiple_spots": False, "needs_drying_or_curing": True},
            "photo_seen": "New ceiling board fitted above the wardrobe; no stain or damp visible.",
        }
    inbox = Inbox()
    created = ok(tools.create_case("A-1-01", "B-0001", "Water is dripping from the master bedroom ceiling above the "
                                   "wardrobe and the stain is getting bigger.", photo=LEAK_PHOTO), "create_case")
    case = created["case_id"]
    step(1, "Buyer (web app)", f"reports a ceiling leak with a photo -> case {case}")
    state = new_case_chain(2, case, "A-1-01", "Water is dripping from the master bedroom ceiling above the wardrobe "
                           "and the stain is getting bigger.", LEAK_PHOTO, inbox)

    ok(tools.respond_to_assignment(case, True), "accept visit")
    step(7, "Technician (app)", "accepts the visit")
    show_case(case)

    verdict = ("Leaking pipe joint above the wardrobe; about 1 m2 of ceiling board soaked, needs replacing and "
               "repainting once dry.")
    ok(tools.record_verdict(case, "VALID", verdict), "record_verdict")
    step(8, "Technician (app)", f"VALID: \"{verdict}\"")
    state = run_event(sync(state, case), "verdict.recorded", verdict_note=verdict)
    e = state["repair_estimate"]
    step(9, "RepairEstimateAgent (P2)", f"about {e['hours']} h (category normal: {e['base_hours']:g} h)")
    note(f"facts read from the note: {e['facts']}")
    note(f"reason: {e['reason']}")
    step(10, "CommsAgent (P2)", "buyer update")
    inbox.show()

    options = tools.get_booking_options(case, "repair")
    first = options["options"][0]
    note(f"repair slots offered to the buyer: {options['plan']['hours']:g} h jobs, first {first['start_local']} "
         f"({len(first['slots'])} x 2-hour blocks)")
    ok(tools.book_repair(case, first["start"]), "book_repair")
    step(11, "Buyer (web app)", f"books the repair for {first['start_local']}")
    show_case(case)

    repair_note = "Resealed the pipe joint and replaced the ceiling board above the wardrobe; repainted."
    ok(tools.mark_repaired(case, repair_note, FIXED_PHOTO), "mark_repaired")
    step(12, "Technician (app)", f"marks repaired with an after photo: \"{repair_note}\"")
    state = run_event(sync(state, case), "repair.done", repair_note=repair_note, repair_photo_path=FIXED_PHOTO)
    v = state["verification_result"]
    step(13, "VerificationAgent (P2)", f"photo check: {v['assessment']} ({v['observations'] or 'no observations'})")
    if v.get("needs_technician_input"):
        note(f"HELD, buyer not messaged. Technician is told: {v['technician_message']}")
        show_case(case)
        _issue_standard_guide(case)
    else:
        note(f"guide saved for the sign-off page: {v.get('verification_id')}")
    step(14, "CommsAgent (P2)", "buyer update with the check guide")
    inbox.show()
    show_case(case)

    ok(tools.record_signoff(case, "developer"), "developer sign-off")
    step(15, "SDP staff (web app)", "signs off the repair")
    state = run_event(sync(state, case), "verification.submitted", verification_outcome="FIXED")
    ok(tools.record_verification(case, "FIXED", "Dry after the shower test"), "record_verification")
    step(16, "Buyer (web app)", "checks the repair: FIXED, signs off")
    step(17, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case)


def _issue_standard_guide(case: str) -> None:
    """The after photo (tests/.../image.jpg) is blurry, so a real vision model rightly holds the case.
    There's no clearer test photo for the technician to resend, so to carry on, the script issues the
    standard rules.yaml guide itself."""
    import tools
    with _db() as conn:
        category = conn.execute("SELECT category FROM cases WHERE case_id = ?", (case,)).fetchone()[0]
    ok(tools.start_verification(case, tools.get_verification_protocol(category)["steps"]), "start_verification")
    note("(script: no clearer test photo to resend, so the standard check guide is issued with tools.start_verification)")


def _quick_close(case: str, state: dict, verdict: str, repair_note: str) -> dict:
    """Accept, VALID, book, repair, sign: the happy path without the narration."""
    import tools
    ok(tools.respond_to_assignment(case, True), "accept")
    ok(tools.record_verdict(case, "VALID", verdict), "verdict")
    state = run_event(sync(state, case), "verdict.recorded", verdict_note=verdict)
    ok(tools.book_repair(case, tools.get_booking_options(case, "repair")["options"][0]["start"]), "book repair")
    ok(tools.mark_repaired(case, repair_note, FIXED_PHOTO), "repaired")
    state = run_event(sync(state, case), "repair.done", repair_note=repair_note, repair_photo_path=FIXED_PHOTO)
    if state["verification_result"].get("needs_technician_input"):
        note("VerificationAgent held the repair photo as unclear")
        _issue_standard_guide(case)
    ok(tools.record_signoff(case, "developer"), "developer sign-off")
    ok(tools.record_verification(case, "FIXED"), "buyer FIXED")
    return sync(state, case)


def scenario_leak_comes_back(llm: DemoLLM | None) -> None:
    import tools
    banner("Scenario 2: the leak comes back (3rd time in this unit)",
           "A-12-08 already had water leaks (H-0001, H-0002, C-0014). A new one is fixed and closed, then the buyer "
           "reopens it within 30 days -> RecurrenceAgent asks SDP for an extra inspection.")
    if llm:
        llm.scenario = {
            # answers like live qwen did on 21 Oct ('other', no location); intake must correct it from the words
            "intake": {"category": "other", "sub_category": "", "location_in_unit": None,
                       "summary": "Ceiling issue reported again.", "urgency": "normal", "mentions_previous_issue": True,
                       "mentioned_recurrence_count": 3, "missing_info": [], "follow_up_question": "",
                       "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False},
            "cluster": "Third water leak in A-12-08, and units above and below in stack A-08 report the same.",
            "scope": {"area": "small", "parts_to_replace": False, "multiple_spots": False, "needs_drying_or_curing": True},
        }
    inbox = Inbox()
    description = "Ceiling bocor lagi in the bedroom, this is the third time!"
    case = ok(tools.create_case("A-12-08", "B-0118", description, photo=LEAK_AGAIN_PHOTO), "create_case")["case_id"]
    step(1, "Buyer (web app)", f"reports the leak again -> case {case}")
    state = new_case_chain(2, case, "A-12-08", description, LEAK_AGAIN_PHOTO, inbox)
    step(7, "(fast-forward)", "technician accepts, VALID, repair booked and done, SDP + buyer sign")
    state = _quick_close(case, state, "Ceiling board stained near the window; resealed from below.",
                         "Patched and resealed the ceiling near the window.")
    inbox.show()
    show_case(case)

    before_close = dict(state)
    ok(tools.reopen_case(case, "The stain is back after the weekend rain.", LEAK_AGAIN_PHOTO), "reopen_case")
    step(8, "Buyer (web app)", "reopens within 30 days with a new photo")
    state = run_event(before_close, "case.reopened", reopen_photo_path=LEAK_AGAIN_PHOTO,
                      reopen_description="The stain is back after the weekend rain.")
    r = state["recurrence_result"]
    step(9, "RecurrenceAgent (P2)", f"{r['action']}: occurrence {r['occurrence']}, stack units {r['cluster_size']}")
    for reason in r["escalation_reasons"]:
        note(f"reason: {reason}")
    if r.get("approval_id"):
        note(f"SDP approval request {r['approval_id']}, linked to systemic issue {r.get('issue_id')}")
    step(10, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case)
    if r.get("approval_id"):
        ok(tools.decide_approval(r["approval_id"], True), "decide_approval")
        step(11, "SDP staff (web app)", f"approves the extra inspection {r['approval_id']}")
        show_case(case)
        note("(InitialInspectionAgent would write the inspection brief next; it isn't wired to this event yet)")


def scenario_nobody_free(llm: DemoLLM | None) -> None:
    import tools
    banner("Scenario 3: the only technician says no",
           "A blocked drain in block C: only T-02 does plumbing there. T-02 rejects the visit in the app -> "
           "BookingAgent finds nobody else -> SDP is asked to book by hand, buyer told we're arranging it.")
    with _db() as conn:
        unit, buyer = conn.execute(
            "SELECT u.unit_id, b.buyer_id FROM units u JOIN buyers b ON b.unit_id = u.unit_id "
            "WHERE u.block = 'C' AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.unit_id = u.unit_id) "
            "ORDER BY u.unit_id LIMIT 1").fetchone()
    if llm:
        llm.scenario = {"intake": {"category": "sanitary_fittings", "sub_category": "floor_trap", "location_in_unit": "common bathroom",
                                   "summary": "Water pooling around the bathroom floor trap.", "urgency": "normal",
                                   "mentions_previous_issue": False, "mentioned_recurrence_count": None, "missing_info": [],
                                   "follow_up_question": "", "preliminary_outcome": "VALID_DEFECT", "mismatch_detected": False}}
    inbox = Inbox()
    description = "Water pools around the floor trap in the common bathroom and doesn't drain."
    case = ok(tools.create_case(unit, buyer, description, photo=DRAIN_PHOTO), "create_case")["case_id"]
    step(1, "Buyer (web app)", f"reports a drain problem in {unit} -> case {case}")
    state = new_case_chain(2, case, unit, description, DRAIN_PHOTO, inbox)

    ok(tools.respond_to_assignment(case, False, "Fully booked that day"), "reject visit")
    step(7, "Technician (app)", "rejects the visit: \"Fully booked that day\"")
    show_case(case)
    state = run_event(sync(state, case), "booking.rejected")
    b = state["booking_result"]
    step(8, "BookingAgent (P2)", f"booking {b.get('booking_status')}: {b.get('reason')}")
    step(9, "CommsAgent (P2)", "buyer update")
    inbox.show()
    show_case(case)
    return case


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
            scenario_leak_comes_back(llm)
        case = scenario_nobody_free(llm) if 3 in want or 4 in want else None
        if 4 in want:
            scenario_guardrail(llm, case)
    finally:
        print(f"\nDone. The temporary DB is kept for a look: {tmp / 'demo.db'}")


if __name__ == "__main__":
    main()
