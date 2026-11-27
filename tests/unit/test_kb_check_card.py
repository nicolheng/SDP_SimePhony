"""kb.check_card: the "what to check" card text, from fixed templates (#128). Uses the real kb/ files."""
from agents.simephony import kb


def _text(category):
    return [" ".join(item["lines"]) for item in kb.check_card(category)]


def test_one_item_per_rule_for_the_category():
    items = kb.check_card("tiles")
    assert [i["rule_id"] for i in items] == ["TOL-TILE-LIPPAGE", "TOL-TILE-HOLLOW"]
    assert all(i["condition"] and i["lines"] for i in items)


def test_measure_rule_sentences_use_the_rules_own_numbers():
    lippage = _text("tiles")[0]
    assert "Likely a real defect if more than 1 mm." in lippage
    assert "Straightedge" in lippage


def test_length_is_included_when_the_rule_has_one():
    assert "more than 3 mm over 1.2 m." in _text("flooring")[0]


def test_escalation_line_for_wide_cracks():
    assert "Over 5 mm: an engineer must assess it." in _text("wall_crack")[0]


def test_yes_no_rule_asks_the_question():
    hollow = _text("tiles")[1]
    assert hollow.startswith("Check: Does the tile sound hollow when tapped?")
    assert "If yes, it is likely a real defect." in hollow


def test_every_item_names_its_source_and_how_official_it_is():
    for category in ("tiles", "wall_crack", "water_leak", "drainage", "door_window", "flooring"):
        for item in kb.check_card(category):
            last = item["lines"][-1]
            assert last.startswith("Source: ")
            assert any(label in last for label in kb.AUTHORITY_LABELS.values())


def test_overseas_source_is_labelled_as_not_malaysian():
    assert "international reference, not a Malaysian contractual standard" in _text("wall_crack")[0]


def test_photo_only_rule_has_no_photo_warning():
    leak = _text("water_leak")[0]  # photo_can_decide: true
    assert "A photo can't decide" not in leak


def test_category_without_rules_gets_an_empty_card():
    assert kb.check_card("ceiling") == []
    assert kb.check_card("nonsense") == []
