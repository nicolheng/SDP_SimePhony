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
        "promise", "assuredly", "100% fixed",
        # promises that the defect will not return
        "will not come back", "won't come back", "won't happen again", "will not happen again",
        "will not recur", "permanent", "for good", "never leak",
    ]
}

def scan_for_liability(text: str) -> tuple[bool, list[str]]:
    """
    Scans text for forbidden terms.
    Returns (is_dangerous, offending_terms).
    """
    # normalise curly apostrophes so "won’t" matches "won't"
    text_lower = text.lower().replace("’", "'")
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
    # electrical supply / protection devices
    "breaker", "fuse", "mains", "isolator", "consumer unit", "faceplate",
    # tools
    "multimeter", "tester", "spanner", "wrench", "pliers", "knife",
    # working at height
    "lean out", "ledge", "parapet",
]


def _term_pattern(term: str) -> re.Pattern:
    # word-boundary match; allow simple plural / -ing / -ed endings on the last word
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?:s|es|ing|ed)?(?![A-Za-z0-9])", re.IGNORECASE)


_VERB_NEAR = r"\b(?:remove|open|take off|lift|unscrew)\w*\b[^.\n]{0,20}?\b"

_UNSAFE_PATTERNS = [(t, _term_pattern(t)) for t in UNSAFE_STEP_TERMS] + [
    # removing / opening a cover or a panel (a bare "door panel" or "glass panel" is fine)
    ("open cover", re.compile(_VERB_NEAR + r"covers?\b", re.IGNORECASE)),
    ("open panel", re.compile(_VERB_NEAR + r"panels?\b", re.IGNORECASE)),
    # going onto the roof
    ("go onto roof", re.compile(r"\b(?:go up|onto|on|up to)\b[^.\n]{0,30}?\broofs?\b", re.IGNORECASE)),
]


def scan_for_unsafe_steps(text: str) -> list[str]:
    """Returns unsafe-action terms (opening panels/covers, wiring, climbing, tools, height) found in text."""
    return [t for t, pat in _UNSAFE_PATTERNS if pat.search(text)]


_PLACEHOLDER = re.compile(r"\[[^\]]*\]")
_SIGN_OFF = re.compile(
    r"^\s*(best regards|kind regards|warm regards|regards|sincerely|yours sincerely|thanks|thank you|cheers)\s*[,.!]?\s*$",
    re.IGNORECASE,
)
_SIGN_OFF_WINDOW = 3  # a sign-off only counts within the last N non-empty lines


def strip_placeholders_and_signoff(text: str) -> str:
    """Drop [..] placeholder lines and a trailing sign-off block (sign-off line and everything after it).

    A sign-off line only counts if it is within the last 3 non-empty lines, so a bare
    "Thanks" in the middle of the body does not truncate the message. May return "".
    """
    lines = [ln for ln in text.splitlines() if not _PLACEHOLDER.search(ln)]
    non_empty = [i for i, ln in enumerate(lines) if ln.strip()]
    for i in non_empty[-_SIGN_OFF_WINDOW:]:
        if _SIGN_OFF.match(lines[i]):
            lines = lines[:i]
            break
    return "\n".join(lines).strip()
