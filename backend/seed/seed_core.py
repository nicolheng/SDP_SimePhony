import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))
import db  # noqa: E402

SEED_DB_PATH = ROOT / os.getenv("SEED_DB_PATH", "data/seed.db")

BLOCKS = ["A", "B", "C"]
FLOORS = 15
STACKS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]

CONTRACTORS = {
    "A": "Contractor Alpha",
    "B": "Contractor Beta",
    "C": "Contractor Gamma",
}

TECHNICIANS = [
    {"id": "T-01", "name": "Hafiz Osman", "email": "hafiz.tech@example.com", "skills": ["plumbing", "waterproofing"], "blocks": ["A", "B"]},
    {"id": "T-02", "name": "Ravi Kumar", "email": "ravi.tech@example.com", "skills": ["plumbing"], "blocks": ["A", "B", "C"]},
    {"id": "T-03", "name": "Lim Wei Jie", "email": "weijie.tech@example.com", "skills": ["electrical"], "blocks": ["A", "B", "C"]},
    {"id": "T-04", "name": "Nurul Izzah", "email": "nurul.tech@example.com", "skills": ["civil", "tiling", "painting"], "blocks": ["A", "B", "C"]},
    {"id": "T-05", "name": "Daniel Tan", "email": "daniel.tech@example.com", "skills": ["carpentry", "glazing", "general"], "blocks": ["A", "B", "C"]},
    {"id": "T-06", "name": "Siti Aminah", "email": "siti.tech@example.com", "skills": ["waterproofing", "civil"], "blocks": ["C"]},
]


def seed_core():
    print(f"📦 Initializing Core Data in {SEED_DB_PATH}...")
    SEED_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Initialize schema if seed.db is empty or freshly initialized
    db.init_schema(SEED_DB_PATH)
    conn = db.connect(SEED_DB_PATH)

    now = datetime(2026, 10, 19, 9, 0, 0, tzinfo=timezone.utc)

    try:
        # 1. Units & Buyers
        print("🏢 Seeding 450 units and buyers...")
        unit_rows = []
        buyer_rows = []

        for block in BLOCKS:
            contractor = CONTRACTORS[block]
            for floor in range(1, FLOORS + 1):
                for stack in STACKS:
                    u_id = f"{block}-{floor}-{stack}"
                    unit_rows.append((u_id, block, floor, stack, contractor))

                    # Demo resident for A-12-08
                    if u_id == "A-12-08":
                        buyer_rows.append(("B-A-12-08", "Aisyah Rahman", "aisyah.demo@example.com", u_id))
                    else:
                        buyer_rows.append((f"B-{u_id}", f"Resident {u_id}", f"buyer.{u_id.lower().replace('-', '.')}@example.com", u_id))

        conn.executemany("INSERT OR REPLACE INTO units (unit_id, block, floor, stack, contractor) VALUES (?, ?, ?, ?, ?)", unit_rows)
        conn.executemany("INSERT OR REPLACE INTO buyers (buyer_id, name, email, unit_id) VALUES (?, ?, ?, ?)", buyer_rows)
        print(f"✅ Created {len(unit_rows)} units and {len(buyer_rows)} buyers.")

        # 2. Technicians
        print("👷 Seeding 6 technicians...")
        tech_rows = [
            (t["id"], t["name"], t["email"], json.dumps(t["skills"]), json.dumps(t["blocks"]))
            for t in TECHNICIANS
        ]
        conn.executemany("INSERT OR REPLACE INTO technicians (technician_id, name, email, skills, blocks) VALUES (?, ?, ?, ?, ?)", tech_rows)
        print(f"✅ Created {len(tech_rows)} technicians.")

        # 3. Technician Availability Slots (2 weeks: 09:00, 11:00, 14:00, 16:00)
        print("📅 Seeding 2 weeks of technician booking slots...")
        slot_rows = []
        slot_times = ["09:00", "11:00", "14:00", "16:00"]
        slot_idx = 1

        for day_offset in range(14):
            day_dt = now.date() + timedelta(days=day_offset)
            if day_dt.weekday() == 6:  # Skip Sundays
                continue

            for tech in TECHNICIANS:
                tid = tech["id"]
                for tm in slot_times:
                    slot_id = f"S-{slot_idx:04d}"
                    slot_idx += 1
                    h, m = map(int, tm.split(":"))
                    start_at = datetime(day_dt.year, day_dt.month, day_dt.day, h, m, tzinfo=timezone.utc).isoformat()
                    end_at = datetime(day_dt.year, day_dt.month, day_dt.day, h + 2, m, tzinfo=timezone.utc).isoformat()
                    slot_rows.append((slot_id, tid, start_at, end_at, None, None))

        conn.executemany("INSERT OR REPLACE INTO slots (slot_id, technician_id, start_at, end_at, case_id, kind) VALUES (?, ?, ?, ?, ?, ?)", slot_rows)
        print(f"✅ Created {len(slot_rows)} available slots.")

        conn.commit()
        conn.close()
        print("🎉 seed_core.py completed successfully!")

    finally:
        pass


if __name__ == "__main__":
    seed_core()

