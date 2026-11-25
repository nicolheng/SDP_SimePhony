"""kb.dlp_status: is a unit still inside its 24-month defect liability period (#123)?

Times are UTC, as stored in the app. The DLP's last day ends at 23:59:59 Malaysia time (UTC+8),
which is 15:59:59 UTC.
"""
import pytest

from agents.simephony import kb

UNIT = {"unit_id": "A-12-03", "vp_date": "2024-08-31"}  # DLP ends 2026-08-31


def test_inside_the_dlp():
    r = kb.dlp_status(UNIT, "2025-06-01T02:00:00.000Z")
    assert r["status"] == "in"
    assert r["dlp_end"] == "2026-08-31"
    assert r["days_left"] > 0


def test_last_day_still_counts():
    r = kb.dlp_status(UNIT, "2026-08-31T15:00:00.000Z")  # 23:00 Malaysia time on the last day
    assert r["status"] == "in"
    assert r["days_left"] == 0


def test_first_minute_after_the_end():
    r = kb.dlp_status(UNIT, "2026-08-31T16:00:01.000Z")  # 00:00:01 Malaysia time on 1 Sep
    assert r["status"] == "after"
    assert r["days_left"] == -1


def test_long_after_the_dlp():
    r = kb.dlp_status(UNIT, "2027-03-01T00:00:00.000Z")
    assert r["status"] == "after"
    assert r["days_left"] < -150


@pytest.mark.parametrize("unit", [{"unit_id": "X"}, {"unit_id": "X", "vp_date": None}, {"unit_id": "X", "vp_date": ""}])
def test_no_handover_date_is_unknown(unit):
    assert kb.dlp_status(unit, "2026-01-01T00:00:00.000Z") == {"status": "unknown", "dlp_end": None, "days_left": None}


def test_leap_day_handover_ends_on_28_feb():
    # 24 months after 29 Feb 2024 is 28 Feb 2026 (2026 has no 29 Feb)
    r = kb.dlp_status({"vp_date": "2024-02-29"}, "2026-02-28T12:00:00.000Z")  # 20:00 Malaysia time, last day
    assert r["dlp_end"] == "2026-02-28"
    assert r["status"] == "in"
