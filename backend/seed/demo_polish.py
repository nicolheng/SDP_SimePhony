"""One-off touches to data/seed.db so the SDP screens have something to show in the 29 Nov 2026 recording.

    python backend/seed/demo_polish.py

1. Buyer ratings: seed_history.py writes none, so Ratings, Insights and the Actions page's "Buyers to call back" were empty.
   About 70% of signed-off cases get a 1-5 rating (lower when the repair was late or came back), and the two
   CALL_BACKS cases get 1-2 stars with a comment that gives SDP a reason to call (only these show on Actions).
2. At Risk on Actions: every open case was reported in the last two weeks, so no 30-day repair clock was close.
   A few open cases without a booked slot are moved earlier, with all their records, so some are overdue or due soon.

Run it once, after shift_seed_dates.py (running it again moves those cases earlier again and re-rolls ratings).
`python backend/seed/demo_polish.py --ratings` re-rolls only the ratings and is safe to run again.
Regenerating seed.db with seed_history.py drops both; run this again afterwards.
"""
import random
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shift_seed_dates import shift_value  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
DB = ROOT / "data" / "seed.db"

# Open case -> days to move it earlier. Seed "now" is 18 Nov; on 29 Nov these are 22, 13 and 6 days past the
# 30-day repair period, then due in 1 and 7 days.
MOVE_EARLIER = {"C-0011": 38, "C-0003": 28, "C-0013": 18, "C-0010": 12, "C-0009": 4}

COMMENTS = {
    5: ["Fast and tidy, thank you.", "Technician explained everything clearly.", "Fixed in one visit. Very happy.", ""],
    4: ["Good repair, the visit was a bit late.", "Fixed properly, took a few days to book.", ""],
    3: ["Fixed in the end, but it took a while.", "OK, but I had to follow up twice."],
    2: ["Took over a month to come.", "Had to chase for updates every time."],
    1: ["Waited weeks and nobody called me back.", "Too slow, and I had to take leave twice for visits."],
}
# The unhappy buyers on the Actions page's "Buyers to call back", each with a real reason SDP can act on:
# H-0004 (A-11-08): the bathroom ceiling leak came back after the first repair, in stack 08 with the other leaks.
# H-0059 (A-5-08): the wall crack took 47 days to repair, past the 30-day repair period.
CALL_BACKS = {
    "H-0004": (1, "The leak from the bathroom ceiling came back after the first repair. Units above me have the same "
                  "problem. Please find where the water is really coming from."),
    "H-0059": (2, "Took almost seven weeks before anyone came to fix the cracks, and I had to chase for updates."),
}
RECENT_SLOTS = 6  # the Actions page looks at the 8 most recent ratings: the 2 call-backs plus at most 6 newer ones

# Used instead when the defect came back after the repair.
CAME_BACK = {2: "Came back after the first repair.", 3: "Fixed the second time, but it should have been right the first time.", 4: "Needed a second visit, otherwise fine."}


def move_case(conn: sqlite3.Connection, case_id: str, days: int) -> int:
    """Move every date of one case (and its events, messages, photos...) earlier by `days`."""
    delta = timedelta(days=-days)
    changed = 0
    for (table,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").fetchall():
        cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]
        if "case_id" not in cols:
            continue
        for col in cols:
            for rowid, value in conn.execute(
                f'SELECT rowid, "{col}" FROM "{table}" WHERE case_id = ? AND typeof("{col}") = \'text\' AND "{col}" GLOB \'*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*\'',
                (case_id,),
            ).fetchall():
                new = shift_value(value, delta)
                if new != value:
                    conn.execute(f'UPDATE "{table}" SET "{col}" = ? WHERE rowid = ?', (new, rowid))
                    changed += 1
    return changed


def rate_cases(conn: sqlite3.Connection) -> int:
    rng = random.Random(29112026)
    rows = conn.execute(  # newest sign-off first
        """SELECT case_id, created_at, repaired_at, buyer_signed_at, COALESCE(reopen_count, 0) AS reopens FROM cases
           WHERE status = 'CLOSED' AND buyer_signed_at IS NOT NULL ORDER BY buyer_signed_at DESC"""
    ).fetchall()
    conn.execute("UPDATE cases SET buyer_rating = NULL, buyer_rating_comment = NULL, buyer_rated_at = NULL")
    # The Actions page shows the 1-2 star ratings among the 8 most recent. Sign-offs newer than the oldest call-back are rated
    # 3+ (and at most RECENT_SLOTS of them), so exactly the CALL_BACKS cases show up there.
    oldest = min(signed for case_id, _, _, signed, _ in rows if case_id in CALL_BACKS)
    newer_rated = 0
    rated = 0
    for case_id, created, repaired, signed, reopens in rows:
        if case_id in CALL_BACKS:
            stars, comment = CALL_BACKS[case_id]
            rated_at = (datetime.fromisoformat(signed) + timedelta(hours=2)).isoformat()
            conn.execute(
                "UPDATE cases SET buyer_rating = ?, buyer_rating_comment = ?, buyer_rated_at = ? WHERE case_id = ?",
                (stars, comment, rated_at, case_id),
            )
            rated += 1
            continue
        newer = signed > oldest
        if rng.random() > 0.72 or (newer and newer_rated >= RECENT_SLOTS):
            continue  # not every buyer rates
        else:
            late = repaired and (datetime.fromisoformat(repaired) - datetime.fromisoformat(created)).days > 30
            if reopens:
                stars = rng.choice([2, 2, 3, 3, 4])
            elif late:
                stars = rng.choice([1, 2, 2, 3])
            else:
                stars = rng.choices([5, 4, 3], weights=[62, 30, 8])[0]
        if newer:
            stars = max(stars, 3)
            newer_rated += 1
        comment = CAME_BACK.get(stars, COMMENTS[stars][0]) if reopens else rng.choice(COMMENTS[stars])
        rated_at = (datetime.fromisoformat(signed) + timedelta(hours=2)).isoformat()
        conn.execute(
            "UPDATE cases SET buyer_rating = ?, buyer_rating_comment = ?, buyer_rated_at = ? WHERE case_id = ?",
            (stars, comment or None, rated_at, case_id),
        )
        rated += 1
    return rated


def main() -> None:
    conn = sqlite3.connect(DB)
    if "--ratings" not in sys.argv:  # --ratings: re-roll ratings only (safe to run again)
        for case_id, days in MOVE_EARLIER.items():
            print(f"{case_id}: moved {days} days earlier ({move_case(conn, case_id, days)} values)")
    print(f"Rated {rate_cases(conn)} signed-off cases")
    conn.commit()
    conn.execute("VACUUM")
    conn.close()


if __name__ == "__main__":
    main()
