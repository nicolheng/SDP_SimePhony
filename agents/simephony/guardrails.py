import re
# agents/simephony/guardrails.py

# Terms that are strictly forbidden in resident-facing communications.
# Categorized by the risk they represent.
FORBIDDEN_TERMS = {
    "liability": [
        "admit", "fault", "mistake", "negligence", "error", 
        "sorry we messed up", "our failure", "my mistake", "apologize for the error"
    ],
    "financial": [
        "refund", "compensate", "compensation", "discount", 
        "payment", "reimburse", "free of charge", "money back"
    ],
    "guarantee": [
        "guarantee", "permanent fix", "will never happen again", 
        "promise", "assuredly", "100% fixed"
    ]
}

def scan_for_liability(text: str) -> tuple[bool, list[str]]:
    """
    Scans text for forbidden terms.
    Returns (is_dangerous, offending_terms).
    """
    text_lower = text.lower()
    offending = []
    
    for category, terms in FORBIDDEN_TERMS.items():
        for term in terms:
            if term in text_lower:
                offending.append(term)
    
    return (len(offending) > 0, offending)


UNSAFE_STEP_TERMS = [
    "electrical panel", "breaker panel", "db panel", "access panel", "switch panel",
    "distribution board", "wiring", "wire", "ladder", "climb", "screwdriver", "tool",
    "breaker box", "db box", "remove the cover", "open the cover", "dismantle", "unscrew",
    "chair", "stool", "step stool", "stand on", "hammer", "drill", "hatch",
]


def _term_pattern(term: str) -> re.Pattern:
    # word-boundary match; allow simple plural / -ing / -ed endings on the last word
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?:s|es|ing|ed)?(?![A-Za-z0-9])", re.IGNORECASE)


_UNSAFE_PATTERNS = [(t, _term_pattern(t)) for t in UNSAFE_STEP_TERMS]


def scan_for_unsafe_steps(text: str) -> list[str]:
    """Returns unsafe-action terms (opening panels, wiring, climbing, tools) found in text."""
    return [t for t, pat in _UNSAFE_PATTERNS if pat.search(text)]
