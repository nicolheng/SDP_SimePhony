"""kb/verify_methods.yaml: how to verify a defect type that has no limit rule (Suggested Verify Method)."""
from agents.simephony import kb
from agents.simephony.rules import load_rules

FRONTEND_CATEGORIES = {"water_leak", "plumbing", "drainage", "sanitary_fittings", "electrical", "wall_crack",
                       "structural_crack", "tiles", "ceiling", "door_window", "paint", "other"}


def test_every_app_defect_type_has_a_rule_or_a_verify_method():
    loaded = kb.get()
    ruled = {r["category"] for r in loaded["rules"].values()}
    verified = {v["category"] for v in loaded["verify"].values()}
    assert FRONTEND_CATEGORIES - ruled - verified == set()


def test_verify_methods_are_only_for_types_without_a_rule():
    loaded = kb.get()
    ruled = {r["category"] for r in loaded["rules"].values()}
    assert not ruled & {v["category"] for v in loaded["verify"].values()}


def test_verify_method_categories_are_known():
    categories = set(load_rules()["category_to_skill"])
    assert all(v["category"] in categories for v in kb.get()["verify"].values())


def test_public_view_lists_verify_methods_with_source_titles():
    paint = next(v for v in kb.public_view()["verifyMethods"] if v["category"] == "paint")
    assert paint["steps"] and paint["defectIf"] and paint["tool"]
    assert paint["sources"] and all(isinstance(s, str) for s in paint["sources"])
