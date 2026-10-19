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
    "panel", "wiring", "wire", "ladder", "climb", "screwdriver", "tool",
    "breaker box", "db box", "remove the cover", "dismantle", "unscrew",
]


def scan_for_unsafe_steps(text: str) -> list[str]:
    """Returns unsafe-action terms (opening panels, wiring, climbing, tools) found in text."""
    text_lower = text.lower()
    return [t for t in UNSAFE_STEP_TERMS if t in text_lower]
