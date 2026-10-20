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


# --- False alarms (PR A) ---

@pytest.mark.parametrize("text", [
    "The default settings were restored.",
    "We reached a compromise on the visit time.",
    "Please confirm your permanent address.",
    "The technician fixed the fault in the socket.",
    "An electrical fault was found in the socket.",
    "The error code on the aircon display has cleared.",
    "Thanks for the appealing photos of the repair.",
])
def test_harmless_words_do_not_count_as_liability(text):
    assert scan_for_liability(text) == (False, []), text


@pytest.mark.parametrize("text", [
    "It was our fault.", "We are at fault for the leak.", "This was our mistake.", "We made a mistake.",
    "This was an error on our part.", "This repair is permanent.", "The fix is permanent.",
    "We admit the pipe was faulty.", "We guarantee the leak is gone.",
    "Our team made a mistake.", "The technician made an error during the repair.",
])
def test_admissions_and_promises_still_flag(text):
    assert scan_for_liability(text)[0] is True, text


@pytest.mark.parametrize("text", [
    # safety warnings from rules.yaml verification_protocols
    "Do not open the distribution board or touch any wiring.",
    "Do not go onto the roof yourself.",
    "Check the breaker does not trip and there is no sparking, buzzing or burning smell.",
    "If you see sparks, stop, do not touch the wiring, and report it.",
    "Never use a ladder to check the ceiling.",
    "Avoid touching the wiring near the socket.",
    # descriptions of work, not instructions to the buyer
    "We will repair the leak on your roof soon.",
    "The fuse was replaced by our technician.",
    "Our technician checked the wiring behind the socket.",
])
def test_warnings_and_work_descriptions_do_not_flag(text):
    assert scan_for_unsafe_steps(text) == [], text


@pytest.mark.parametrize("text", [
    "Don't hesitate to open the panel and check.",
    "Don't forget to reset the breaker.",
    "Reset the breaker if the socket stops working.",
    "We recommend you open the breaker panel.",
    "We suggest opening the access panel to check.",
    "Please check the wiring behind the socket.",
    "You should turn off the mains first.",
    "Do not wait, climb onto the roof and check.",
    "Do not open the window; instead open the electrical panel.",
    "Our technician says you should unscrew the faceplate.",
])
def test_risky_instructions_still_flag(text):
    assert scan_for_unsafe_steps(text) != [], text


def test_every_rules_yaml_check_step_passes_both_scans():
    from agents.simephony.rules import load_rules
    for category, steps in load_rules()["verification_protocols"].items():
        for step in steps:
            assert scan_for_unsafe_steps(step) == [], (category, step)
            assert scan_for_liability(step) == (False, []), (category, step)


def test_fixed_closings_pass_liability_scan():
    from agents.simephony.comms import INVALID_CLOSING
    assert scan_for_liability(INVALID_CLOSING) == (False, [])
    footer = "If any check fails, do not sign off. Reopen the case within 30 days with a new photo."
    assert scan_for_liability(footer) == (False, [])


# --- PR B: sign-off stripper keeps real content ---
@pytest.mark.parametrize("text,kept", [
    ("Hello,\nThanks\nYour repair is booked.\nBye now.", "Your repair is booked."),
    ("Your visit is on Tuesday.\nThank you\nPlease keep the area clear.", "Please keep the area clear."),
])
def test_strip_keeps_sentences_after_a_thanks_line(text, kept):
    assert kept in strip_placeholders_and_signoff(text)


@pytest.mark.parametrize("text", [
    "Your repair is booked.\nBest regards,\nSimeProperty Team",
    "Your repair is booked.\n\nKind regards,\n[Your Name]\nProperty Management Team",
    "Your repair is booked.\nThanks,\nFarah Lee\nSDP Defect Team",
    "Your repair is booked.\nRegards,",
])
def test_strip_still_removes_real_signature_blocks(text):
    assert strip_placeholders_and_signoff(text) == "Your repair is booked."
