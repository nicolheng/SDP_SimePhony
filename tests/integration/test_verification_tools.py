# VerificationAgent linked to backend/tools.py (get_verification_protocol + start_verification) on a temp seed.db.
import json

import pytest

from agents.simephony.verification import verification_node

pytestmark = pytest.mark.usefixtures("seed_db")
VISION_OK = json.dumps({"assessment": "looks_resolved", "observations": "Joint resealed, dry.", "matches_location": True})


def _db():
    import db
    return db.get_conn()


def _state(case_id, category, location, photo):
    return {"case_id": case_id, "current_status": "REPAIRED", "user_description": "Problem reported",
            "intake_result": {"category": category, "location_in_unit": location},
            "repair_note": "Fixed and tested.", "repair_photo_path": photo}


@pytest.fixture
def photo(tmp_path):
    p = tmp_path / "after.jpg"
    p.write_bytes(b"\xff\xd8\xff\xe0after")
    return str(p)


def _saved_guide(case_id):
    with _db() as conn:
        row = conn.execute("SELECT protocol FROM verifications WHERE case_id = ? ORDER BY created_at DESC, verification_id DESC",
                           (case_id,)).fetchone()
        status = conn.execute("SELECT status FROM cases WHERE case_id = ?", (case_id,)).fetchone()["status"]
    return json.loads(row["protocol"]), status


def test_guide_is_saved_for_the_buyer_sign_off_page(fake_llm, photo):
    # C-0007: C-12-01 kitchen sink, plumbing, REPAIRED in seed.db
    fake_llm.responses = [VISION_OK, "Open the kitchen sink tap fully and let it run for 2 minutes.\n"
                                     "Look under the kitchen sink for drips or pooling."]
    out = verification_node(_state("C-0007", "plumbing", "kitchen sink", photo))
    guide, status = _saved_guide("C-0007")
    assert status == "PENDING_SIGNOFF"
    assert out["current_status"] == "PENDING_SIGNOFF"
    assert out["verification_result"]["verification_id"].startswith("V-")
    assert guide["steps"] == ["Open the kitchen sink tap fully and let it run for 2 minutes.",
                              "Look under the kitchen sink for drips or pooling."]
    assert "Still not fixed" in guide["ifFails"]


def test_electrical_guide_uses_rules_yaml_steps_word_for_word(fake_llm, photo):
    from agents.simephony.rules import load_rules
    with _db() as conn:
        conn.execute("UPDATE cases SET status = 'REPAIRED' WHERE case_id = 'H-0037'")  # electrical, A-9-03
    fake_llm.responses = [VISION_OK]  # no text-LLM call for electrical
    verification_node(_state("H-0037", "electrical", "master bedroom bedside", photo))
    guide, _ = _saved_guide("H-0037")
    for step in load_rules()["verification_protocols"]["electrical"]:
        assert step in guide["steps"]
    assert "Do not open the distribution board or touch any wiring." in guide["steps"]
    assert any("sparks" in s and "stop" in s for s in guide["steps"])
    assert len(fake_llm.calls) == 1


def test_db_refusal_is_recorded_not_crashing(fake_llm, photo):
    # C-0004 is PENDING_SIGNOFF in the DB, so tools.start_verification refuses
    fake_llm.responses = [VISION_OK, "Look at the repainted wall in bedroom 2 in daylight."]
    out = verification_node(_state("C-0004", "paint", "bedroom 2", photo))
    r = out["verification_result"]
    assert r["verification_id"] is None
    assert "start verification" in r["save_error"]



def test_signoff_ready_loads_saved_guide_and_deadline():
    # C-0007: plumbing, REPAIRED in seed.db. Guide saved at repair.done; SDP signs; the buyer's step reads it back.
    import tools
    from agents.simephony.verification import signoff_ready_node
    tools.start_verification("C-0007", {"intro": "The photo shows the repair at the kitchen sink.",
                                        "steps": ["Run the tap for 5 minutes.", "Look under the sink for drips."],
                                        "ifFails": "If any check fails, do not sign off."})
    tools.record_signoff("C-0007", "developer")
    out = signoff_ready_node({"case_id": "C-0007", "event": "developer.signed", "current_status": "PENDING_SIGNOFF"})
    assert out["verification_result"]["protocol"] == (
        "The photo shows the repair at the kitchen sink.\nRun the tap for 5 minutes.\n"
        "Look under the sink for drips.\nIf any check fails, do not sign off.")
    assert out["signoff_deadline_local"]  # e.g. "Mon, 2 Nov, 5:00 pm"
    assert out["current_status"] == "PENDING_SIGNOFF"


def test_signoff_ready_before_developer_signed_is_rejected():
    import tools
    from agents.simephony.verification import signoff_ready_node
    tools.start_verification("C-0007", ["Run the tap for 5 minutes."])  # guide saved, SDP not signed yet
    out = signoff_ready_node({"case_id": "C-0007", "event": "developer.signed", "current_status": "PENDING_SIGNOFF"})
    assert "developer" in out["verification_result"]["rejected_reason"]
