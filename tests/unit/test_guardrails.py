from agents.simephony.guardrails import scan_for_liability


def test_liability_detection():
    for text in ["I am sorry we messed up the plumbing.", "It was our fault that the leak occurred.",
                 "We apologize for the negligence of our staff.", "I promise we will pay for your new carpet.",
                 "This is a 100% fixed, permanent fix.", "We will refund you."]:
        assert scan_for_liability(text)[0] is True, text


def test_safe_text_passes():
    for text in ["Our technician has inspected the area.", "Your repair visit is booked for 22 Oct."]:
        assert scan_for_liability(text) == (False, [])


def test_unsafe_steps_word_boundaries():
    from agents.simephony.guardrails import scan_for_unsafe_steps
    assert scan_for_unsafe_steps("wireless doorbell") == []
    assert scan_for_unsafe_steps("toolbar") == []
    assert scan_for_unsafe_steps("door panel aligned") == []
    assert scan_for_unsafe_steps("stand on a chair") != []
    assert scan_for_unsafe_steps("open the breaker panel") != []
    assert scan_for_unsafe_steps("Check the wiring") != []


# --- Final review fix wave ---
import pytest

from agents.simephony.guardrails import scan_for_unsafe_steps, strip_placeholders_and_signoff


@pytest.mark.parametrize("text", [
    "Reset the circuit breaker and check the socket works.",
    "Remove the socket cover and look inside.",
    "Check the fuse box.",
    "Use a multimeter to test the socket.",
    "Take off the faceplate.",
    "Turn off the mains isolator.",
    "Use a spanner to tighten the joint.",
    "Open the panel under the sink.",
    "Lean out of the window and check the outer seal.",
    "Go up to the roof and check the membrane.",
])
def test_unsafe_phrasings_flag(text):
    assert scan_for_unsafe_steps(text) != [], text


@pytest.mark.parametrize("text", [
    "Check the consumer unit.", "Use a voltage tester.", "Use a wrench.", "Use pliers.",
    "Cut it with a knife.", "Stand by the ledge.", "Look over the parapet.",
    "Lift the cover off the trap.", "Unscrew the access cover.", "Climb onto the roof.",
])
def test_other_new_unsafe_terms_flag(text):
    assert scan_for_unsafe_steps(text) != [], text


@pytest.mark.parametrize("text", [
    "Check the door panel is aligned.", "door panel aligned", "Look at the glass panel for cracks.",
    "Check the wireless doorbell rings.", "wireless doorbell", "toolbar",
    "Look at the ceiling below the repaired area for new stains or damp.",
])
def test_safe_phrasings_do_not_flag(text):
    assert scan_for_unsafe_steps(text) == [], text


def test_strip_signoff_and_placeholders():
    text = "Look at the ceiling patch.\nBest regards,\n[Your Name]\nSimeProperty Team"
    assert strip_placeholders_and_signoff(text) == "Look at the ceiling patch."


def test_strip_keeps_mid_body_thanks():
    text = "Hello,\nThanks\nYour repair is booked.\nThe technician will arrive on Tuesday.\nPlease keep the area clear.\nCall us with questions."
    assert strip_placeholders_and_signoff(text) == text


def test_strip_returns_empty_when_nothing_left():
    assert strip_placeholders_and_signoff("[Your Name]\nRegards,") == ""


@pytest.mark.parametrize("text", [
    "The leak is now fully resolved and will not come back.",
    "This repair is permanent.",
    "It won't come back.", "This won't happen again.", "It will not happen again.",
    "The defect will not recur.", "Fixed for good.", "It will never leak again.",
])
def test_recurrence_promises_flag(text):
    assert scan_for_liability(text)[0] is True, text


def test_fixed_closings_pass_liability_scan():
    from agents.simephony.comms import INVALID_CLOSING
    assert scan_for_liability(INVALID_CLOSING) == (False, [])
    footer = "If any check fails, do not sign off. Reopen the case within 30 days with a new photo."
    assert scan_for_liability(footer) == (False, [])
