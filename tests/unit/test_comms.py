# tests/unit/test_comms.py
import pytest
from unittest.mock import patch
from agents.simephony.comms import comms_node

def test_dynamic_recipient():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "ASSIGNED",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
    }
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        mock_get_unit.return_value = {"buyer": {"email": "real_resident@example.com"}}
        comms_node(state)
        mock_get_unit.assert_called_once_with("A-12-08")
        _, kwargs = mock_send_email.call_args
        assert kwargs["to"] == "real_resident@example.com"

def test_dynamic_case_id():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-999",
        "current_status": "ASSIGNED",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
    }
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        mock_get_unit.return_value = {"buyer": {"email": "test@test.com"}}
        comms_node(state)
        _, kwargs = mock_send_email.call_args
        assert kwargs["case_id"] == "C-999"

@pytest.mark.live_llm
def test_technical_translation():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "VALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"},
        "verdict_note": "Replaced leaking 15mm copper pipe elbow, pressure tested 5 bar, no leaks detected."
    }
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        mock_get_unit.return_value = {"buyer": {"email": "test@test.com"}}
        result = comms_node(state)
        message = result["comms_result"]["message"]
        assert "15mm copper pipe elbow" not in message.lower()
        assert "pressure tested 5 bar" not in message.lower()
        assert any(word in message.lower() for word in ["fixed", "resolved", "repair"])

def test_guardrail_still_active(fake_llm):
    fake_llm.responses = ["We admit fault.", "Our technician has reviewed the report."]
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-123",
        "current_status": "INVALID",
        "intake_result": {"category": "wall_crack"},
        "triage_result": {"assigned_technician": "T-CIVIL-1"},
        "verdict_note": "We admit the concrete was poor quality, but it is within tolerance."
    }
    with patch("agents.simephony.comms.get_unit") as mock_get_unit, \
         patch("agents.simephony.comms.send_email") as mock_send_email:
        mock_get_unit.return_value = {"buyer": {"email": "test@test.com"}}
        result = comms_node(state)
        message = result["comms_result"]["message"].lower()
        assert "admit" not in message
        assert "poor quality" not in message
        assert "fault" not in message
        assert len(fake_llm.calls) == 2

@pytest.mark.live_llm
def test_comms_handles_valid_status():
    state = {
        "unit_id": "A-12-08",
        "case_id": "C-1",
        "current_status": "VALID",
        "intake_result": {"category": "plumbing"},
        "triage_result": {"assigned_technician": "T-PLUMB-1"}
    }
    with patch("agents.simephony.comms.get_unit"), patch("agents.simephony.comms.send_email"):
        result = comms_node(state)
        assert "comms_result" in result
        message = result["comms_result"]["message"].lower()
        assert any(word in message for word in ["booked", "next step", "scheduling", "appointment", "repair"])

def test_invalid_message_follows_contract(fake_llm):
    fake_llm.responses = ["Our technician found no developer defect.\n\nBest regards,\n[Your Name]"]
    state = {"unit_id": "A-12-08", "case_id": "C-2", "current_status": "INVALID",
             "intake_result": {"category": "plumbing"}, "verdict_note": "Stain is condensation from aircond."}
    msg = comms_node(state)["comms_result"]["message"]
    assert "[your name]" not in msg.lower()
    assert "best regards" not in msg.lower()
    assert msg.endswith("If the problem gets worse or changes, please submit a new report.")
    assert "condensation" in fake_llm.calls[0][-1]["content"].lower()   # tech reason reaches the prompt


def test_assigned_message_names_booked_technician(fake_llm):
    state = {"unit_id": "A-12-08", "case_id": "C-3", "current_status": "ASSIGNED",
             "intake_result": {"category": "plumbing"},
             "booking_result": {"assigned_technician": "T-PLUMB-1"}}
    comms_node(state)
    assert "T-PLUMB-1" in fake_llm.calls[0][-1]["content"]


# --- Final review fix wave ---
from agents.simephony.comms import NEUTRAL_TEMPLATES
from agents.simephony.guardrails import scan_for_liability

