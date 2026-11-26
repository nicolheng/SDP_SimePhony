import pytest


@pytest.fixture
def repaired_post_dlp_case(seed_db):
    import db
    import tools

    unit_id = "C-1-01"
    buyer_id = "B-0301"
    with db.get_conn() as conn:
        conn.execute("UPDATE units SET vp_date = '2026-01-01' WHERE unit_id = ?", (unit_id,))
    previous = tools.create_case(unit_id, buyer_id, "Previous bedroom water leak")
    assert previous["ok"] is True
    with db.get_conn() as conn:
        conn.execute(
            """UPDATE cases
               SET category = 'water_leak', pin_room = 'Master bedroom',
                   location_in_unit = 'Master bedroom ceiling', status = 'REPAIRED'
               WHERE case_id = ?""",
            (previous["case_id"],),
        )
        conn.execute("UPDATE units SET vp_date = '2020-01-01' WHERE unit_id = ?", (unit_id,))
    return unit_id, buyer_id


def test_post_dlp_allows_same_repaired_category_and_room(repaired_post_dlp_case):
    import tools

    unit_id, buyer_id = repaired_post_dlp_case
    result = tools.create_case(
        unit_id, buyer_id, "Bedroom leak has returned", category="water_leak", room="Master bedroom ceiling"
    )
    assert result["ok"] is True, result


@pytest.mark.parametrize(
    ("category", "room"),
    [("electrical", "Master bedroom"), ("water_leak", "Kitchen")],
)
def test_post_dlp_rejects_different_category_or_room(repaired_post_dlp_case, category, room):
    import tools

    unit_id, buyer_id = repaired_post_dlp_case
    result = tools.create_case(unit_id, buyer_id, "New unrelated issue", category=category, room=room)
    assert result["ok"] is False
    assert result["error"].startswith("POST_DLP_SUBMISSION:")


def test_post_dlp_does_not_count_an_unrepaired_case(seed_db):
    import db
    import tools

    unit_id = "C-1-01"
    buyer_id = "B-0301"
    with db.get_conn() as conn:
        conn.execute("UPDATE units SET vp_date = '2026-01-01' WHERE unit_id = ?", (unit_id,))
    previous = tools.create_case(unit_id, buyer_id, "Previous bedroom water leak")
    assert previous["ok"] is True
    with db.get_conn() as conn:
        conn.execute(
            """UPDATE cases
               SET category = 'water_leak', pin_room = 'Master bedroom',
                   location_in_unit = 'Master bedroom ceiling', status = 'SUBMITTED'
               WHERE case_id = ?""",
            (previous["case_id"],),
        )
        conn.execute("UPDATE units SET vp_date = '2020-01-01' WHERE unit_id = ?", (unit_id,))

    result = tools.create_case(
        unit_id, buyer_id, "Bedroom leak has returned", category="water_leak", room="Master bedroom"
    )
    assert result["ok"] is False
    assert result["error"].startswith("POST_DLP_SUBMISSION:")
