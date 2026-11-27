"""kb.repair_method_for: the repair guide for a defect (#125). Uses the real kb/ files and rules.yaml."""
import pytest

from agents.simephony import kb
from agents.simephony.rules import load_rules

DEMO_CATEGORIES = list(load_rules()["repair_plan"])  # every category the app (and the demo data) uses


@pytest.mark.parametrize("category", DEMO_CATEGORIES)
def test_every_known_category_gets_something(category):
    m = kb.repair_method_for(category)
    assert m is not None
    assert m["kind"] in {"guide", "referral"}
    assert m["title"] and m["steps"]


@pytest.mark.parametrize("category", ["nonsense", "", None])
def test_unknown_category_gets_nothing(category):
    assert kb.repair_method_for(category) is None


@pytest.mark.parametrize("category, method_id", [
    ("tiles", "REP-TILE-RELAY"),
    ("water_leak", "REP-WET-AREA-LEAK"),
    ("wall_crack", "REP-CRACK-FILL"),
    ("paint", "REP-REPAINT"),
    ("electrical", "REP-ELECTRICAL"),
])
def test_category_with_one_method_gets_that_guide(category, method_id):
    m = kb.repair_method_for(category)
    assert (m["kind"], m["method_id"], m["matched_by"]) == ("guide", method_id, "category")
    assert m["sources"] and all(s["title"] and s["authority"] for s in m["sources"])


def test_ceiling_fits_two_methods_so_it_is_referred_not_guessed():
    m = kb.repair_method_for("ceiling")  # crack filling and spalling both list it; demo ceilings are sagging
    assert m["kind"] == "referral"
    assert m["specialist_trade"] == load_rules()["repair_plan"]["ceiling"]["trade"]
    assert m["sources"] == [] and m["needs_drying_or_curing"] is False


def test_structural_defect_always_goes_to_an_engineer():
    m = kb.repair_method_for("structural_crack")
    assert m["kind"] == "referral"
    assert m["specialist_trade"] == "structural engineer"


def test_rule_beats_category():
    m = kb.repair_method_for("tiles", rule_id="TOL-TILE-HOLLOW")
    assert (m["method_id"], m["matched_by"]) == ("REP-TILE-RELAY", "rule")


def test_rule_without_a_method_falls_back_to_the_category():
    m = kb.repair_method_for("door_window", rule_id="TOL-DOOR-GAP")  # repair_method_id: null -> refer to the trade
    assert m["kind"] == "referral"


def test_electrical_is_licensed_only():
    assert kb.repair_method_for("electrical")["licensed_only"] is True


def test_unknown_rule_raises():
    with pytest.raises(ValueError):
        kb.repair_method_for("tiles", rule_id="TOL-NOT-A-RULE")
