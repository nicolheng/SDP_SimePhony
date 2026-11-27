"""kb.technician_guide: what the technician's job page reads (#128 card text, #134 repair guide)."""
from agents.simephony import kb


def _case(**extra):
    return {"case_id": "C-1", "category": "tiles", "inspection_outcome": None, "verdict_at": None, **extra}


VALID = {"inspection_outcome": "VALID_DEFECT", "verdict_at": "2026-11-27T02:00:00.000Z"}


def test_card_is_there_before_the_inspection_but_no_repair_guide():
    g = kb.technician_guide(_case())
    assert [i["ruleId"] for i in g["checkCard"]] == ["TOL-TILE-LIPPAGE", "TOL-TILE-HOLLOW"]
    assert g["repairMethod"] is None


def test_preliminary_ai_outcome_does_not_unlock_the_guide():
    # the intake writes inspection_outcome VALID_DEFECT as a guess, with no verdict yet
    assert kb.technician_guide(_case(inspection_outcome="VALID_DEFECT"))["repairMethod"] is None


def test_invalid_verdict_gets_no_guide():
    g = kb.technician_guide(_case(inspection_outcome="NOT_A_DEFECT", verdict_at="2026-11-27T02:00:00.000Z"))
    assert g["repairMethod"] is None


def test_valid_verdict_gets_the_guide_in_camel_case():
    m = kb.technician_guide(_case(**VALID))["repairMethod"]
    assert m["kind"] == "guide" and m["methodId"] == "REP-TILE-RELAY"
    assert m["steps"] and m["needsDryingOrCuring"] is True and m["dryingTime"]
    assert m["sources"][0]["authorityLabel"] == kb.AUTHORITY_LABELS[m["sources"][0]["authority"]]


def test_measured_rule_is_used_for_the_guide():
    m = kb.technician_guide(_case(**VALID, verdict_rule_id="TOL-TILE-HOLLOW"))["repairMethod"]
    assert m["matchedBy"] == "rule"


def test_removed_rule_falls_back_to_the_category():
    m = kb.technician_guide(_case(**VALID, verdict_rule_id="TOL-GONE"))["repairMethod"]
    assert m["methodId"] == "REP-TILE-RELAY" and m["matchedBy"] == "category"


def test_category_without_a_guide_gets_a_referral():
    m = kb.technician_guide(_case(**VALID, category="door_window"))["repairMethod"]
    assert m["kind"] == "referral" and m["sources"] == []


def test_electrical_guide_is_licensed_only():
    assert kb.technician_guide(_case(**VALID, category="electrical"))["repairMethod"]["licensedOnly"] is True
