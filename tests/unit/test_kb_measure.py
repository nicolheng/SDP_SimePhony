"""kb.check_measurement: compare a technician's reading with a limit rule (#124). Uses the real kb/ files."""
import pytest

from agents.simephony import kb


# Tile lippage limit is 1.0 mm (a defect when the step is more than 1 mm)
@pytest.mark.parametrize("reading, answer", [
    (0.5, kb.WITHIN_LIMIT),    # below
    (1.0, kb.WITHIN_LIMIT),    # exactly at the limit is still within
    (2, kb.LIKELY_DEFECT),     # above (the issue's example: 2 mm, limit 1 mm); an int works too
    (None, kb.MEASURE_FIRST),  # nothing entered yet
])
def test_tile_lippage(reading, answer):
    r = kb.check_measurement("TOL-TILE-LIPPAGE", reading)
    assert r["answer"] == answer
    assert r["limit"] == 1.0 and r["unit"] == "mm"


def test_result_has_what_the_banner_needs():
    r = kb.check_measurement("TOL-TILE-LIPPAGE", 2)
    assert r["reading"] == 2
    assert r["source"]["id"] == "CIS7-2021"
    assert r["source"]["authority"] == "industry_standard"
    assert r["source"]["title"]


@pytest.mark.parametrize("reading, answer", [(True, kb.LIKELY_DEFECT), (False, kb.WITHIN_LIMIT),
                                             (None, kb.MEASURE_FIRST)])
def test_yes_no_rule(reading, answer):
    r = kb.check_measurement("TOL-TILE-HOLLOW", reading)
    assert r["answer"] == answer
    assert r["limit"] is None


@pytest.mark.parametrize("reading, answer, escalate", [
    (0.8, kb.WITHIN_LIMIT, False),
    (3.0, kb.LIKELY_DEFECT, False),
    (5.0, kb.LIKELY_DEFECT, False),  # at the escalation line: fill it, no engineer yet
    (6.0, kb.LIKELY_DEFECT, True),   # wider than 5 mm: needs an engineer
])
def test_wall_crack_escalates_over_5mm(reading, answer, escalate):
    r = kb.check_measurement("TOL-CRACK-WALL", reading)
    assert (r["answer"], r["escalate"]) == (answer, escalate)


def test_door_window_counts_failed_tries():
    assert kb.check_measurement("TOL-DOOR-WINDOW-OPERATION", 1)["answer"] == kb.WITHIN_LIMIT  # passed 2 of 3
    assert kb.check_measurement("TOL-DOOR-WINDOW-OPERATION", 2)["answer"] == kb.LIKELY_DEFECT


@pytest.mark.parametrize("rule_id, reading", [
    ("TOL-NOT-A-RULE", 1.0),       # unknown rule
    ("TOL-TILE-LIPPAGE", "2"),     # text instead of a number
    ("TOL-TILE-LIPPAGE", True),    # yes/no answer to a measure rule
    ("TOL-TILE-LIPPAGE", -1.0),    # a gap can't be negative
    ("TOL-TILE-HOLLOW", 1),        # a number for a yes/no rule
])
def test_bad_input_raises(rule_id, reading):
    with pytest.raises(ValueError):
        kb.check_measurement(rule_id, reading)
