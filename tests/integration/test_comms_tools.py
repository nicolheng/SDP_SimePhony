# CommsAgent linked to backend/tools.py notify_buyer (in-app inbox + outbox email) on a temp seed.db.
import pytest

from agents.simephony.comms import comms_node

pytestmark = pytest.mark.usefixtures("seed_db")


def _db():
    import db
    return db.get_conn()


def test_update_lands_in_buyer_inbox_and_outbox(fake_llm):
    fake_llm.responses = ["Our technician confirmed the leak under your kitchen sink. Please book a repair."]
    out = comms_node({"case_id": "C-0007", "unit_id": "C-12-01", "current_status": "VALID",
                      "intake_result": {"category": "plumbing"}, "verdict_note": "Leaking trap joint."})
    r = out["comms_result"]
    assert r["delivery"] == "logged, not sent"  # EMAIL_ENABLED=false in tests
    assert r["message_id"].startswith("BM-")
    with _db() as conn:
        msg = conn.execute("SELECT title, body FROM buyer_messages WHERE message_id = ?", (r["message_id"],)).fetchone()
        mail = conn.execute("SELECT to_addr, subject, body FROM outbox WHERE case_id = 'C-0007' ORDER BY email_id DESC").fetchone()
        buyer = conn.execute("SELECT b.email FROM cases c JOIN buyers b ON b.buyer_id = c.buyer_id WHERE c.case_id = 'C-0007'").fetchone()
    assert msg["title"] == "Defect confirmed: please book a repair"
    assert msg["body"] == r["message"]
    assert mail["subject"] == "[C-0007] Defect confirmed: please book a repair"
    assert mail["to_addr"] == buyer["email"]


def test_unknown_case_is_recorded_not_crashing(fake_llm):
    fake_llm.responses = ["A technician has been assigned."]
    out = comms_node({"case_id": "C-NOPE", "current_status": "VISIT_SCHEDULED", "intake_result": {"category": "plumbing"}})
    r = out["comms_result"]
    assert r["delivery"] == "failed" and r["error"]
    assert r["message"] == "A technician has been assigned."
