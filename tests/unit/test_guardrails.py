
import pytest
from agents.simephony.guardrails import scan_for_liability

def test_liability_detection():
    dangerous_texts = [
        "I am sorry we messed up the plumbing.",
        "It was our fault that the leak occurred.",
        "We apologize for the negligence of our staff.",
        "I promise we will pay for your new carpet.",
        "This is a 100