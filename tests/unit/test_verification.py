import json
import pytest

from agents.simephony.verification import (
    IF_FAILS,
    protocol_steps,
    assess_repair_photo,
    verification_node,
    verification_result_node,
)
from agents.simephony.guardrails import scan_for_unsafe_steps, scan_for_liability

HEADER = "The technician's photo appears to show"


def _vision(assessment="looks_resolved", matches=True, obs="Patch is dry and painted."):
    return json.dumps({"assessment": assessment, "observations": obs, "matches_location": matches})


@pytest.fixture
def repair_photo(tmp_path):
    p = tmp_path / "repair.jpg"
    p.write_bytes(b"\xff\xd8\xff\xe0tinyjpg")
    return str(p)


@pytest.fixture
def state(repair_photo):
    return {
        "case_id": "C-1",
        "user_description": "Water leaking from the ceiling",
        "intake_result": {"category": "water_leak", "location_in_unit": "master bedroom ceiling"},
        "repair_note": "Resealed the pipe joint above and patched the ceiling.",
        "repair_photo_path": repair_photo,
        "current_status": "REPAIRED",
    }


def test_missing_repair_photo_asks_technician(state, fake_llm):
    del state["repair_photo_path"]
    out = verification_node(state)
    r = out["verification_result"]
    assert r["needs_technician_input"] is True
    assert "photo" in r["technician_message"].lower()
    assert r["protocol"] is None
    assert fake_llm.calls == []
    assert out["current_status"] == "REPAIRED"


def test_missing_repair_note_asks_technician(state, fake_llm):
    del state["repair_note"]
    r = verification_node(state)["verification_result"]
    assert r["needs_technician_input"] is True
    assert "note" in r["technician_message"].lower()
    assert fake_llm.calls == []


def test_nonexistent_photo_file_treated_as_missing(state, fake_llm):
    state["repair_photo_path"] = "does/not/exist.jpg"
    r = verification_node(state)["verification_result"]
    assert r["needs_technician_input"] is True
    assert fake_llm.calls == []


def test_vision_not_resolved_holds_buyer_message(state, fake_llm):
    fake_llm.responses = [_vision("not_resolved", True, "Stain still visible")]
    out = verification_node(state)
    r = out["verification_result"]
    assert r["protocol"] is None
    assert r["needs_technician_input"] is True
    assert "Stain still visible" in r["technician_message"]
    assert len(fake_llm.calls) == 1
    assert out["current_status"] == "REPAIRED"


def test_vision_location_mismatch_holds_buyer_message(state, fake_llm):
    fake_llm.responses = [_vision("looks_resolved", False, "Photo shows a kitchen")]
    out = verification_node(state)
    r = out["verification_result"]
    assert r["protocol"] is None
    assert r["needs_technician_input"] is True
    assert "Photo shows a kitchen" in r["technician_message"]
    assert len(fake_llm.calls) == 1
    assert out["current_status"] == "REPAIRED"


def test_vision_garbage_treated_as_unclear(state, fake_llm):
    fake_llm.responses = ["not json"]
    out = verification_node(state)
    r = out["verification_result"]
    assert r["assessment"] == "unclear"
    assert r["protocol"] is None
    assert r["needs_technician_input"] is True
    assert out["current_status"] == "REPAIRED"


def test_vision_unknown_value_treated_as_unclear(state, fake_llm):
    fake_llm.responses = [_vision("totally_fixed")]
    assert assess_repair_photo(state)["assessment"] == "unclear"


def test_vision_prompt_has_case_details(state, fake_llm, tmp_path):
    orig = tmp_path / "orig.jpg"
    orig.write_bytes(b"\xff\xd8\xff\xe0orig")
    state["image_path"] = str(orig)
    fake_llm.responses = [_vision()]
    assess_repair_photo(state)
    content = fake_llm.calls[0][-1]["content"]
    images = [p for p in content if p["type"] == "image_url"]
    text = " ".join(p["text"] for p in content if p["type"] == "text")
    assert len(images) == 2
    assert all(p["image_url"]["url"].startswith("data:image/jpeg;base64,") for p in images)
    assert "master bedroom ceiling" in text
    assert state["repair_note"] in text


