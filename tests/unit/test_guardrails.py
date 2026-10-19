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
