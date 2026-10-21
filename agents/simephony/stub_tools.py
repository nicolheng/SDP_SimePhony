"""Stub tools returning fake data for unit A-12-08. Swap for McpToolset once P3/P4 ship real tools."""


def get_unit(unit_id: str) -> dict:
    parts = unit_id.split("-")
    block = parts[0] if parts else ""
    try:
        floor = int(parts[1])
    except (IndexError, ValueError):
        floor = None
    stack = parts[2] if len(parts) > 2 else ""
    return {
        "unit_id": unit_id, "block": block, "floor": floor, "stack": stack,
        "contractor": "Contractor X",
        "buyer": {"buyer_id": "B-0001", "email": "buyer@example.com"},
    }


def find_similar_cases(unit_id: str, category: str) -> dict:
    """
    MOCK DATABASE QUERY. 
    """
    # NUCLEAR OPTION: Just check the unit ID for the planted story
    if unit_id == "A-12-08":
        return {
            "past_case_count": 2,
            "cases": [
                {"case_id": "H-0101", "unit_id": "A-12-08", "category": "water_leak", "reason": "same unit"},
                {"case_id": "H-0144", "unit_id": "A-12-08", "category": "water_leak", "reason": "same unit"},
            ],
        }
    
    # Clean unit: 0 past cases
    return {
        "past_case_count": 0,
        "cases": []
    }

def send_email(to: str, subject: str, body: str, case_id: str = "UNKNOWN") -> dict:
    """
    STUB: Simulates sending an email. 
    P3 will replace this with the real Gmail SMTP logic later.
    """
    print(f"📧 [STUB EMAIL] To: {to}")
    print(f"📧 [STUB EMAIL] Subject: {subject}")
    print(f"📧 [STUB EMAIL] Body preview: {body[:100]}...")
    return {"status": "stub_sent"}

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
            {"slot_id": "S-1", "technician_id": f"{prefix}-1", "start": "2026-10-22T14:00:00+08:00", "block": "B"},
            {"slot_id": "S-2", "technician_id": f"{prefix}-2", "start": "2026-10-23T10:00:00+08:00", "block": "A"},
            {"slot_id": "S-3", "technician_id": f"{prefix}-3", "start": "2026-10-24T11:00:00+08:00", "block": "A"},
            {"slot_id": "S-4", "technician_id": f"{prefix}-4", "start": "2026-10-25T09:00:00+08:00", "block": "C"},
        ]
    }


def assign_technician(case_id: str, technician_id: str, slot_id: str, reason: str) -> dict:
    # Simulate a rejection if the technician is "T-PLUMB-2" (just for testing the loop)
    if technician_id == "T-PLUMB-2":
        return {"ok": False, "reason": "Technician rejected the visit."}
    return {"ok": True}

# Create a new function that checks if a case is within the 30-day grace period
def is_within_grace_period(case_id: str) -> bool:
    # For the purpose of this stub, we will assume that all cases are within the grace period
    return True