def test_resolved_builds_safe_guide(state, fake_llm):
    fake_llm.responses = [_vision(), "Look at the patched area for damp or staining."]
    out = verification_node(state)
    r = out["verification_result"]
    assert r["needs_technician_input"] is False
    assert r["protocol"].startswith(HEADER)
    assert "master bedroom ceiling" in r["protocol"].splitlines()[0]
    assert r["protocol"].rstrip().endswith(IF_FAILS)  # same wording as the web app's sign-off page
    assert r["verification_id"] == "V-STUB" and r["save_error"] is None
    assert "Look at the patched area" in r["protocol"]
    assert out["current_status"] == "PENDING_SIGNOFF"
    assert len(fake_llm.calls) == 2


def test_guide_strips_unsafe_steps(state, fake_llm):
    fake_llm.responses = [
        _vision(),
        "Look at the ceiling patch for damp.\nOpen the breaker panel and check the wiring.\nRun the tap and watch for drips.",
    ]
    p = verification_node(state)["verification_result"]["protocol"]
    assert "breaker panel" not in p
    assert "wiring" not in p
    assert "Look at the ceiling patch" in p
    assert "Run the tap" in p


def test_guide_strips_liability_lines(state, fake_llm):
    fake_llm.responses = [
        _vision(),
        "Look at the ceiling patch for damp.\nWe guarantee it will never leak again.",
    ]
    p = verification_node(state)["verification_result"]["protocol"]
    assert "guarantee" not in p.lower()
    assert "Look at the ceiling patch" in p
    assert scan_for_liability(p)[0] is False


def test_all_lines_filtered_falls_back_to_safe_checks(state, fake_llm):
    fake_llm.responses = [_vision(), "Open the breaker panel.\nClimb a ladder and check the wiring."]
    p = verification_node(state)["verification_result"]["protocol"]
    for item in protocol_steps("water_leak"):
        assert item in p.splitlines()
    assert "ladder" not in p


def test_preamble_line_dropped(state, fake_llm):
    fake_llm.responses = [_vision(), "Here are the checks:\nLook at the ceiling patch for damp."]
    p = verification_node(state)["verification_result"]["protocol"]
    assert "Here are the checks" not in p
    assert "Look at the ceiling patch" in p


def test_text_llm_error_falls_back_to_safe_checks(state, fake_llm):
    fake_llm.responses = [_vision()]
    orig = fake_llm.client.chat.completions.create.side_effect

    def boom(**kw):
        if len(fake_llm.calls) >= 1:
            raise RuntimeError("down")
        return orig(**kw)

    fake_llm.client.chat.completions.create.side_effect = boom
    r = verification_node(state)
    p = r["verification_result"]["protocol"]
    for item in protocol_steps("water_leak"):
        assert item in p.splitlines()
    assert r["current_status"] == "PENDING_SIGNOFF"


def test_scan_for_unsafe_steps():
    assert scan_for_unsafe_steps("Open the breaker box") != []
    assert scan_for_unsafe_steps("Climb a ladder") != []
    assert scan_for_unsafe_steps("Look at the wall") == []
    assert scan_for_unsafe_steps("Check the wireless doorbell and toolbar") == []
    assert scan_for_unsafe_steps("Check the door panel is aligned") == []
    assert scan_for_unsafe_steps("Stand on a chair to look") != []
    assert scan_for_unsafe_steps("Open the breaker panel") != []
    assert scan_for_unsafe_steps("Use a step stool or tools near the wires") != []


def test_electrical_steps_include_stop_rule():
    assert "stop, do not touch anything" in " ".join(protocol_steps("electrical")).lower()


def test_steps_come_from_rules_yaml():
    from agents.simephony.rules import load_rules
    assert protocol_steps("tiles") == load_rules()["verification_protocols"]["tiles"]
    assert protocol_steps("no_such_category") == load_rules()["verification_protocols"]["other"]


def test_steps_fall_back_when_the_tool_fails(monkeypatch):
    from agents.simephony import backend_tools
    def boom(category):
        raise RuntimeError("rules.yaml unreadable")
    monkeypatch.setattr(backend_tools, "get_verification_protocol", boom)
    steps = protocol_steps("water_leak")
    assert steps and all(not scan_for_unsafe_steps(s) for s in steps)


