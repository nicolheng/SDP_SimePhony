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


def _review_payload(case_id):
    import json
    import db

    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT payload FROM case_events WHERE case_id = ? AND type = 'case.review_requested'", (case_id,)
        ).fetchone()
    return json.loads(row["payload"])


def test_post_dlp_review_links_the_most_recent_matching_repair(seed_db):
    """#144: the review event names the latest earlier repair of the same category and room, never another room's."""
    import db
    import tools

    unit_id, buyer_id = "C-1-01", "B-0301"
    with db.get_conn() as conn:
        conn.execute("UPDATE units SET vp_date = '2026-01-01' WHERE unit_id = ?", (unit_id,))
    earlier = [tools.create_case(unit_id, buyer_id, f"Leak {n}")["case_id"] for n in range(3)]
    with db.get_conn() as conn:
        for case_id, room, repaired_at in [
            (earlier[0], "Master bedroom", "2026-02-01T10:00:00+08:00"),
            (earlier[1], "Master bedroom", "2026-05-01T10:00:00+08:00"),  # the latest same-room repair
            (earlier[2], "Kitchen", "2026-08-01T10:00:00+08:00"),  # newer, but another room
        ]:
            conn.execute(
                "UPDATE cases SET category = 'water_leak', pin_room = ?, status = 'REPAIRED', repaired_at = ? WHERE case_id = ?",
                (room, repaired_at, case_id),
            )
        conn.execute("UPDATE units SET vp_date = '2020-01-01' WHERE unit_id = ?", (unit_id,))

    result = tools.create_case(unit_id, buyer_id, "Leak is back", category="water_leak", room="Master bedroom")
    assert result["ok"] is True and result["status"] == "PENDING_REVIEW", result
    payload = _review_payload(result["case_id"])
    assert payload["reason_code"] == tools.LATENT_DEFECT_REVIEW == "POSSIBLE_LATENT_DEFECT"
    assert payload["earlier_case_id"] == earlier[1]
    assert payload["earlier_repaired_at"] == "2026-05-01T10:00:00+08:00"


def test_report_inside_dlp_is_not_flagged_as_latent(seed_db):
    import db
    import tools

    with db.get_conn() as conn:
        conn.execute("UPDATE units SET vp_date = '2026-01-01' WHERE unit_id = 'C-1-01'")
    result = tools.create_case("C-1-01", "B-0301", "Leak", category="water_leak", room="Master bedroom")
    assert result["ok"] is True and result["status"] == "SUBMITTED"
    with db.get_conn() as conn:
        assert not conn.execute(
            "SELECT 1 FROM case_events WHERE case_id = ? AND type = 'case.review_requested'", (result["case_id"],)
        ).fetchone()
