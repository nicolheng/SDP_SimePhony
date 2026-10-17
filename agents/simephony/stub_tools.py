"""Stub tools returning fake data for unit A-12-08. Swap for McpToolset once P3/P4 ship real tools."""


def get_unit(unit_id: str) -> dict:
    return {"unit_id": unit_id, "block": "A", "floor": 12, "stack": "08", "contractor": "Contractor X"}


def find_similar_cases(unit_id: str, category: str) -> dict:
    return {
        "recurrence_count": 2,
        "cases": [
            {"case_id": "H-0101", "unit_id": "A-12-08", "category": "water_leak", "reason": "same unit"},
            {"case_id": "H-0144", "unit_id": "A-12-08", "category": "water_leak", "reason": "same unit"},
            {"case_id": "H-0090", "unit_id": "A-11-08", "category": "water_leak", "reason": "same stack"},
        ],
    }


def get_available_slots(skill: str, block: str) -> dict:
    # Simple mapping for stubs
    tech_map = {
        "plumbing": "T-PLUMB",
        "waterproofing": "T-WATER",
        "electrical": "T-ELEC",
        "civil": "T-CIVIL",
        "tiling": "T-TILE",
        "flooring": "T-FLOOR",
        "roofing": "T-ROOF",
        "carpentry": "T-CARP",
        "glazing": "T-GLAZE",
        "painting": "T-PAINT",
        "general": "T-GEN"
    }
    prefix = tech_map.get(skill, "T-GEN")
    return {
        "slots": [
            {"slot_id": "S-1", "technician_id": f"{prefix}-1", "start": "2026-10-22T14:00:00+08:00"},
            {"slot_id": "S-2", "technician_id": f"{prefix}-2", "start": "2026-10-23T10:00:00+08:00"},
        ]
    }


def assign_technician(case_id: str, technician_id: str, slot_id: str, reason: str) -> dict:
    return {"ok": True}

def send_email(to: str, subject: str, body: str, case_id: str) -> dict:
    print(f"📧 [STUB] Sending email to {to} | Subject: {subject} | Case: {case_id}")
    return {"status": "sent"}