def test_unsafe_step_added_to_rules_is_screened_out(monkeypatch):
    from agents.simephony import backend_tools
    monkeypatch.setattr(backend_tools, "get_verification_protocol", lambda c: {
        "steps": ["Look at the repaired joint.", "Unscrew the cover and check the wiring."]})
    assert protocol_steps("plumbing") == ["Look at the repaired joint."]


def test_every_category_step_is_safe():
    from agents.simephony.rules import load_rules
    for cat in load_rules()["verification_protocols"]:
        for item in protocol_steps(cat):
            assert scan_for_unsafe_steps(item) == [], (cat, item)
            assert scan_for_liability(item)[0] is False, (cat, item)


def test_outcome_fixed():
    # Sign-off order is technician -> SDP -> buyer: the buyer's FIXED is the last one and closes the case.
    out = verification_result_node({"verification_outcome": "FIXED", "current_status": "PENDING_SIGNOFF"})
    assert out["current_status"] == "CLOSED"
    assert out["verification_status"] == "verified"
    assert out["verification_result"]["next_event"] is None


def test_outcome_not_fixed_reopens_the_case():
    out = verification_result_node(
        {"verification_outcome": "NOT_FIXED", "current_status": "PENDING_SIGNOFF", "verification_result": {"x": 1},
         "reopen_photo_path": "/tmp/still-leaking.jpg", "reopen_count": 0}
    )
    assert out["current_status"] == "REOPENED"  # CONTRACTS: NOT_FIXED (with photo) -> REOPENED
    assert out["reopen_count"] == 1
    assert out["verification_status"] == "not_verified"
    assert out["verification_result"]["next_event"] == "case.reopened"
    assert out["verification_result"]["x"] == 1


def test_outcome_not_fixed_needs_a_photo():
    out = verification_result_node(
        {"verification_outcome": "NOT_FIXED", "current_status": "PENDING_SIGNOFF", "reopen_count": 0}
    )
    assert "photo" in out["verification_result"]["rejected_reason"]
    assert out["current_status"] == "PENDING_SIGNOFF"
    assert out["reopen_count"] == 0


def test_outcome_cannot_verify():
    out = verification_result_node({"verification_outcome": "CANNOT_VERIFY", "current_status": "PENDING_SIGNOFF"})
    assert out["current_status"] == "PENDING_SIGNOFF"
    assert out["verification_status"] == "pending"
    assert out["verification_result"]["next_event"] is None


@pytest.mark.live_llm
def test_live_assess_repair_photo():
    img = "tests/data/test_cases/images/ceiling-water-leak.jpg"
    result = assess_repair_photo({
        "image_path": img,
        "repair_photo_path": img,
        "user_description": "Water leaking from ceiling",
        "intake_result": {"category": "water_leak", "location_in_unit": "ceiling"},
        "repair_note": "Patched ceiling.",
    })
    assert result["assessment"] in {"looks_resolved", "unclear", "not_resolved"}


# --- Final review fix wave ---
from agents.simephony.verification import _safe_lines


@pytest.mark.parametrize("category", ["electrical", "roof", "door_window"])
def test_high_risk_categories_use_safe_checks_verbatim(state, fake_llm, category):
    state["intake_result"]["category"] = category
    fake_llm.responses = [_vision(), "Remove the socket cover and look inside."]
    r = verification_node(state)["verification_result"]
    lines = r["protocol"].splitlines()
    assert "master bedroom ceiling" in lines[0]
    assert lines[1:-1] == protocol_steps(category)
    assert "cover" not in r["protocol"]
    assert len(fake_llm.calls) == 1  # vision only, no text LLM


def test_guide_drops_signoff_and_placeholder_lines(state, fake_llm):
    fake_llm.responses = [_vision(), "Look at the ceiling patch.\nBest regards,\n[Your Name]\nSimeProperty Team"]
    p = verification_node(state)["verification_result"]["protocol"]
    assert "Best regards" not in p and "[Your Name]" not in p and "SimeProperty Team" not in p
    assert "Look at the ceiling patch." in p


def test_safe_lines_strips_signoff():
    assert _safe_lines("Look at the ceiling patch.\nBest regards,\n[Your Name]\nSimeProperty Team") == [
        "Look at the ceiling patch."
    ]


