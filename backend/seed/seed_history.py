import json
import os
import random
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

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
from seed.seed_core import seed_core, TECHNICIANS, BLOCKS, FLOORS, STACKS  # noqa: E402

SEED_DB_PATH = ROOT / os.getenv("SEED_DB_PATH", "data/seed.db")
LIVE_DB_PATH = ROOT / os.getenv("DB_PATH", "data/simephony.db")

MODEL_NAME = "all-MiniLM-L6-v2"

CATEGORY_SKILL_MAP = {
    "water_leak": ["plumbing", "waterproofing"],
    "plumbing": ["plumbing"],
    "drainage": ["plumbing"],
    "sanitary_fittings": ["plumbing"],
    "electrical": ["electrical"],
    "wall_crack": ["civil"],
    "structural_crack": ["civil"],
    "tiles": ["tiling"],
    "ceiling": ["civil"],
    "door_window": ["carpentry", "glazing"],
    "paint": ["painting"],
    "other": ["general"],
}

CATEGORY_TEMPLATES = {
    "water_leak": [
        {"sub": "ceiling_leak", "locs": ["master bedroom ceiling", "bathroom ceiling", "kitchen ceiling"], "texts": [
            "Water dripping from ceiling slab, brown water stain spreading after heavy downpour.",
            "Water moisture patch appearing near ceiling corner, slow drip.",
            "Ceiling peeling and damp to the touch, persistent water mark.",
        ]},
        {"sub": "wall_seepage", "locs": ["living room wall", "bedroom 2 wall", "shared party wall"], "texts": [
            "Wall damp and paint bubbling near skirting board after rain.",
            "Moisture marks and white efflorescence spreading along wall surface.",
        ]},
        {"sub": "pipe_burst", "locs": ["service yard pipe shaft", "kitchen wall riser"], "texts": [
            "Active water dripping along the common drainage riser pipe.",
            "Leaking joint on vertical water supply pipe behind service panel.",
        ]},
    ],
    "plumbing": [
        {"sub": "pipe_leak", "locs": ["kitchen sink", "bathroom basin"], "texts": [
            "Drain pipe under kitchen sink has slow leak around coupling.",
            "Flexible water inlet hose under bathroom vanity is dripping.",
        ]},
    ],
    "drainage": [
        {"sub": "slow_drain", "locs": ["shower floor trap", "balcony drain"], "texts": [
            "Shower floor trap draining very sluggishly, water pools during shower.",
            "Balcony drainage outlet choked with cement debris, overflow risk.",
        ]},
    ],
    "sanitary_fittings": [
        {"sub": "loose_fitting", "locs": ["master bathroom", "powder room"], "texts": [
            "Toilet cistern inlet valve won't shut off, water continuously running into bowl.",
            "Washbasin wobbly, silicone sealant along wall has separated.",
        ]},
    ],
    "electrical": [
        {"sub": "tripping_breaker", "locs": ["distribution board", "kitchen"], "texts": [
            "Main ELCB / circuit breaker trips intermittently when kettle is plugged in.",
            "Power socket sparks and trips breaker when microwave switched on.",
        ]},
        {"sub": "faulty_socket", "locs": ["living room", "master bedroom"], "texts": [
            "Wall plug socket loose and not supplying electricity.",
            "Downlight switch sparking audibly inside wall casing.",
        ]},
    ],
    "wall_crack": [
        {"sub": "hairline_crack", "locs": ["living room wall", "bedroom 2 door frame"], "texts": [
            "Diagonal hairline crack extending from corner of window frame.",
            "Hairline plaster crack above hallway doorway, cosmetic defect.",
        ]},
    ],
    "structural_crack": [
        {"sub": "beam_crack", "locs": ["living room ceiling beam", "balcony column"], "texts": [
            "Noticeable 2mm crack across reinforced concrete beam near balcony door.",
        ]},
    ],
    "tiles": [
        {"sub": "hollow_tiles", "locs": ["living room floor", "kitchen floor"], "texts": [
            "Multiple floor tiles sound hollow when tapped with coin.",
            "Tile popping and lifting slightly at grout joint near balcony doorway.",
        ]},
    ],
    "ceiling": [
        {"sub": "cracked_plasterboard", "locs": ["master bedroom", "living room"], "texts": [
            "Plaster ceiling joint tape separating and sagging near aircond duct.",
            "Visible crack line along gypsum board joint in living room.",
        ]},
    ],
    "door_window": [
        {"sub": "sliding_door_stuck", "locs": ["balcony sliding door", "master bedroom window"], "texts": [
            "Balcony aluminium sliding door jammed on track, difficult to slide.",
            "Casement window handle loose and won't lock tightly.",
        ]},
    ],
    "paint": [
        {"sub": "paint_peeling", "locs": ["bedroom 2 window wall", "balcony wall"], "texts": [
            "Paint bubbling and peeling off near window frame.",
            "Uneven paint coat with visible brush marks and color variation.",
        ]},
    ],
    "other": [
        {"sub": "missing_hardware", "locs": ["kitchen cabinet", "main door"], "texts": [
            "Kitchen cabinet soft-close hinge missing screw.",
            "Main door rubber acoustic gasket strip detached.",
        ]},
    ],
}


