"""Move every date in data/seed.db forward (or back) by a whole number of days, so the demo looks current.

The demo clock is the real date (demo_api/timeutil.demo_now), but seed_history.py builds the data around a fixed
"now" (2026-10-19). Run this once before a recording so the seeded data looks recent:

    python backend/seed/shift_seed_dates.py --days 30        # 19 Oct 2026 -> 18 Nov 2026 (applied 27 Nov)

Some seeded cases have events up to 8 days after that "now" (e.g. C-0008 reopens on day +8), so keep the shifted
"now" at least 8 days before the day you demo or test; otherwise those events are in the future and sort wrongly.

It shifts every ISO date or timestamp column, ISO timestamps inside JSON/text columns (event payloads, briefs) and
the units' vacant possession dates, so the DLP countdowns keep the same story. Whole days keep the time of day.
Running it twice shifts twice. Afterwards press "Reset demo" (or start a new demo session) to load the new seed.db.
"""
import argparse
import re
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?")
DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def shift_timestamp(text: str, delta: timedelta) -> str:
    z = text.endswith("Z")
    dt = datetime.fromisoformat(text[:-1] + "+00:00" if z else text) + delta
    out = dt.isoformat()
    return out[:-6] + "Z" if z else out


def shift_value(value: str, delta: timedelta) -> str:
    if DATE_ONLY.match(value):
        return (date.fromisoformat(value) + delta).isoformat()
    return TIMESTAMP.sub(lambda m: shift_timestamp(m.group(0), delta), value)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--days", type=int, required=True, help="days to move every date by (negative moves back)")
    p.add_argument("--db", default=str(ROOT / "data" / "seed.db"))
    args = p.parse_args()
    delta = timedelta(days=args.days)

    conn = sqlite3.connect(args.db)
    changed = 0
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    for table in tables:
        cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]
        for col in cols:
            rows = conn.execute(
                f'SELECT rowid, "{col}" FROM "{table}" WHERE typeof("{col}") = \'text\' AND "{col}" GLOB \'*[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*\''
            ).fetchall()
            for rowid, value in rows:
                new = shift_value(value, delta)
                if new != value:
                    conn.execute(f'UPDATE "{table}" SET "{col}" = ? WHERE rowid = ?', (new, rowid))
                    changed += 1
    conn.commit()
    conn.execute("VACUUM")
    conn.close()
    print(f"Shifted {changed} values by {args.days} days in {args.db}")


if __name__ == "__main__":
    main()
