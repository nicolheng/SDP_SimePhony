import re
# agents/simephony/guardrails.py

# Terms that are strictly forbidden in resident-facing communications.
# Categorized by the risk they represent.
FORBIDDEN_TERMS = {
    "liability": [
        "admit", "negligence",
        "sorry we messed up", "our failure", "apologize for the error"
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
        "will not recur", "for good", "never leak",
    ],
    # admissions of responsibility / offers to pay / offers of a dispute process (INVALID is final)
    "responsibility": [
        "will pay", "pay for", "cover the cost", "no cost to you", "at no charge",
        "apologize", "apologise", "we are sorry", "we're sorry", "responsibility", "liable", "liability",
        "oversight",
    ],
    "dispute": ["appeal", "dispute"],

}

# Words that are normal defect vocabulary on their own ("an electrical fault", "error code",
# "permanent address") only count in admission / promise phrasing.
_LIABILITY_PHRASES = [
    ("fault", r"\b(?:our|my|the developer'?s|the builder'?s|the contractor'?s)\s+fault\b"
              r"|\bat\s+fault\b|\bfault\s+(?:is|was|lies)\s+(?:ours|with\s+us)\b"),
    # "made a mistake / an error" by anyone (we, our team, the technician) reads as an admission
    ("mistake", r"\b(?:our|my)\s+mistakes?\b|\bmade\s+(?:a\s+|an?\s+\w+\s+)?mistakes?\b"),
    ("error", r"\b(?:our|my)\s+errors?\b|\berrors?\s+on\s+our\s+part\b|\bmade\s+(?:an?\s+(?:\w+\s+)?)?errors?\b"),
    ("permanent", r"\bpermanent(?:ly)?\b(?!\s+(?:address|resident|residence|residency|staff|employee|record))"),
]


def _word(term: str) -> re.Pattern:
    # whole words only ("default" is not "fault", "compromise" is not "promise"); simple plural/past endings
    return re.compile(r"(?<![a-z0-9])" + re.escape(term) + r"(?:s|es|d|ed)?(?![a-z0-9])")


_LIABILITY_PATTERNS = (
    [(term, _word(term)) for terms in FORBIDDEN_TERMS.values() for term in terms]
    + [(label, re.compile(p)) for label, p in _LIABILITY_PHRASES]
)


def scan_for_liability(text: str) -> tuple[bool, list[str]]:
    """
    Scans text for forbidden terms.
    Returns (is_dangerous, offending_terms).
    """
    # normalise curly apostrophes so "won’t" matches "won't"
    text_lower = text.lower().replace("’", "'")
    offending = [term for term, pat in _LIABILITY_PATTERNS if pat.search(text_lower)]
    return (len(offending) > 0, offending)


UNSAFE_STEP_TERMS = [
    "electrical panel", "breaker panel", "db panel", "access panel", "switch panel",
    "distribution board", "wiring", "wire", "ladder", "climb", "screwdriver", "tool",
    "breaker box", "db box", "fuse box", "fuse board", "remove the cover", "open the cover", "dismantle", "unscrew",
    "chair", "stool", "step stool", "stand on", "hammer", "drill", "hatch",
    "consumer unit", "faceplate",
    # tools
    "multimeter", "tester", "spanner", "wrench", "pliers", "knife",
    # working at height
    "lean out", "ledge", "parapet",
]

# Supply / protection devices are only risky when the buyer operates them: "reset the breaker" is,
# "check the breaker does not trip" is not.
UNSAFE_WHEN_OPERATED = ["breaker", "fuse", "mains", "isolator"]
_OPERATE = re.compile(r"\b(?:reset|switch|flip|turn|toggl|replac|remov|touch|pull|push|open|operat)\w*\b", re.IGNORECASE)


def _term_pattern(term: str) -> re.Pattern:
    # word-boundary match; allow simple plural / -ing / -ed endings on the last word
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?:s|es|ing|ed)?(?![A-Za-z0-9])", re.IGNORECASE)


_VERB_NEAR = r"\b(?:remove|open|take off|lift|unscrew)\w*\b[^.\n]{0,20}?\b"
_ROOF = r"(?:the\s+|your\s+|a\s+)?roofs?\b"

_UNSAFE_PATTERNS = [(t, _term_pattern(t)) for t in UNSAFE_STEP_TERMS] + [
    # removing / opening a cover or a panel (a bare "door panel" or "glass panel" is fine)
    ("open cover", re.compile(_VERB_NEAR + r"covers?\b", re.IGNORECASE)),
    ("open panel", re.compile(_VERB_NEAR + r"panels?\b", re.IGNORECASE)),
    # someone going onto the roof ("the leak on your roof" is not)
    ("go onto roof", re.compile(
        r"\b(?:go|going|get|getting|step|stepping|walk|walking|stand|standing)\b(?:\s+(?:up|out))?"
        r"\s+(?:on|onto|on\s+to|up\s+to|to)\s+" + _ROOF + r"|\bonto\s+" + _ROOF, re.IGNORECASE)),
]
_OPERATED_PATTERNS = [(t, _term_pattern(t)) for t in UNSAFE_WHEN_OPERATED]