def pick_technician_for(category: str, block: str) -> str:
    required_skills = CATEGORY_SKILL_MAP.get(category, ["general"])
    for tech in TECHNICIANS:
        if block in tech["blocks"] and any(s in tech["skills"] for s in required_skills):
            return tech["id"]
    return "T-05"


def seed_history():
    print(f"Verifying core baseline in {SEED_DB_PATH}...")
    conn = db.connect(SEED_DB_PATH)
    unit_count = conn.execute("SELECT COUNT(*) FROM units").fetchone()[0]
    conn.close()

    if unit_count < 450:
        print("⚠️ Core units missing or incomplete. Running seed_core first...")
        seed_core()

    conn = db.connect(SEED_DB_PATH)
    cursor = conn.cursor()

    # Clear previous history data while preserving core units, buyers, technicians
    cursor.execute("PRAGMA foreign_keys = OFF")
    for tbl in [
        "cases", "case_photos", "case_events", "approvals", "inspection_briefs",
        "case_embeddings", "outbox", "systemic_issues", "verifications"
    ]:
        cursor.execute(f"DELETE FROM {tbl}")
    cursor.execute("UPDATE slots SET case_id = NULL, kind = NULL")
    cursor.execute("PRAGMA foreign_keys = ON")
    conn.commit()

    random.seed(20261019)
    now = datetime(2026, 10, 19, 9, 0, 0, tzinfo=timezone.utc)

    try:
        cases_to_insert = []
        events_to_insert = []
        photos_to_insert = []
        verifications_to_insert = []
        outbox_to_insert = []
        approvals_to_insert = []
        systemic_issues_to_insert = []
        inspection_briefs_to_insert = []
        texts_for_embeddings = []

        def add_case(
            case_id: str,
            unit_id: str,
            category: str,
            sub_category: str,
            location: str,
            summary: str,
            description: str,
            urgency: str,
            status: str,
            technician_id: str,
            reopen_count: int,
            created_at: datetime,
            closed_at: datetime | None,
            verification_status: str = "pending",
            inspection_outcome: str | None = "VALID_DEFECT",
            buyer_signed: int = 1,
            developer_signed: int = 1,
            verification_result: str | None = None,
            verification_note: str | None = None,
        ):
            buyer_id = f"B-A-12-08" if unit_id == "A-12-08" else f"B-{unit_id}"

            cases_to_insert.append((
                case_id,
                unit_id,
                buyer_id,
                status,
                category,
                sub_category,
                location,
                summary,
                description,
                urgency,
                technician_id,
                reopen_count,
                developer_signed,
                buyer_signed,
                verification_status,
                inspection_outcome,
                created_at.isoformat(),
                closed_at.isoformat() if closed_at else None,
            ))

            embed_text = f"{summary}. {description}. Category: {category} ({sub_category}). Location: {location} in unit {unit_id}."
            texts_for_embeddings.append((case_id, embed_text))

            photos_to_insert.append((case_id, f"sample_{category}_original.jpg", "original", created_at.isoformat()))

            t = created_at
            events_to_insert.append((case_id, "case.created", json.dumps({"summary": summary, "category": category}), t.isoformat()))
            events_to_insert.append((case_id, "agent.step", json.dumps({"agent": "IntakeAgent", "message": f"Classified as {category} > {sub_category}"}), (t + timedelta(minutes=2)).isoformat()))

            t += timedelta(hours=2)
            events_to_insert.append((case_id, "case.assigned", json.dumps({"technician_id": technician_id}), t.isoformat()))
            events_to_insert.append((case_id, "email.sent", json.dumps({"to": "buyer", "subject": f"[{case_id}] Case assigned"}), t.isoformat()))
            outbox_to_insert.append((case_id, f"{buyer_id}@example.com", f"[{case_id}] Technician Assigned", f"Hi, technician {technician_id} has been assigned for {summary}.", "sent", None, t.isoformat()))

            if status in ("VALID", "REPAIR_BOOKED", "REPAIRED", "PENDING_VERIFICATION", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION", "CLOSED"):
                t += timedelta(days=2)
                events_to_insert.append((case_id, "verdict.recorded", json.dumps({"outcome": "VALID", "note": "Verified defect on site."}), t.isoformat()))
                photos_to_insert.append((case_id, f"sample_{category}_verdict.jpg", "verdict", t.isoformat()))

            if status in ("REPAIR_BOOKED", "REPAIRED", "PENDING_VERIFICATION", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION", "CLOSED"):
                t += timedelta(days=1)
                events_to_insert.append((case_id, "repair.booked", json.dumps({"slot": (t + timedelta(days=2)).isoformat()}), t.isoformat()))

            if status in ("REPAIRED", "PENDING_VERIFICATION", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION", "CLOSED"):
                t += timedelta(days=3)
                events_to_insert.append((case_id, "repair.done", json.dumps({"note": "Repairs completed by technician."}), t.isoformat()))
                photos_to_insert.append((case_id, f"sample_{category}_repair.jpg", "repair", t.isoformat()))
                events_to_insert.append((case_id, "verification.requested", json.dumps({"protocol": f"{category}_protocol"}), (t + timedelta(minutes=10)).isoformat()))

            if verification_result:
                t += timedelta(days=1)
                events_to_insert.append((case_id, "verification.completed", json.dumps({"result": verification_result, "note": verification_note}), t.isoformat()))
                verifications_to_insert.append((
                    f"V-{case_id}",
                    case_id,
                    f"Standard {category} verification procedure",
                    verification_result,
                    verification_note,
                    f"verification_{case_id}.jpg",
                    t.isoformat(),
                ))

            if reopen_count > 0:
                t += timedelta(days=5)
                events_to_insert.append((case_id, "case.reopened", json.dumps({"reason": "Defect returned during rain."}), t.isoformat()))
                photos_to_insert.append((case_id, f"sample_{category}_reopen.jpg", "reopen", t.isoformat()))
                events_to_insert.append((case_id, "recurrence.detected", json.dumps({"occurrence": reopen_count + 1}), (t + timedelta(minutes=5)).isoformat()))

            if status == "CLOSED" and closed_at:
                events_to_insert.append((case_id, "case.closed", json.dumps({"closed_by": "verification_completed"}), closed_at.isoformat()))

        # -------------------------------------------------------------------
        # 1. Planted Story for SimilarDefectAgent & RecurrenceAgent Evaluation
        # -------------------------------------------------------------------
        print("Seeding planted defect story (A-12-08 & Stack A-08)...")

        # Prior Leak 1 in A-12-08 (~13 months ago)
        c1_time = now - timedelta(days=400)
        add_case(
            case_id="H-0001",
            unit_id="A-12-08",
            category="water_leak",
            sub_category="ceiling_leak",
            location="master bedroom ceiling",
            summary="Brown water patch and minor dripping from ceiling",
            description="Water dripping from ceiling slab in master bedroom wardrobe corner. Spread after rain.",
            urgency="high",
            status="CLOSED",
            technician_id="T-01",
            reopen_count=0,
            created_at=c1_time,
            closed_at=c1_time + timedelta(days=8),
            verification_status="verified",
            inspection_outcome="VALID_DEFECT",
            verification_result="FIXED",
            verification_note="Checked ceiling after rain, dry and fixed.",
        )

        # Prior Leak 2 in A-12-08 (~5 months ago, reopened once)
        c2_time = now - timedelta(days=150)
        add_case(
            case_id="H-0002",
            unit_id="A-12-08",
            category="water_leak",
            sub_category="ceiling_leak",
            location="master bedroom ceiling",
            summary="Ceiling leaking again at the same spot in master bedroom",
            description="Water mark reappeared in master bedroom ceiling. Smells damp and paint bubbling.",
            urgency="high",
            status="CLOSED",
            technician_id="T-01",
            reopen_count=1,
            created_at=c2_time,
            closed_at=c2_time + timedelta(days=15),
            verification_status="verified",
            inspection_outcome="VALID_DEFECT",
            verification_result="FIXED",
            verification_note="Sealant reapplied by technician and verified dry.",
        )

        # Stack A-08 Vertical Cluster (Water leaks along shared drainage riser)
        stack_cases = [
            ("H-0003", "A-11-08", -300, 10, "Water seepage from upper floor slab into bathroom ceiling"),
            ("H-0004", "A-11-08", -90, 8, "Slow water dripping from bathroom ceiling pipe sleeve"),
            ("H-0005", "A-10-08", -180, 11, "Persistent water stain around vertical stack pipe shaft"),
            ("H-0006", "A-9-08", -120, 7, "Moisture tracking along exterior of common drainage riser"),
            ("H-0007", "A-12-07", -210, 9, "Party wall dampness and bubbling paint shared with unit A-12-08"),
        ]
        for cid, uid, offset, days_to_close, desc in stack_cases:
            ct = now + timedelta(days=offset)
            add_case(
                case_id=cid,
                unit_id=uid,
                category="water_leak",
                sub_category="ceiling_leak",
                location="master bedroom ceiling" if "12" in uid or "11" in uid else "pipe shaft",
                summary=desc[:60],
                description=desc,
                urgency="high",
                status="CLOSED",
                technician_id="T-01",
                reopen_count=1 if "11" in uid else 0,
                created_at=ct,
                closed_at=ct + timedelta(days=days_to_close),
                verification_status="verified",
                inspection_outcome="VALID_DEFECT",
                verification_result="FIXED",
                verification_note="Tested and confirmed dry.",
            )

        # -------------------------------------------------------------------
        # 2. Historical Systemic Issue SI-001 (Block B Stack 03 tiles)
        # -------------------------------------------------------------------
        print("Seeding SI-001 cluster in Stack B-03...")
        b_tile_cases = [
            ("H-0008", "B-5-03", -240, 12, "Multiple floor tiles sound hollow when tapped in living room"),
            ("H-0009", "B-6-03", -200, 14, "Hollow tiles with cracking grout lines in living room"),
            ("H-0010", "B-8-03", -170, 16, "Popping floor tiles along hallway and living room entrance"),
        ]
        si1_case_ids = []
        for cid, uid, offset, days_to_close, desc in b_tile_cases:
            ct = now + timedelta(days=offset)
            si1_case_ids.append(cid)
            add_case(
                case_id=cid,
                unit_id=uid,
                category="tiles",
                sub_category="hollow_tiles",
                location="living room",
                summary="Hollow floor tiles in living room",
                description=desc,
                urgency="normal",
                status="CLOSED",
                technician_id="T-04",
                reopen_count=1 if uid == "B-6-03" else 0,
                created_at=ct,
                closed_at=ct + timedelta(days=days_to_close),
                verification_status="verified",
                inspection_outcome="VALID_DEFECT",
                verification_result="FIXED",
                verification_note="Defective tiles replaced.",
            )

        systemic_issues_to_insert.append((
            "SI-001", "tiles", "B", "03", json.dumps(si1_case_ids), len(si1_case_ids), 0.78,
            (now - timedelta(days=60)).isoformat(), "monitoring",
            "Screed bonding check on stack B-03 floors; monitor for 3 months.", "APR-0001",
        ))

        approvals_to_insert.append((
            "APR-0001", "H-0010", json.dumps(["Cluster of 3 units in Stack B-03 with hollow screed bonding"]),
            "approved", "sdp.manager@example.com", (now - timedelta(days=62)).isoformat(), (now - timedelta(days=60)).isoformat(),
        ))

        inspection_briefs_to_insert.append((
            "H-0010",
            json.dumps({
                "title": "Stack B-03 Tile Screed Investigation Brief",
                "timeline": [
                    {"at": (now - timedelta(days=240)).isoformat(), "text": "First hollow tile report in B-5-03"},
                    {"at": (now - timedelta(days=200)).isoformat(), "text": "Second report in B-6-03 with reopen"},
                    {"at": (now - timedelta(days=170)).isoformat(), "text": "Third report in B-8-03; cluster threshold reached"},
                ],
                "likelyComponents": ["Subfloor cement screed batch", "Adhesive bonding primer", "Expansion joints"],
                "checklist": ["Conduct acoustic hammer tap test on adjacent units", "Check moisture content of concrete slab", "Inspect batch number of screed mix used by Contractor Beta"],
            }),
            (now - timedelta(days=60)).isoformat(),
        ))

        # -------------------------------------------------------------------
        # 3. Diverse Historical Background Cases (Across all 12 categories)
        # -------------------------------------------------------------------
        print("Generating 100 historical background cases across all 12 categories...")
        all_categories = list(CATEGORY_TEMPLATES.keys())
        cat_weights = [0.20, 0.12, 0.08, 0.06, 0.12, 0.10, 0.04, 0.10, 0.05, 0.06, 0.05, 0.02]

        all_units = [
            f"{b}-{fl}-{st}" for b in BLOCKS for fl in range(1, FLOORS + 1) for st in STACKS
            if f"{b}-{fl}-{st}" not in ("A-12-08", "A-12-07", "A-11-08", "A-10-08", "A-9-08", "B-5-03", "B-6-03", "B-8-03")
        ]

        for i in range(100):
            cid = f"H-{11 + i:04d}"
            uid = random.choice(all_units)
            block = uid.split("-")[0]
            cat = random.choices(all_categories, weights=cat_weights)[0]
            tpl = random.choice(CATEGORY_TEMPLATES[cat])
            loc = random.choice(tpl["locs"])
            desc = random.choice(tpl["texts"])

            days_ago = random.randint(3, 520)
            ct = now - timedelta(days=days_ago)

            tech_id = pick_technician_for(cat, block)
            urgency = "high" if cat in ("water_leak", "electrical", "structural_crack") and random.random() < 0.35 else "normal"

            # Determine status based on age and realistic progression
            # Recent cases (<35 days) have diverse in-progress and open statuses
            if days_ago < 10:
                roll = random.random()
                if roll < 0.20:
                    status = "SUBMITTED"
                    outcome = None
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 0
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
                elif roll < 0.40:
                    status = "ASSIGNED"
                    outcome = None
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 0
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
                elif roll < 0.65:
                    status = "VISIT_SCHEDULED"
                    outcome = None
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 0
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
                elif roll < 0.85:
                    status = "VALID"
                    outcome = "VALID_DEFECT"
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 0
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
                else:
                    status = "REPAIR_BOOKED"
                    outcome = "VALID_DEFECT"
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 0
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
            elif days_ago < 25:
                roll = random.random()
                if roll < 0.25:
                    status = "REPAIRED"
                    outcome = "VALID_DEFECT"
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 1
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
                elif roll < 0.50:
                    status = "PENDING_VERIFICATION"
                    outcome = "VALID_DEFECT"
                    verification_status = "pending"
                    buyer_signed, developer_signed = 0, 1
                    v_res, v_note = None, None
                    close_time = None
                    reopen_cnt = 0
                elif roll < 0.70:
                    status = "REOPENED"
                    outcome = "VALID_DEFECT"
                    verification_status = "not_verified"
                    buyer_signed, developer_signed = 0, 0
                    v_res, v_note = "NOT_FIXED", "Defect recurred; resident requested revisit."
                    close_time = None
                    reopen_cnt = 1
                elif roll < 0.85:
                    status = "INVALID"
                    outcome = "NOT_A_DEFECT"
                    verification_status = "not_verified"
                    buyer_signed, developer_signed = 0, 1
                    v_res, v_note = "NOT_FIXED", "Technician inspected: deemed within normal tolerance, not a defect."
                    close_time = ct + timedelta(days=2)
                    reopen_cnt = 0
                else:
                    status = "CLOSED"
                    outcome = "VALID_DEFECT"
                    verification_status = "verified"
                    buyer_signed, developer_signed = 1, 1
                    v_res, v_note = "FIXED", "Resident verified repair on site."
                    close_time = ct + timedelta(days=random.randint(6, 14))
                    reopen_cnt = 0
            else:
                # Older cases (>25 days) are mostly closed or invalid
                is_invalid = random.random() < 0.12
                status = "INVALID" if is_invalid else "CLOSED"
                outcome = "NOT_A_DEFECT" if is_invalid else "VALID_DEFECT"
                reopen_cnt = 1 if (not is_invalid and random.random() < 0.14) else 0
                close_time = ct + timedelta(days=random.randint(4, 20))
                verification_status = "not_verified" if is_invalid else "verified"
                buyer_signed = 0 if is_invalid else 1
                developer_signed = 1
                v_res = "NOT_FIXED" if is_invalid else "FIXED"
                v_note = "Within acceptable building tolerance, no defect." if is_invalid else "Resident confirmed fixed."

            add_case(
                case_id=cid,
                unit_id=uid,
                category=cat,
                sub_category=tpl["sub"],
                location=loc,
                summary=f"{tpl['sub'].replace('_', ' ').capitalize()} in {loc}",
                description=desc,
                urgency=urgency,
                status=status,
                technician_id=tech_id,
                reopen_count=reopen_cnt,
                created_at=ct,
                closed_at=close_time,
                verification_status=verification_status,
                inspection_outcome=outcome,
                buyer_signed=buyer_signed,
                developer_signed=developer_signed,
                verification_result=v_res,
                verification_note=v_note,
            )

        # -------------------------------------------------------------------
        # 4. Live Defect Cases Testing Complete Agentic Flow
        # -------------------------------------------------------------------
        print("Seeding active evaluation cases for all 7 agents...")
        live_cases = [
            ("L-001", "B-7-02", "electrical", "tripping_breaker", "kitchen", "Main circuit breaker trips intermittently", "VISIT_SCHEDULED", "high", "T-03", 0, -2, 2, "pending", None, 0, 0),
            ("L-002", "C-3-05", "tiles", "hollow_tiles", "living room", "Several floor tiles sound hollow when stepped on", "REPAIR_BOOKED", "normal", "T-04", 0, -5, 3, "pending", "VALID_DEFECT", 0, 0),
            ("L-003", "A-4-01", "door_window", "sliding_door_stuck", "balcony", "Balcony sliding door off track and sticking", "VALID", "normal", "T-05", 0, -3, None, "pending", "VALID_DEFECT", 0, 0),
            ("L-004", "B-14-09", "paint", "paint_peeling", "bedroom 2", "Paint bubbling and flaking near window skirting", "PENDING_VERIFICATION", "normal", "T-04", 0, -7, None, "pending", "VALID_DEFECT", 0, 0),
            ("L-005", "C-10-04", "drainage", "slow_drain", "shower floor", "Shower floor drain stagnant, water pools for hours", "VISIT_SCHEDULED", "normal", "T-02", 0, -1, 1, "pending", None, 0, 0),
            ("L-006", "A-6-10", "wall_crack", "hairline_crack", "living room", "Superficial hairline plaster crack above door", "INVALID", "low", "T-04", 0, -4, None, "not_verified", "NOT_A_DEFECT", 0, 1),
            ("L-007", "C-12-01", "plumbing", "pipe_leak", "kitchen sink", "Slow dripping under kitchen sink drain pipe", "REPAIRED", "normal", "T-02", 0, -4, None, "pending", "VALID_DEFECT", 0, 0),
            ("L-008", "B-3-08", "water_leak", "ceiling_leak", "bathroom", "Ceiling moisture mark reappeared after rain", "REOPENED", "high", "T-01", 1, -6, None, "not_verified", "VALID_DEFECT", 0, 0),
            ("L-009", "C-8-06", "sanitary_fittings", "loose_fitting", "master bathroom", "Toilet flush button sticking and constantly running", "SUBMITTED", "normal", "T-02", 0, 0, None, "pending", None, 0, 0),
            ("L-010", "A-2-05", "electrical", "faulty_socket", "living room", "Power socket sparks when TV plugged in", "ASSIGNED", "high", "T-03", 0, -1, None, "pending", None, 0, 0),
            ("L-011", "B-11-03", "structural_crack", "beam_crack", "balcony", "Noticed 2mm diagonal crack on balcony beam", "ESCALATION_PENDING", "high", "T-04", 2, -3, None, "pending", "VALID_DEFECT", 0, 0),
            ("L-012", "A-14-04", "ceiling", "cracked_plasterboard", "foyer ceiling", "Plaster ceiling sagged with visible crack along joist", "EXTRA_INSPECTION", "normal", "T-04", 1, -5, None, "pending", "VALID_DEFECT", 0, 0),
        ]

        for cid, uid, cat, sub, loc, summary, status, urg, tid, reopens, created_offset, slot_offset, vstatus, outcome, b_sign, dev_sign in live_cases:
            ct = now + timedelta(days=created_offset)
            cl_at = ct + timedelta(days=2) if status == "INVALID" else None

            add_case(
                case_id=cid,
                unit_id=uid,
                category=cat,
                sub_category=sub,
                location=loc,
                summary=summary,
                description=f"{summary}. Reported recently by resident.",
                urgency=urg,
                status=status,
                technician_id=tid,
                reopen_count=reopens,
                created_at=ct,
                closed_at=cl_at,
                verification_status=vstatus,
                inspection_outcome=outcome,
                buyer_signed=b_sign,
                developer_signed=dev_sign,
                verification_result="NOT_FIXED" if status == "REOPENED" else None,
                verification_note="Buyer indicated defect returned" if status == "REOPENED" else None,
            )

        # -------------------------------------------------------------------
        # 5. Seed SI-002 (Stack A-08 Leaks) & Pending Approval
        # -------------------------------------------------------------------
        print("Seeding SI-002 (Stack A-08 Leaks) & pending escalation approval...")
        si2_related = ["H-0001", "H-0002", "H-0003", "H-0004", "H-0005", "H-0006", "H-0007"]
        systemic_issues_to_insert.append((
            "SI-002", "water_leak", "A", "08", json.dumps(si2_related), len(si2_related), 0.92,
            (now - timedelta(days=1)).isoformat(), "open",
            "Extra inspection of unit A-12-08 and stack A-08 shared drainage riser pipe.", "APR-0002",
        ))

        approvals_to_insert.append((
            "APR-0002", "H-0002",
            json.dumps([
                "3rd occurrence of ceiling leak reported in unit A-12-08",
                "Stack A-08 vertical leak cluster detected (units A-12-08, A-11-08, A-10-08, A-9-08, A-12-07)",
            ]),
            "pending", None, (now - timedelta(days=1)).isoformat(), None,
        ))

        events_to_insert.append((
            "H-0002", "inspection.requested", json.dumps({"approval_id": "APR-0002", "systemic_issue_id": "SI-002"}), (now - timedelta(days=1)).isoformat(),
        ))
        outbox_to_insert.append((
            "H-0002", "sdp.staff@example.com", "[Approval Needed] Extra Inspection for A-12-08 (SI-002)",
            "RecurrenceAgent detected 3rd occurrence in A-12-08 and stack A-08 cluster. Please review and approve.",
            "sent", None, (now - timedelta(days=1)).isoformat(),
        ))

        # -------------------------------------------------------------------
        # 6. Database Insertion
        # -------------------------------------------------------------------
        print(f"Inserting {len(cases_to_insert)} cases...")
        conn.executemany(
            """
            INSERT INTO cases (
                case_id, unit_id, buyer_id, status, category, sub_category,
                location_in_unit, summary, description, urgency, technician_id,
                reopen_count, developer_signed, buyer_signed,
                verification_status, inspection_outcome, created_at, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            cases_to_insert,
        )

        print(f"Inserting {len(photos_to_insert)} photos...")
        conn.executemany("INSERT INTO case_photos (case_id, path, kind, created_at) VALUES (?, ?, ?, ?)", photos_to_insert)

        print(f"Inserting {len(events_to_insert)} case events...")
        conn.executemany("INSERT INTO case_events (case_id, type, payload, created_at) VALUES (?, ?, ?, ?)", events_to_insert)

        print(f"Inserting {len(approvals_to_insert)} approvals...")
        conn.executemany("INSERT INTO approvals (approval_id, case_id, reasons, status, decided_by, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)", approvals_to_insert)

        print(f"Inserting {len(inspection_briefs_to_insert)} inspection briefs...")
        conn.executemany("INSERT INTO inspection_briefs (case_id, brief, created_at) VALUES (?, ?, ?)", inspection_briefs_to_insert)

        print(f"Inserting {len(systemic_issues_to_insert)} systemic issues...")
        conn.executemany(
            """
            INSERT INTO systemic_issues (
                issue_id, category, block, stack, related_cases, recurrence_count,
                confidence, detected_at, status, recommended_action, approval_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            systemic_issues_to_insert,
        )

        print(f"Inserting {len(verifications_to_insert)} verification records...")
        conn.executemany(
            "INSERT INTO verifications (verification_id, case_id, protocol, outcome, evidence_notes, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            verifications_to_insert,
        )

        print(f"Inserting {len(outbox_to_insert)} outbox email notifications...")
        conn.executemany(
            "INSERT INTO outbox (case_id, to_addr, subject, body, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            outbox_to_insert,
        )

        # Book slots for active live cases
        conn.execute("UPDATE slots SET case_id = 'L-001', kind = 'visit' WHERE slot_id = (SELECT slot_id FROM slots WHERE technician_id = 'T-03' AND start_at LIKE '%T09:00%' LIMIT 1)")
        conn.execute("UPDATE slots SET case_id = 'L-002', kind = 'repair' WHERE slot_id = (SELECT slot_id FROM slots WHERE technician_id = 'T-04' AND start_at LIKE '%T14:00%' LIMIT 1)")
        conn.execute("UPDATE slots SET case_id = 'L-005', kind = 'visit' WHERE slot_id = (SELECT slot_id FROM slots WHERE technician_id = 'T-02' AND start_at LIKE '%T11:00%' LIMIT 1)")

        conn.commit()

        # -------------------------------------------------------------------
        # 7. Generate Vector Embeddings
        # -------------------------------------------------------------------
        print(f"Generating vector embeddings with '{MODEL_NAME}' for {len(texts_for_embeddings)} cases...")
        from sentence_transformers import SentenceTransformer

        model = SentenceTransformer(MODEL_NAME)
        corpus = [t[1] for t in texts_for_embeddings]
        embeddings = model.encode(corpus, show_progress_bar=True, convert_to_numpy=True)

        emb_rows = []
        for (case_id, _), emb in zip(texts_for_embeddings, embeddings):
            vec_bytes = np.array(emb, dtype=np.float32).tobytes()
            emb_rows.append((case_id, MODEL_NAME, vec_bytes))

        conn.executemany("INSERT INTO case_embeddings (case_id, model, vector) VALUES (?, ?, ?)", emb_rows)
        conn.commit()
        print(f"Stored {len(emb_rows)} embeddings in case_embeddings table.")

        # Checkpoint WAL
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()

        # Sync to live simephony.db
        print("Syncing clean seed.db to live simephony.db...")
        src_c = sqlite3.connect(SEED_DB_PATH)
        src_c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        dst_c = sqlite3.connect(LIVE_DB_PATH)
        dst_c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        src_c.backup(dst_c)
        dst_c.commit()
        dst_c.close()
        src_c.close()
        print("seed_history.py completed successfully!")

    finally:
        pass


if __name__ == "__main__":
    seed_history()
