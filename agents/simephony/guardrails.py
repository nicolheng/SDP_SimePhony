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