# A risky word is judged per clause, because one sentence can hold a warning and an instruction.
_CLAUSE_SPLIT = re.compile(r"[.!?;,\n]|\b(?:and|but|then|instead)\b", re.IGNORECASE)
# "Do not / never / avoid ..." is a warning. "Don't hesitate / forget / wait to ..." is not.
_WARNING = re.compile(
    r"^\s*(?:please\s+)?(?:do\s+not|don't|dont|never|avoid)\b"
    r"(?!\s+(?:hesitate|forget|wait|delay|be\s+afraid|need))", re.IGNORECASE)
# Work done or planned by the technician / us, not something the buyer is told to do ...
_WORK_DONE = re.compile(
    r"\b(?:our|the)\s+(?:technicians?|team|contractors?|subcontractors?|staff|workers?)\b"
    r"|\bwe(?:'ll|'ve|'re)?\b|\b(?:was|were|has\s+been|have\s+been|had\s+been|is\s+being)\b", re.IGNORECASE)
# ... unless it is aimed at the buyer anyway ("we recommend you ...", "please ...").
_AIMED_AT_BUYER = re.compile(
    r"\byou\b|\bplease\b|\bshould\b|\bmust\b|\bneeds?\s+to\b|\brecommend\w*|\bsuggest\w*|\badvis\w*|\btry\b",
    re.IGNORECASE)
_IMPERATIVE_START = re.compile(
    r"^\s*(?:check|look|open|remove|touch|use|reset|turn|switch|unscrew|take|lift|climb|go|stand|lean|cut|test"
    r"|inspect|pull|push|flip|make\s+sure|ensure)\b", re.IGNORECASE)


def _clause_hits(clause: str) -> list[str]:
    hits = [t for t, pat in _UNSAFE_PATTERNS if pat.search(clause)]
    if _OPERATE.search(clause):
        hits += [t for t, pat in _OPERATED_PATTERNS if pat.search(clause)]
    return hits


def _is_allowed(clause: str) -> bool:
    if _WARNING.search(clause):
        return True
    return (bool(_WORK_DONE.search(clause)) and not _AIMED_AT_BUYER.search(clause)
            and not _IMPERATIVE_START.search(clause))


def scan_for_unsafe_steps(text: str) -> list[str]:
    """Returns unsafe-action terms (opening panels/covers, wiring, climbing, tools, height) that the
    text tells the buyer to do. Warnings ("Do not touch any wiring") and descriptions of the
    technician's work ("The fuse was replaced by our technician") are not flagged."""
    found: list[str] = []
    for clause in _CLAUSE_SPLIT.split(text.replace("’", "'")):
        hits = _clause_hits(clause)
        if hits and not _is_allowed(clause):
            found += [h for h in hits if h not in found]
    return found


_PLACEHOLDER = re.compile(r"\[[^\]]*\]")
_SIGN_OFF = re.compile(
    r"^\s*(best regards|kind regards|warm regards|regards|sincerely|yours sincerely|thanks|thank you|cheers)\s*[,.!]?\s*$",
    re.IGNORECASE,
)
_SIGN_OFF_WINDOW = 3  # a sign-off only counts within the last N non-empty lines


def _is_signature_line(line: str) -> bool:
    """A name / team / title line ("Farah Lee", "SDP Defect Team"): short and not a sentence."""
    s = line.strip()
    return len(s.split()) <= 6 and not s.endswith((".", "?", "!"))


def strip_placeholders_and_signoff(text: str) -> str:
    """Drop [..] placeholder lines and a trailing sign-off block (sign-off line and everything after it).

    A sign-off line only counts if it is within the last 3 non-empty lines and everything after
    it looks like a signature (names, team, title). A "Thanks" followed by real sentences
    ("Thanks\\nYour repair is booked.") is part of the message and kept. May return "".
    """
    lines = [ln for ln in text.splitlines() if not _PLACEHOLDER.search(ln)]
    non_empty = [i for i, ln in enumerate(lines) if ln.strip()]
    for i in non_empty[-_SIGN_OFF_WINDOW:]:
        after = [ln for ln in lines[i + 1:] if ln.strip()]
        if _SIGN_OFF.match(lines[i]) and all(_is_signature_line(ln) for ln in after):
            lines = lines[:i]
            break
    return "\n".join(lines).strip()