@pytest.mark.parametrize("status", ["INVALID", "CLOSED", "PENDING_SIGNOFF", "VALID"])
def test_repair_done_requires_repaired_status(state, fake_llm, status):
    state["current_status"] = status
    out = verification_node(state)
    r = out["verification_result"]
    assert out["current_status"] == status
    assert r["rejected_reason"]
    assert "needs_technician_input" not in r  # a wrong-status event is not a technician task
    assert r.get("protocol") is None
    assert fake_llm.calls == []


def test_wrong_status_repair_done_keeps_existing_record(state, fake_llm):
    state["current_status"] = "PENDING_SIGNOFF"
    state["verification_result"] = {"protocol": "Look at the patch.", "needs_technician_input": False,
                                    "technician_message": None}
    r = verification_node(state)["verification_result"]
    assert r["rejected_reason"]
    assert r["protocol"] == "Look at the patch."
    assert r["needs_technician_input"] is False
    assert r["technician_message"] is None


def test_new_guide_resets_earlier_verified_status(state, fake_llm):
    state["verification_status"] = "verified"  # left over from an earlier repair cycle
    fake_llm.responses = [_vision(), "Look at the ceiling patch for damp."]
    out = verification_node(state)
    assert out["current_status"] == "PENDING_SIGNOFF"
    assert out["verification_status"] == "pending"


def test_vision_outage_is_logged_and_labelled(state, fake_llm, capsys):
    def boom(**kw):
        raise RuntimeError("ollama down")
    fake_llm.client.chat.completions.create.side_effect = boom
    out = verification_node(state)
    r = out["verification_result"]
    assert r["assessment"] == "unclear"
    assert r["observations"] == "Photo check unavailable"
    assert "Photo check unavailable" in r["technician_message"]
    assert "[VERIFICATION] vision check failed" in capsys.readouterr().out
    assert out["current_status"] == "REPAIRED"


def test_outcome_not_fixed_on_closed_case_leaves_closed():
    out = verification_result_node({"verification_outcome": "NOT_FIXED", "current_status": "CLOSED"})
    assert out["current_status"] == "CLOSED"
    assert out["verification_result"]["rejected_reason"]
    assert out["verification_result"].get("next_event") is None
    assert "verification_status" not in out


def test_outcome_fixed_on_invalid_case_leaves_invalid():
    out = verification_result_node({"verification_outcome": "FIXED", "current_status": "INVALID"})
    assert out["current_status"] == "INVALID"
    assert out["verification_result"]["rejected_reason"]


@pytest.mark.parametrize("outcome", [None, "", "MAYBE"])
def test_unknown_outcome_leaves_status_and_is_rejected(outcome):
    s = {"current_status": "PENDING_SIGNOFF"}
    if outcome is not None:
        s["verification_outcome"] = outcome
    out = verification_result_node(s)
    assert out["current_status"] == "PENDING_SIGNOFF"
    assert out["verification_result"]["rejected_reason"]
    assert "verification_status" not in out


def test_valid_outcome_clears_stale_rejected_reason():
    out = verification_result_node({"verification_outcome": "FIXED", "current_status": "PENDING_SIGNOFF",
                                    "verification_result": {"rejected_reason": "old"}})
    assert "rejected_reason" not in out["verification_result"]



def test_guide_without_case_id_is_not_saved_but_still_built(state, fake_llm):
    del state["case_id"]
    fake_llm.responses = [_vision(), "Look at the patched area for damp or staining."]
    r = verification_node(state)["verification_result"]
    assert r["verification_id"] is None and "case_id" in r["save_error"]
    assert "Look at the patched area" in r["protocol"]


# --- rules.yaml check steps the buyer can safely and actually do ---
def test_rules_yaml_electrical_has_the_stop_rule():
    from agents.simephony.rules import load_rules
    steps = " ".join(load_rules()["verification_protocols"]["electrical"]).lower()
    assert "sparks" in steps and "stop" in steps and "do not touch anything" in steps


def test_rules_yaml_never_sends_the_buyer_into_another_unit():
    from agents.simephony.rules import load_rules
    for category, steps in load_rules()["verification_protocols"].items():
        for step in steps:
            assert "unit above" not in step.lower(), (category, step)
