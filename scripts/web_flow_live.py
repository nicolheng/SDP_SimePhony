"""The web app's actions (backend/demo_api/workflow.py) with the real AI agents, without a browser.

    python scripts/web_flow_live.py              # USE_AI_AGENTS=all, real Ollama (qwen2.5:7b + llava-llama3)
    python scripts/web_flow_live.py --off        # the rule-based stand-ins, for comparison

Runs WEB_TEST_PLAN.md TC1 (door, full path), TC2 (repeat leak -> SDP approves -> brief), TC3 (hand-over) and
TC4 (reopen -> revisit) on a temporary copy of data/seed.db; the live DB, uploads/ and Gmail are untouched.
After each click it prints the case status, the buyer's new messages and the agents' new trace steps.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
IMAGES = ROOT / "tests" / "data" / "test_cases" / "images"


def setup(ai_on: bool) -> Path:
    os.environ["USE_AI_AGENTS"] = "all" if ai_on else "false"
    os.environ["EMAIL_ENABLED"] = "false"
    os.environ["EMBEDDINGS_ENABLED"] = "false"
    import db
    import tools
    tmp = Path(tempfile.mkdtemp(prefix="simephony-web-"))
    shutil.copyfile(ROOT / "data" / "seed.db", tmp / "web.db")
    db.DB_PATH = tmp / "web.db"
    tools.UPLOADS_DIR = tmp / "uploads"
    tools.get_clock()  # migrations
    print(f"Temporary DB: {db.DB_PATH}\nAI agents: {'ON (Ollama)' if ai_on else 'OFF (stand-ins)'}")
    return tmp


def web(fn, *args):
    import db
    from demo_api import workflow
    with db.get_conn() as conn:
        return fn(workflow.Ctx(conn), *args)


def photo(name: str) -> str:
    """A browser-style data URL, as the web app receives uploads."""
    import base64
    return "data:image/jpeg;base64," + base64.b64encode((IMAGES / name).read_bytes()).decode()


class Watch:
    """Prints what changed for one case since the last click."""

    def __init__(self, case_id: str):
        self.case_id, self.msgs, self.steps = case_id, 0, 0

    def show(self, n: int, who: str, what: str) -> dict:
        import db
        with db.get_conn() as conn:
            case = dict(conn.execute("SELECT * FROM cases WHERE case_id = ?", (self.case_id,)).fetchone())
            msgs = conn.execute("SELECT title, body FROM buyer_messages WHERE case_id = ? ORDER BY created_at, message_id",
                                (self.case_id,)).fetchall()
            steps = conn.execute("SELECT payload FROM case_events WHERE case_id = ? AND type = 'agent.step' "
                                 "ORDER BY created_at, event_id", (self.case_id,)).fetchall()
        print(f"\n[{n}] {who}: {what}")
        for s in steps[self.steps:]:
            p = json.loads(s["payload"])
            print(f"      TRACE {p.get('agent')}: {p.get('message')}")
        for m in msgs[self.msgs:]:
            print(f"      BUYER > {m['title']}")
            for line in m["body"].splitlines():
                if line.strip():
                    print(f"              {line}")
        tech = f", technician {case['technician_id']}" if case.get("technician_id") else ""
        hours = f", repair {case['repair_hours']:g} h" if case.get("repair_hours") else ""
        print(f"      CASE {self.case_id}: {case['status']}{tech}, urgency {case['urgency']}, booking {case['booking_status']}{hours}")
        self.msgs, self.steps = len(msgs), len(steps)
        return case


def banner(title: str) -> None:
    print("\n" + "=" * 78 + f"\n  {title}\n" + "=" * 78)


def tc1_door_happy_path() -> str:
    from demo_api import workflow
    import tools
    banner("TC1 door defect: report -> visit -> VALID + estimate -> repair -> SDP signs -> buyer checks -> CLOSED")
    case_id = web(workflow.submit_report, "A-12-08", "B-0118", "Pintu bilik tidur tak boleh tutup, tersangkut separuh jalan.",
                  photo("door_misaligned.jpg"), None)["caseId"]
    w = Watch(case_id)
    c = w.show(1, "Buyer", "reports a door that won't close (door_misaligned.jpg)")
    web(workflow.accept_job, case_id, c["technician_id"])
    w.show(2, f"Technician {c['technician_id']}", "accepts the visit")
    web(workflow.record_verdict, case_id, "VALID",
        "Door hinge loose and the frame has swollen; needs a new hinge and the frame planed.", None)
    w.show(3, "Technician", "VALID with a note")
    start = tools.get_booking_options(case_id, "repair")["options"][0]["start"]
    web(workflow.book_repair, case_id, start)
    c = w.show(4, "Buyer", "books the first repair slot")
    web(workflow.accept_job, case_id, c["technician_id"])
    web(workflow.mark_repaired, case_id, "Replaced the hinge and planed the frame; door closes smoothly.",
        photo("door_misaligned.jpg"))
    w.show(5, f"Repairer {c['technician_id']}", "accepts, then marks repaired (after photo)")
    web(workflow.developer_signoff, case_id)
    w.show(6, "SDP", "Developer Sign-off")
    web(workflow.submit_verification, case_id, "FIXED", "", None)
    w.show(7, "Buyer", "Fixed — Sign Off")
    return case_id


def tc2_repeat_leak() -> None:
    import db
    from demo_api import workflow
    banner("TC2 repeat water leak in A-12-08: visit + SDP request -> approve -> brief -> detailed inspection")
    case_id = web(workflow.submit_report, "A-12-08", "B-0118", "Siling bilik tidur utama bocor lagi, ini kali ketiga!",
                  photo("water_leak_again.jpg"), None)["caseId"]
    w = Watch(case_id)
    w.show(1, "Buyer", "reports the leak again (water_leak_again.jpg)")
    with db.get_conn() as conn:
        row = conn.execute("SELECT approval_id FROM approvals WHERE case_id = ? AND status = 'pending'", (case_id,)).fetchone()
    if not row:
        print("      (no SDP request was made)")
        return
    web(workflow.decide_approval, row["approval_id"], True)
    w.show(2, "SDP", f"approves {row['approval_id']}")
    with db.get_conn() as conn:
        brief = conn.execute("SELECT brief FROM inspection_briefs WHERE case_id = ?", (case_id,)).fetchone()
    if brief:
        b = json.loads(brief["brief"])
        print("      BRIEF checklist:")
        for item in b.get("checklist", []):
            print(f"        - {item}")
        print(f"      BRIEF likely components: {', '.join(b.get('likelyComponents', []))}")


def tc3_handover() -> None:
    from demo_api import workflow
    banner("TC3 the technician hands the visit over")
    case_id = web(workflow.submit_report, "A-12-08", "B-0118", "Sinki dapur bocor dari paip bawah, air bertakung dalam kabinet.",
                  photo("bathroom_pooling.jpg"), None)["caseId"]
    w = Watch(case_id)
    c = w.show(1, "Buyer", "reports a leaking kitchen sink pipe")
    try:
        web(workflow.hand_over, case_id, c["technician_id"], "Called to an emergency.")
        w.show(2, f"Technician {c['technician_id']}", "hands the visit over")
    except Exception as e:
        print(f"\n[2] hand-over refused: {e}")


def tc4_reopen(case_id: str) -> None:
    from demo_api import workflow
    banner("TC4 the door from TC1 comes back within 30 days -> reopen -> revisit")
    w = Watch(case_id)
    w.msgs, w.steps = 10**6, 10**6  # only what's new
    import db
    with db.get_conn() as conn:
        w.msgs = conn.execute("SELECT COUNT(*) FROM buyer_messages WHERE case_id = ?", (case_id,)).fetchone()[0]
        w.steps = conn.execute("SELECT COUNT(*) FROM case_events WHERE case_id = ? AND type = 'agent.step'", (case_id,)).fetchone()[0]
    web(workflow.reopen_case, case_id, "Pintu tersangkut lagi.", photo("door_misaligned.jpg"))
    w.show(1, "Buyer", "Reopen Case with a new photo")


def tc5_simulate_rain() -> None:
    from fastapi import BackgroundTasks
    from starlette.requests import Request

    import db
    from demo_api import routes

    banner("TC5 simulate rain: save reports -> run AI intake, recurrence and triage -> refresh state")
    with db.get_conn() as conn:
        before = {row["case_id"] for row in conn.execute(
            "SELECT case_id FROM cases WHERE unit_id IN ('A-13-08', 'A-11-08')"
        )}
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
    tasks = BackgroundTasks()
    routes.rain(request, tasks)
    for task in tasks.tasks:
        task.func(*task.args, **task.kwargs)

    state = routes.get_state(request)["state"]
    with db.get_conn() as conn:
        after = {row["case_id"] for row in conn.execute(
            "SELECT case_id FROM cases WHERE unit_id IN ('A-13-08', 'A-11-08')"
        )}
    created = after - before
    for case in state["cases"]:
        if case["id"] in created:
            print(f"      CASE {case['id']} ({case['unitId']}): {case['status']}")
            for event in state["events"]:
                if event["caseId"] == case["id"] and event["type"] == "agent.step":
                    print(f"      TRACE {event.get('agent')}: {event['message']}")
    if not created:
        print("      (rain reports already have an active case; no new reports were created)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--off", action="store_true", help="rule-based stand-ins only (USE_AI_AGENTS=false)")
    args = parser.parse_args()
    tmp = setup(not args.off)
    try:
        door = tc1_door_happy_path()
        tc2_repeat_leak()
        tc3_handover()
        tc4_reopen(door)
        tc5_simulate_rain()
    finally:
        print(f"\nDone. The temporary DB is kept for a look: {tmp / 'web.db'}")


if __name__ == "__main__":
    main()
