"""Business rules from rules.yaml (the single source: the web app gets them from GET /api/rules), plus app settings."""
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
RULES_PATH = ROOT / "rules.yaml"
RULES: dict = yaml.safe_load(RULES_PATH.read_text(encoding="utf-8")) or {}
RULES_SNAPSHOT_PATH = ROOT / "frontend" / "src" / "lib" / "rules.snapshot.json"

# ---- from rules.yaml (no defaults here: a missing rule should fail loudly, not silently differ) ----
CATEGORY_TO_SKILL: dict[str, list[str]] = RULES["category_to_skill"]
CATEGORY_LABEL: dict[str, str] = RULES["category_labels"]
# Who repairs what, and roughly how long it takes. Specialised trades go to subcontractors.
REPAIR_PLAN: dict[str, dict] = RULES["repair_plan"]
GRACE_PERIOD_DAYS: int = int(RULES["grace_period_days"])
SIGNOFF_PERIOD_DAYS: int = int(RULES["signoff_period_days"])
SIGNOFF_REMINDER_DAYS_BEFORE: int = int(RULES["signoff_reminder_days_before"])
OCCURRENCE_THRESHOLD: int = int(RULES["escalation"]["occurrence_threshold"])
STACK_CLUSTER_THRESHOLD: int = int(RULES["escalation"]["stack_cluster_threshold"])
# rules.yaml safety.high_urgency.allow_auto_close (false = high-urgency cases are flagged, not auto-closed)
HIGH_URGENCY_AUTO_CLOSE: bool = bool(RULES["safety"]["high_urgency"]["allow_auto_close"])

SLOT_TIMES: list[str] = RULES["scheduling"]["slot_times"]
SLOT_HOURS: int = int(RULES["scheduling"]["slot_hours"])
BOOKING_WINDOW_DAYS: int = int(RULES["scheduling"]["booking_window_days"])

# ---- app settings (not business rules) ----
PROJECT_NAME = "Residensi Harmoni"
SDP_STAFF_NAME = "Farah Lee"
SDP_STAFF_TITLE = "SDP Defect Team"
SDP_STAFF_EMAIL = "sdp.staff@example.com"
APP_URL = "http://localhost:3000"

# Demo subcontractors, added to the technicians table by migrate.py (seed.db has in-house technicians only).
SUBCONTRACTORS = [
    {"technician_id": "SC-01", "name": "Kamal Yusof", "company": "Alpha Waterproofing Sdn Bhd", "email": "kamal.subcon@example.com", "skills": ["waterproofing", "plumbing"], "blocks": ["A", "B", "C"]},
    {"technician_id": "SC-02", "name": "Tan Mei Ling", "company": "Beta Structural Works Sdn Bhd", "email": "meiling.subcon@example.com", "skills": ["structural", "civil"], "blocks": ["A", "B", "C"]},
    {"technician_id": "SC-03", "name": "Arjun Pillai", "company": "Gamma Tiling & Flooring Sdn Bhd", "email": "arjun.subcon@example.com", "skills": ["tiling", "flooring"], "blocks": ["A", "B", "C"]},
    {"technician_id": "SC-04", "name": "Ong Chee Keong", "company": "Delta Electrical Services Sdn Bhd", "email": "cheekeong.subcon@example.com", "skills": ["electrical"], "blocks": ["A", "B", "C"]},
]


def skills_for(category: str) -> list[str]:
    return CATEGORY_TO_SKILL.get(category) or ["general"]


def public_rules() -> dict:
    """The rules the web app uses, served by GET /api/rules (camelCase, like the rest of the API)."""
    return {
        "gracePeriodDays": GRACE_PERIOD_DAYS,
        "signoffPeriodDays": SIGNOFF_PERIOD_DAYS,
        "signoffReminderDaysBefore": SIGNOFF_REMINDER_DAYS_BEFORE,
        "occurrenceThreshold": OCCURRENCE_THRESHOLD,
        "stackClusterThreshold": STACK_CLUSTER_THRESHOLD,
        "highUrgencyAutoClose": HIGH_URGENCY_AUTO_CLOSE,
        "categoryToSkill": CATEGORY_TO_SKILL,
        "categoryLabel": CATEGORY_LABEL,
        "repairPlan": REPAIR_PLAN,
        "slotTimes": SLOT_TIMES,
        "slotHours": SLOT_HOURS,
        "bookingWindowDays": BOOKING_WINDOW_DAYS,
        "urgency": RULES.get("urgency", {}),
        "verificationProtocols": RULES.get("verification_protocols", {}),
    }


def rules_snapshot_text() -> str:
    return json.dumps(public_rules(), indent=2, ensure_ascii=False) + "\n"


def write_rules_snapshot() -> bool:
    """Refresh the web app's offline copy of the rules (called on backend start). Returns True if the file changed."""
    if not RULES_SNAPSHOT_PATH.parent.is_dir():
        return False  # backend running without the frontend folder
    text = rules_snapshot_text()
    if RULES_SNAPSHOT_PATH.exists() and RULES_SNAPSHOT_PATH.read_text(encoding="utf-8") == text:
        return False
    RULES_SNAPSHOT_PATH.write_text(text, encoding="utf-8", newline="\n")
    return True