PROTOCOL = (
    "The technician's photo appears to show the repair completed at bedroom ceiling.\n"
    "Look at the repaired area for damp patches, staining or bubbling paint.\n"
    "If any check fails, do not sign off. Reopen the case within 30 days with a new photo."
)


def _send(state):
    with patch("agents.simephony.comms.get_unit", return_value={"buyer": {"email": "b@x.com"}}), \
         patch("agents.simephony.comms.send_email") as mail:
        out = comms_node(state)
    return out, mail.call_args.kwargs["body"]


def test_mid_body_thanks_not_truncated(fake_llm):
    fake_llm.responses = ["Hello,\nThanks\nYour repair is booked.\nThe technician will visit on Tuesday.\nPlease keep the area clear."]
    _, body = _send({"current_status": "ASSIGNED", "case_id": "C-1", "booking_result": {"assigned_technician": "T-1"}})
    assert "Please keep the area clear." in body
    assert "Your repair is booked." in body


def test_rewrite_still_dangerous_uses_neutral_template(fake_llm):
    fake_llm.responses = ["We admit fault and will refund you.", "This repair is permanent and will not come back."]
    out, body = _send({"current_status": "VALID", "case_id": "C-1", "intake_result": {"category": "plumbing"}})
    assert len(fake_llm.calls) == 2
    assert body == NEUTRAL_TEMPLATES["VALID"]
    assert scan_for_liability(body) == (False, [])
    assert out["comms_result"]["message"] == body


def test_neutral_template_invalid_keeps_closing(fake_llm):
    fake_llm.responses = ["Our mistake.", "Our mistake again."]
    _, body = _send({"current_status": "INVALID", "case_id": "C-1"})
    assert body.endswith("If the problem gets worse or changes, please submit a new report.")
    assert scan_for_liability(body) == (False, [])


def test_neutral_templates_are_safe():
    for status, text in NEUTRAL_TEMPLATES.items():
        assert scan_for_liability(text) == (False, []), status
        assert "[" not in text


def test_pending_signoff_appends_protocol_verbatim(fake_llm):
    fake_llm.responses = ["Your repair has been completed. Please check it using the steps below."]
    out, body = _send({"current_status": "PENDING_SIGNOFF", "case_id": "C-1",
                       "verification_result": {"protocol": PROTOCOL}})
    assert body.endswith(PROTOCOL)
    assert "Your repair has been completed." in body
    assert all(PROTOCOL not in m["content"] for call in fake_llm.calls for m in call
               if isinstance(m["content"], str))  # guide never passes through the LLM
    assert out["comms_result"]["message"] == body


def test_pending_signoff_protocol_survives_neutral_fallback(fake_llm):
    fake_llm.responses = ["We guarantee it.", "We promise it is permanent."]
    _, body = _send({"current_status": "PENDING_SIGNOFF", "case_id": "C-1",
                     "verification_result": {"protocol": PROTOCOL}})
    assert body == f"{NEUTRAL_TEMPLATES['PENDING_SIGNOFF']}\n\n{PROTOCOL}"


def test_buyer_confirmed_fixed_does_not_resend_guide(fake_llm):
    fake_llm.responses = ["Thank you for confirming the repair."]
    _, body = _send({"current_status": "PENDING_SIGNOFF", "case_id": "C-1", "verification_status": "verified",
                     "verification_result": {"protocol": PROTOCOL}})
    assert PROTOCOL not in body


def test_unsafe_llm_intro_replaced_by_template(fake_llm):
    fake_llm.responses = ["Your repair is done. Please open the breaker panel to check it."]
    _, body = _send({"current_status": "PENDING_SIGNOFF", "case_id": "C-1",
                     "verification_result": {"protocol": PROTOCOL}})
    assert "breaker" not in body
    assert body == f"{NEUTRAL_TEMPLATES['PENDING_SIGNOFF']}\n\n{PROTOCOL}"


def test_neutral_templates_have_no_unsafe_steps():
    from agents.simephony.guardrails import scan_for_unsafe_steps
    for status, text in NEUTRAL_TEMPLATES.items():
        assert scan_for_unsafe_steps(text) == [], status
