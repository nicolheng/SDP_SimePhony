# tests/test_guardrails.py
from agents.simephony.guardrails import scan_for_liability

def test_scan_detects_liability():
    # RED: This should be detected as dangerous
    text = "We admit that this was our fault and we apologize for the error."
    is_dangerous, offending = scan_for_liability(text)
    assert is_dangerous is True
    assert "admit" in offending
    assert "fault" in offending

def test_scan_detects_financials():
    # RED: This should be detected as dangerous
    text = "We will compensate you for the trouble with a partial refund."
    is_dangerous, offending = scan_for_liability(text)
    assert is_dangerous is True
    assert "compensate" in offending
    assert "refund" in offending

def test_scan_detects_guarantees():
    # RED: This should be detected as dangerous
    text = "I guarantee this is a permanent fix and will never happen again."
    is_dangerous, offending = scan_for_liability(text)
    assert is_dangerous is True
    assert "guarantee" in offending
    assert "permanent fix" in offending

def test_scan_allows_safe_text():
    # GREEN: This should be allowed
    text = "The technician has completed the repair and the area is now clean."
    is_dangerous, offending = scan_for_liability(text)
    assert is_dangerous is False
    assert len(offending) == 0

if __name__ == "__main__":
    try:
        test_scan_detects_liability()
        print("✅ test_scan_detects_liability passed!")
    except AssertionError as e:
        print(f"❌ test_scan_detects_liability failed: {e}")

    try:
        test_scan_detects_financials()
        print("✅ test_scan_detects_financials passed!")
    except AssertionError as e:
        print(f"❌ test_scan_detects_financials failed: {e}")

    try:
        test_scan_detects_guarantees()
        print("✅ test_scan_detects_guarantees passed!")
    except AssertionError as e:
        print(f"❌ test_scan_detects_guarantees failed: {e}")

    try:
        test_scan_allows_safe_text()
        print("✅ test_scan_allows_safe_text passed!")
    except AssertionError as e:
        print(f"❌ test_scan_allows_safe_text failed: {e}")
