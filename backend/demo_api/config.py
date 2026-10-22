"""Business rules: rules.yaml first, plus the app settings that rules.yaml doesn't cover yet."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
_rules = yaml.safe_load((ROOT / "rules.yaml").read_text(encoding="utf-8")) or {}

# ---- from rules.yaml ----
CATEGORY_TO_SKILL: dict[str, list[str]] = _rules.get("category_to_skill", {})
GRACE_PERIOD_DAYS: int = int(_rules.get("grace_period_days", 30))
OCCURRENCE_THRESHOLD: int = int(_rules.get("escalation", {}).get("occurrence_threshold", 3))
STACK_CLUSTER_THRESHOLD: int = int(_rules.get("escalation", {}).get("stack_cluster_threshold", 3))
# rules.yaml safety.high_urgency.allow_auto_close (false = high-urgency cases are flagged, not auto-closed)
HIGH_URGENCY_AUTO_CLOSE: bool = bool(_rules.get("safety", {}).get("high_urgency", {}).get("allow_auto_close", False))

# ---- not in rules.yaml yet (agreed in the app; candidates to add there) ----
SIGNOFF_PERIOD_DAYS = 14
SIGNOFF_REMINDER_DAYS_BEFORE = 3

SLOT_TIMES = ["09:00", "11:00", "14:00", "16:00"]  # local (Malaysia) start times
SLOT_HOURS = 2
BOOKING_WINDOW_DAYS = 14

PROJECT_NAME = "Serenia City"
SDP_STAFF_NAME = "Farah Lee"
SDP_STAFF_TITLE = "SDP Defect Team"
SDP_STAFF_EMAIL = "sdp.staff@example.com"
APP_URL = "http://localhost:3000"

CATEGORY_LABEL = {
    "water_leak": "Water leak",
    "plumbing": "Plumbing",
    "drainage": "Drainage",
    "sanitary_fittings": "Sanitary fittings",
    "electrical": "Electrical",
    "wall_crack": "Wall crack",
    "structural_crack": "Structural crack",
    "tiles": "Tiles",
    "ceiling": "Ceiling",
    "door_window": "Door / window",
    "paint": "Paint",
    "other": "Other",
}

# Who repairs what, and roughly how long it takes. Specialised trades go to subcontractors.
REPAIR_PLAN = {
    "water_leak": {"trade": "Waterproofing / Plumbing", "by": "subcontractor", "skills": ["waterproofing"], "hours": 4},
    "structural_crack": {"trade": "Structural", "by": "subcontractor", "skills": ["structural"], "hours": 8},
    "tiles": {"trade": "Tiling", "by": "subcontractor", "skills": ["tiling"], "hours": 4},
    "plumbing": {"trade": "Plumbing", "by": "technician", "skills": ["plumbing"], "hours": 2},
    "drainage": {"trade": "Plumbing", "by": "technician", "skills": ["plumbing"], "hours": 1.5},
    "sanitary_fittings": {"trade": "Plumbing", "by": "technician", "skills": ["plumbing"], "hours": 1.5},
    "electrical": {"trade": "Electrical", "by": "technician", "skills": ["electrical"], "hours": 1.5},
    "wall_crack": {"trade": "Civil / Painting", "by": "technician", "skills": ["civil", "painting"], "hours": 2},
    "ceiling": {"trade": "Ceiling / Civil", "by": "technician", "skills": ["civil"], "hours": 3},
    "door_window": {"trade": "Carpentry / Glazing", "by": "technician", "skills": ["carpentry", "glazing"], "hours": 2},
    "paint": {"trade": "Painting", "by": "technician", "skills": ["painting"], "hours": 2},
    "other": {"trade": "General", "by": "technician", "skills": ["general"], "hours": 1},
}

# Demo subcontractors, added to the technicians table by migrate.py (seed.db has in-house technicians only).
SUBCONTRACTORS = [
    {"technician_id": "SC-01", "name": "Kamal Yusof", "company": "Alpha Waterproofing Sdn Bhd", "email": "kamal.subcon@example.com", "skills": ["waterproofing", "plumbing"], "blocks": ["A", "B", "C"]},
    {"technician_id": "SC-02", "name": "Tan Mei Ling", "company": "Beta Structural Works Sdn Bhd", "email": "meiling.subcon@example.com", "skills": ["structural", "civil"], "blocks": ["A", "B", "C"]},
    {"technician_id": "SC-03", "name": "Arjun Pillai", "company": "Gamma Tiling & Flooring Sdn Bhd", "email": "arjun.subcon@example.com", "skills": ["tiling", "flooring"], "blocks": ["A", "B", "C"]},
    {"technician_id": "SC-04", "name": "Ong Chee Keong", "company": "Delta Electrical Services Sdn Bhd", "email": "cheekeong.subcon@example.com", "skills": ["electrical"], "blocks": ["A", "B", "C"]},
]


def skills_for(category: str) -> list[str]:
    return CATEGORY_TO_SKILL.get(category) or ["general"]
