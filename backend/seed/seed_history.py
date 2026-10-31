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
        {"sub": "pipe_leak", "locs": ["under kitchen sink", "bathroom vanity", "yard washing machine tap"], "texts": [
            "Continuous dripping from PVC elbow connector under the basin cabinet.",
            "Leaking angle valve connection causing water pooling inside the cabinet.",
        ]},
        {"sub": "low_pressure", "locs": ["master bathroom shower", "kitchen faucet"], "texts": [
            "Water pressure suddenly dropped to a trickle from shower head.",
            "Weak flow from tap even when valve fully opened.",
        ]},
    ],
    "drainage": [
        {"sub": "slow_drain", "locs": ["shower floor trap", "balcony drain", "yard floor trap"], "texts": [
            "Shower floor trap draining very slowly; water ponds during normal shower.",
            "Balcony floor drain overflowed during heavy thunderstorm.",
        ]},
        {"sub": "foul_smell", "locs": ["master bathroom", "powder room"], "texts": [
            "Strong sewer stench emitting from dry floor trap.",
            "Unpleasant sewage gas smell coming through floor waste fitting.",
        ]},
    ],
    "sanitary_fittings": [
        {"sub": "loose_fitting", "locs": ["master bathroom", "common bathroom"], "texts": [
            "Toilet bowl rocking slightly when seated, base seal silicone degraded.",
            "Water closet dual flush button jammed down, water continuously filling tank.",
        ]},
    ],
    "electrical": [
        {"sub": "tripping_breaker", "locs": ["distribution board", "kitchen ring circuit"], "texts": [
            "RCCB breaker trips immediately whenever the induction hob is turned on.",
            "Main lighting sub-circuit tripping intermittently every evening.",
        ]},
        {"sub": "faulty_socket", "locs": ["living room TV wall", "master bedroom bedside"], "texts": [
            "Power socket faceplate loose and emits sparking noise when plug inserted.",
            "Double 13A socket dead; no output detected on multimeter.",
        ]},
    ],
    "wall_crack": [
        {"sub": "hairline_crack", "locs": ["living room plaster wall", "corridor hallway", "dining area"], "texts": [
            "Hairline plaster crack about 1.2m long running vertically above door frame.",
            "Multiple cosmetic hairline cracks branching across living room wall surface.",
        ]},
    ],
    "structural_crack": [
        {"sub": "beam_crack", "locs": ["living room ceiling beam", "balcony edge cantilever"], "texts": [
            "Diagonal structural crack exceeding 2mm across reinforced concrete beam.",
            "Noticeable fissure along slab joint with concrete spalling near edges.",
        ]},
    ],
    "tiles": [
        {"sub": "hollow_tiles", "locs": ["living room floor", "dining floor", "hallway"], "texts": [
            "Four adjacent 600x600 porcelain floor tiles sound completely hollow when tapped.",
            "Multiple tiles sounding drum-like and lifting slightly near entrance threshold.",
        ]},
        {"sub": "popping_tiles", "locs": ["living room floor", "bedroom 1 floor"], "texts": [
            "Floor tiles buckled and cracked upwards with loud popping sound overnight.",
            "Tent-shaped buckling of floor tiles across living room walkway.",
        ]},
    ],
    "ceiling": [
        {"sub": "cracked_plasterboard", "locs": ["foyer ceiling", "living room false ceiling"], "texts": [
            "Joint tape separation and hairline crack along plaster ceiling board.",
            "Ceiling sagging slightly near light trough with visible sagging seam.",
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
    print(f"Rebuilding seed database in {SEED_DB_PATH}...")
    for suffix in ("", "-wal", "-shm"):
        Path(f"{SEED_DB_PATH}{suffix}").unlink(missing_ok=True)
    seed_core()

    conn = db.connect(SEED_DB_PATH)
    cursor = conn.cursor()

    # Re-apply schema to make sure all 17 tables are initialized
    db.init_schema(SEED_DB_PATH)

    random.seed(20261019)
    now = datetime(2026, 10, 19, 9, 0, 0, tzinfo=timezone.utc)

    try:
        cases_to_insert = []
        assignment_history_to_insert = []
        photos_to_insert = []
        events_to_insert = []
        verifications_to_insert = []
        outbox_to_insert = []
        approvals_to_insert = []
        systemic_issues_to_insert = []
        inspection_briefs_to_insert = []
        case_links_to_insert = []
        buyer_messages_to_insert = []
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
            occurrence_count: int = 1,
            missing_info: list[str] | None = None,
            follow_up_question: str | None = None,
            triage_reason: str | None = None,
            verdict_note: str | None = None,
            verdict_at: datetime | None = None,
            repair_note: str | None = None,
            repaired_at: datetime | None = None,
            verification_status: str = "pending",
            inspection_outcome: str | None = "VALID_DEFECT",
            buyer_signed: int = 1,
            developer_signed: int = 1,
            buyer_signed_at: datetime | None = None,
            buyer_signoff_note: str | None = None,
            developer_signed_at: datetime | None = None,
            developer_signed_by: str | None = None,
            verification_result: str | None = None,
            verification_note: str | None = None,
            related_case_links: list[tuple[str, str, float]] | None = None,
            assignment_attempts: int | None = None,
            booking_status: str | None = None,
            assignment_slot_id: str | None = None,
        ):
            buyer = conn.execute(
                "SELECT buyer_id FROM buyers WHERE unit_id = ?", (unit_id,)
            ).fetchone()
            if buyer is None:
                raise RuntimeError(f"No buyer is seeded for unit {unit_id}")
            buyer_id = buyer["buyer_id"]
            attempt_count = assignment_attempts
            if attempt_count is None:
                attempt_count = 0 if status in ("SUBMITTED", "INFO_NEEDED") else 1
            current_booking_status = booking_status
            if current_booking_status is None:
                if status in ("VISIT_SCHEDULED", "REPAIR_BOOKED"):
                    current_booking_status = "CONFIRMED"

            # Calculate realistic timestamps if not explicitly passed
            t_verdict = verdict_at.isoformat() if verdict_at else None
            t_repaired = repaired_at.isoformat() if repaired_at else None
            t_buyer_signed = buyer_signed_at.isoformat() if buyer_signed_at else None
            t_dev_signed = developer_signed_at.isoformat() if developer_signed_at else None

            if status in ("VALID", "REPAIR_BOOKED", "REPAIRED", "PENDING_SIGNOFF", "CLOSED", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION") and not t_verdict:
                t_verdict = (created_at + timedelta(days=2)).isoformat()
            if status in ("REPAIRED", "PENDING_SIGNOFF", "CLOSED", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION") and not t_repaired:
                t_repaired = (created_at + timedelta(days=5)).isoformat()
            if buyer_signed and not t_buyer_signed and closed_at:
                t_buyer_signed = closed_at.isoformat()
            if developer_signed and not t_dev_signed and closed_at:
                t_dev_signed = closed_at.isoformat()
                developer_signed_by = developer_signed_by or "SDP Site Supervisor"

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
                json.dumps(missing_info) if missing_info else None,
                follow_up_question,
                occurrence_count,
                attempt_count,
                current_booking_status,
                triage_reason or f"Assigned to {technician_id} based on skill '{category}' and availability in Block {unit_id.split('-')[0]}",
                verdict_note or ("Technician inspected: verified valid defect requiring rectification." if status not in ("INVALID", "SUBMITTED", "INFO_NEEDED", "VISIT_SCHEDULED") else None),
                t_verdict,
                repair_note or ("Completed repair works and tested functionality." if status in ("REPAIRED", "PENDING_SIGNOFF", "CLOSED", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION") else None),
                t_repaired,
                technician_id,
                reopen_count,
                developer_signed,
                buyer_signed,
                t_buyer_signed,
                buyer_signoff_note or ("Resident confirmed rectification is satisfactory." if buyer_signed else None),
                t_dev_signed,
                developer_signed_by,
                verification_status,
                inspection_outcome,
                created_at.isoformat(),
                closed_at.isoformat() if closed_at else None,
            ))

            if attempt_count:
                assignment_history_to_insert.append((
                    f"AH-{len(assignment_history_to_insert) + 1:04d}",
                    case_id,
                    technician_id,
                    assignment_slot_id,
                    "ACCEPTED",
                    None,
                    (created_at + timedelta(hours=2)).isoformat(),
                ))

            embed_text = f"{summary}. {description}. Category: {category} ({sub_category}). Location: {location} in unit {unit_id}."
            texts_for_embeddings.append((case_id, embed_text))

            photos_to_insert.append((case_id, f"sample_{category}_original.jpg", "original", created_at.isoformat()))

            t = created_at
            events_to_insert.append((case_id, "case.created", json.dumps({"summary": summary, "category": category}), t.isoformat()))
            events_to_insert.append((case_id, "agent.step", json.dumps({"agent": "IntakeAgent", "message": f"Classified as {category} > {sub_category}"}), (t + timedelta(minutes=2)).isoformat()))

            # In-app message & outbox for creation
            buyer_messages_to_insert.append((case_id, "Case Submitted", f"Your report for '{summary}' has been received and is being processed.", t.isoformat()))

            t += timedelta(hours=2)
            events_to_insert.append((case_id, "case.assigned", json.dumps({"technician_id": technician_id}), t.isoformat()))
            if status in ("VISIT_SCHEDULED", "REPAIR_BOOKED"):
                events_to_insert.append((
                    case_id,
                    "booking.requested",
                    json.dumps({
                        "technician_id": technician_id,
                        "slot_id": assignment_slot_id,
                        "booking_status": current_booking_status,
                    }),
                    t.isoformat(),
                ))
            if status in ("VISIT_SCHEDULED", "REPAIR_BOOKED"):
                events_to_insert.append((
                    case_id,
                    "booking.confirmed",
                    json.dumps({
                        "technician_id": technician_id,
                        "slot_id": assignment_slot_id,
                        "booking_status": "CONFIRMED",
                    }),
                    (t + timedelta(minutes=5)).isoformat(),
                ))
            events_to_insert.append((case_id, "email.sent", json.dumps({"to": "buyer", "subject": f"[{case_id}] Case assigned"}), t.isoformat()))
            outbox_to_insert.append((case_id, f"{buyer_id}@example.com", f"[{case_id}] Technician Assigned", f"Hi, technician {technician_id} has been assigned for {summary}.", "sent", None, t.isoformat()))
            buyer_messages_to_insert.append((case_id, "Technician Assigned", f"Technician {technician_id} has been assigned to inspect your defect.", t.isoformat()))

            if status in ("VALID", "REPAIR_BOOKED", "REPAIRED", "PENDING_SIGNOFF", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION", "CLOSED"):
                t += timedelta(days=2)
                events_to_insert.append((case_id, "verdict.recorded", json.dumps({"outcome": "VALID", "note": verdict_note or "Verified defect on site."}), t.isoformat()))
                photos_to_insert.append((case_id, f"sample_{category}_verdict.jpg", "verdict", t.isoformat()))
                buyer_messages_to_insert.append((case_id, "Inspection Verdict", "Technician inspected the defect on site and confirmed it is a valid defect.", t.isoformat()))

            if status in ("REPAIR_BOOKED", "REPAIRED", "PENDING_SIGNOFF", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION", "CLOSED"):
                t += timedelta(days=1)
                events_to_insert.append((case_id, "repair.booked", json.dumps({"slot": (t + timedelta(days=2)).isoformat()}), t.isoformat()))
                buyer_messages_to_insert.append((case_id, "Repair Booked", "A repair slot has been scheduled with the contractor.", t.isoformat()))

            if status in ("REPAIRED", "PENDING_SIGNOFF", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION", "CLOSED"):
                t += timedelta(days=3)
                events_to_insert.append((case_id, "repair.done", json.dumps({"note": repair_note or "Repairs completed by technician."}), t.isoformat()))
                photos_to_insert.append((case_id, f"sample_{category}_repair.jpg", "repair", t.isoformat()))
                events_to_insert.append((case_id, "verification.requested", json.dumps({"protocol": f"{category}_protocol"}), (t + timedelta(minutes=10)).isoformat()))
                buyer_messages_to_insert.append((case_id, "Repair Completed", "The repair is done. Please follow the verification guide to confirm.", t.isoformat()))

            if verification_result:
                t += timedelta(days=1)
                events_to_insert.append((case_id, "verification.completed", json.dumps({"result": verification_result, "note": verification_note}), t.isoformat()))
                verifications_to_insert.append((
                    f"V-{len(verifications_to_insert) + 1:04d}",
                    case_id,
                    f"Standard {category} verification procedure",
                    verification_result,
                    verification_note,
                    None,  # photo_path: verification photos live in case_photos
                    (t - timedelta(days=1)).isoformat(), # created_at
                    t.isoformat() if verification_result in ("FIXED", "NOT_FIXED") else None, # completed_at
                ))

            if reopen_count > 0:
                t += timedelta(days=5)
                events_to_insert.append((case_id, "case.reopened", json.dumps({"reason": "Defect returned during rain."}), t.isoformat()))
                photos_to_insert.append((case_id, f"sample_{category}_reopen.jpg", "reopen", t.isoformat()))
                events_to_insert.append((case_id, "recurrence.detected", json.dumps({"occurrence": occurrence_count}), (t + timedelta(minutes=5)).isoformat()))
                buyer_messages_to_insert.append((case_id, "Case Reopened", "Case reopened following your verification feedback. We are investigating further.", t.isoformat()))

            if status == "CLOSED" and closed_at:
                events_to_insert.append((case_id, "signoff.completed", json.dumps({"both_signed": True}), (closed_at - timedelta(hours=1)).isoformat()))
                events_to_insert.append((case_id, "case.closed", json.dumps({"closed_by": "verification_completed"}), closed_at.isoformat()))
                buyer_messages_to_insert.append((case_id, "Case Closed", "Both resident and developer sign-offs complete. Case is now officially closed.", closed_at.isoformat()))

            # Store related case links if provided
            if related_case_links:
                for rel_cid, reason, score in related_case_links:
                    case_links_to_insert.append((case_id, rel_cid, reason, score, created_at.isoformat()))

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
            occurrence_count=1,
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
            occurrence_count=2,
            reopen_count=1,
            created_at=c2_time,
            closed_at=c2_time + timedelta(days=15),
            verification_status="verified",
            inspection_outcome="VALID_DEFECT",
            verification_result="FIXED",
            verification_note="Sealant reapplied by technician and verified dry.",
            related_case_links=[("H-0001", "Same unit A-12-08, previous ceiling leak incident", 0.94)],
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
                occurrence_count=2 if "11" in uid else 1,
                reopen_count=1 if "11" in uid else 0,
                created_at=ct,
                closed_at=ct + timedelta(days=days_to_close),
                verification_status="verified",
                inspection_outcome="VALID_DEFECT",
                verification_result="FIXED",
                verification_note="Tested and confirmed dry.",
                related_case_links=[("H-0002", "Same vertical stack A-08 drainage riser line", 0.88)],
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
                occurrence_count=1,
                reopen_count=1 if uid == "B-6-03" else 0,
                created_at=ct,
                closed_at=ct + timedelta(days=days_to_close),
                verification_status="verified",
                inspection_outcome="VALID_DEFECT",
                verification_result="FIXED",
                verification_note="Defective tiles replaced.",
            )

        systemic_issues_to_insert.append((
            "SI-001",
            "Hollow floor tiles cluster in Stack B-03",
            "tiles",
            "B",
            "03",
            json.dumps(si1_case_ids),
            len(si1_case_ids),
            1, # reopened_count
            0.78,
            (now - timedelta(days=60)).isoformat(),
            "monitoring",
            "Screed bonding check on stack B-03 floors; monitor for 3 months.",
            "APR-0001",
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
            booking_status = None

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
                    status = "VISIT_SCHEDULED"
                    booking_status = "PENDING"
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
                    status = "PENDING_SIGNOFF"
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
                booking_status=booking_status,
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
            ("C-0001", "B-7-02", "electrical", "tripping_breaker", "kitchen", "Main circuit breaker trips intermittently", "VISIT_SCHEDULED", "high", "T-03", 0, -2, 2, "pending", None, 0, 0),
            ("C-0002", "C-3-05", "tiles", "hollow_tiles", "living room", "Several floor tiles sound hollow when stepped on", "REPAIR_BOOKED", "normal", "T-04", 0, -5, 3, "pending", "VALID_DEFECT", 0, 0),
            ("C-0003", "A-4-01", "door_window", "sliding_door_stuck", "balcony", "Balcony sliding door off track and sticking", "VALID", "normal", "T-05", 0, -3, None, "pending", "VALID_DEFECT", 0, 0),
            ("C-0004", "B-14-09", "paint", "paint_peeling", "bedroom 2", "Paint bubbling and flaking near window skirting", "PENDING_SIGNOFF", "normal", "T-04", 0, -7, None, "pending", "VALID_DEFECT", 0, 1),
            ("C-0005", "C-10-04", "drainage", "slow_drain", "shower floor", "Shower floor drain stagnant, water pools for hours", "VISIT_SCHEDULED", "normal", "T-02", 0, -1, 1, "pending", None, 0, 0),
            ("C-0006", "A-6-10", "wall_crack", "hairline_crack", "living room", "Superficial hairline plaster crack above door", "INVALID", "low", "T-04", 0, -4, None, "not_verified", "NOT_A_DEFECT", 0, 1),
            ("C-0007", "C-12-01", "plumbing", "pipe_leak", "kitchen sink", "Slow dripping under kitchen sink drain pipe", "REPAIRED", "normal", "T-02", 0, -4, None, "pending", "VALID_DEFECT", 0, 0),
            ("C-0008", "B-3-08", "water_leak", "ceiling_leak", "bathroom", "Ceiling moisture mark reappeared after rain", "REOPENED", "high", "T-01", 1, -6, None, "not_verified", "VALID_DEFECT", 0, 0),
            ("C-0009", "C-8-06", "sanitary_fittings", "loose_fitting", "master bathroom", "Toilet flush button sticking and constantly running", "SUBMITTED", "normal", "T-02", 0, 0, None, "pending", None, 0, 0),
            ("C-0010", "A-2-05", "electrical", "faulty_socket", "living room", "Power socket sparks when TV plugged in", "VISIT_SCHEDULED", "high", "T-03", 0, -1, None, "pending", None, 0, 0),
            ("C-0011", "B-11-03", "structural_crack", "beam_crack", "balcony", "Noticed 2mm diagonal crack on balcony beam", "ESCALATION_PENDING", "high", "T-04", 2, -3, None, "pending", "VALID_DEFECT", 0, 0),
            ("C-0013", "A-3-02", "water_leak", "wall_seepage", "living room", "Wall dampness reported without photo or exact room", "INFO_NEEDED", "normal", "T-01", 0, -1, None, "pending", None, 0, 0),
            ("C-0014", "A-12-08", "water_leak", "ceiling_leak", "bathroom ceiling", "Ceiling leak needs a technician visit", "VISIT_SCHEDULED", "high", "T-02", 0, 0, None, "pending", None, 0, 0),
        ]

        # What the buyer wrote, and the technician's inspection and repair notes (only for cases that got that far).
        live_text = {
            "C-0001": ("The main circuit breaker in the DB box trips 2-3 times a day, usually when the kettle and microwave in the kitchen "
                       "run together. The whole unit loses power each time.", None, None),
            "C-0002": ("Several floor tiles in the living room near the sofa sound hollow when we walk on them, and one tile edge has started to lift.",
                       "Tap test confirmed 6 hollow tiles in a 1.5 m x 1 m area near the sofa; one tile edge lifted about 2 mm. Poor adhesive "
                       "coverage under the tiles. Valid defect: hollow tiles to be hacked out and re-laid.", None),
            "C-0003": ("The balcony sliding door is hard to open and keeps coming off the bottom track. It scrapes and gets stuck halfway.",
                       "Bottom rollers on the sliding panel are worn and the track is dented near the lock side, so the panel jumps the track. "
                       "Valid defect: replace both bottom rollers and straighten the track.", None),
            "C-0004": ("Paint on the wall below the window in bedroom 2 is bubbling and flaking off near the skirting. The wall feels damp after heavy rain.",
                       "Paint blistering over a 60 cm wide area below the window sill. Moisture reading high at the sill corner: rainwater is getting "
                       "in through a gap in the window frame sealant. Valid defect.",
                       "Resealed the window frame with silicone, scraped off the loose paint, applied sealer primer and two coats of matching "
                       "emulsion once the wall was dry."),
            "C-0005": ("The floor drain in the shower area drains very slowly. Water stays pooled for hours after a shower and starts to smell.", None, None),
            "C-0006": ("There is a thin crack in the plaster above the living room door frame.",
                       "Hairline shrinkage crack in the skim coat only, under 0.3 mm wide, with no movement and not through to the blockwork. "
                       "Cosmetic, not a developer defect.", None),
            "C-0007": ("Water is dripping slowly from the drain pipe under the kitchen sink. The cabinet base is wet and starting to swell.",
                       "Slip joint on the sink waste pipe is loose and its washer is cracked; it drips every few seconds when the sink is used. Valid defect.",
                       "Replaced the cracked washer and the bottle trap, re-tightened all joints and ran the sink at full flow for 10 minutes: "
                       "no drips. Dried out the cabinet base."),
            "C-0008": ("A brown moisture mark on the bathroom ceiling came back after heavy rain, in the same spot that was repaired before.",
                       "Damp patch about 40 cm across on the bathroom ceiling board with a high moisture reading. Leak traced to the floor trap "
                       "of the bathroom above. Valid defect.",
                       "Resealed the floor trap joint in the unit above, replaced the stained ceiling board and repainted. Area dry on completion."),
            "C-0009": ("The toilet flush button in the master bathroom sticks after flushing and the water keeps running into the bowl until I jiggle it.", None, None),
            "C-0010": ("The power socket behind the TV in the living room sparks when I plug in the TV, and there is a burning smell. We have stopped using it.", None, None),
            "C-0011": ("There is a diagonal crack about 2 mm wide on the balcony beam. It was patched before but has opened up again.",
                       "Diagonal crack 2 mm wide and 45 cm long at the beam end near the column, running through the plaster into the concrete. "
                       "Valid defect: needs crack injection and monitoring.",
                       "Injected the crack with epoxy resin, re-plastered and painted, and fixed a crack monitoring gauge across it."),
            "C-0013": ("There is dampness on the wall, the paint looks wet and there is a musty smell.", None, None),
            "C-0014": ("The bathroom ceiling is leaking again. Water drips from the ceiling near the light after the unit upstairs showers.", None, None),
        }

        for cid, uid, cat, sub, loc, summary, status, urg, tid, reopens, created_offset, slot_offset, vstatus, outcome, b_sign, dev_sign in live_cases:
            description, verdict_note, repair_note = live_text[cid]
            ct = now + timedelta(days=created_offset)
            cl_at = ct + timedelta(days=2) if status == "INVALID" else None
            assignment_slot_id = None
            if cid == "C-0014":
                accepted_slot = cursor.execute(
                    "SELECT slot_id FROM slots WHERE technician_id = ? AND start_at LIKE ? ORDER BY start_at LIMIT 1",
                    ("T-02", "2026-10-20T11:00%"),
                ).fetchone()
                rejected_slot = cursor.execute(
                    "SELECT slot_id FROM slots WHERE technician_id = ? AND start_at LIKE ? ORDER BY start_at LIMIT 1",
                    ("T-01", "2026-10-20T09:00%"),
                ).fetchone()
                if accepted_slot is None or rejected_slot is None:
                    raise RuntimeError("Unable to find slots for the seeded assignment negotiation")
                assignment_slot_id = accepted_slot["slot_id"]

            missing =["room_location", "clear_photo"] if status == "INFO_NEEDED" else None
            follow_q = "Could you please specify which room has the wall dampness and attach a close-up photo?" if status == "INFO_NEEDED" else None

            add_case(
                case_id=cid,
                unit_id=uid,
                category=cat,
                sub_category=sub,
                location=loc,
                summary=summary,
                description=description,
                urgency=urg,
                status=status,
                missing_info=missing,
                follow_up_question=follow_q,
                technician_id=tid,
                occurrence_count=3 if cid == "C-0011" else 1,
                reopen_count=reopens,
                created_at=ct,
                closed_at=cl_at,
                verification_status=vstatus,
                inspection_outcome=outcome,
                buyer_signed=b_sign,
                developer_signed=dev_sign,
                verdict_note=verdict_note,
                verdict_at=ct + timedelta(days=2) if status == "INVALID" else None,
                repair_note=repair_note,
                verification_result="NOT_FIXED" if status == "REOPENED" else None,
                verification_note="The stain came back after the heavy rain on Sunday, in the same place as before." if status == "REOPENED" else None,
                assignment_attempts=2 if cid == "C-0014" else None,
                booking_status="PENDING" if cid == "C-0010" else None,
                assignment_slot_id=assignment_slot_id,
            )
            if cid == "C-0014":
                rejection_time = ct + timedelta(hours=1)
                assignment_history_to_insert.append((
                    f"AH-{len(assignment_history_to_insert) + 1:04d}",
                    cid,
                    "T-01",
                    rejected_slot["slot_id"],
                    "REJECTED",
                    "Emergency elsewhere",
                    rejection_time.isoformat(),
                ))
                events_to_insert.extend([
                    (
                        cid,
                        "booking.requested",
                        json.dumps({"technician_id": "T-01", "slot_id": rejected_slot["slot_id"]}),
                        rejection_time.isoformat(),
                    ),
                    (
                        cid,
                        "booking.rejected",
                        json.dumps({
                            "technician_id": "T-01",
                            "slot_id": rejected_slot["slot_id"],
                            "reason": "Emergency elsewhere",
                        }),
                        (rejection_time + timedelta(minutes=5)).isoformat(),
                    ),
                ])

        # -------------------------------------------------------------------
        # 5. Seed SI-002 (Stack A-08 Leaks) & Pending Approval
        # -------------------------------------------------------------------
        print("Seeding SI-002 (Stack A-08 Leaks) & pending escalation approval...")
        si2_related = ["H-0001", "H-0002", "H-0003", "H-0004", "H-0005", "H-0006", "H-0007"]
        systemic_issues_to_insert.append((
            "SI-002",
            "Ceiling leak & riser seepage - Stack A-08",
            "water_leak",
            "A",
            "08",
            json.dumps(si2_related),
            len(si2_related),
            2, # reopened_count
            0.92,
            (now - timedelta(days=1)).isoformat(),
            "open",
            "Extra inspection of unit A-12-08 and stack A-08 shared drainage riser pipe.",
            "APR-0002",
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
                location_in_unit, summary, description, urgency,
                missing_info, follow_up_question, occurrence_count,
                assignment_attempts, booking_status,
                triage_reason, verdict_note, verdict_at, repair_note,
                repaired_at, technician_id, reopen_count, developer_signed,
                buyer_signed, buyer_signed_at, buyer_signoff_note,
                developer_signed_at, developer_signed_by, verification_status,
                inspection_outcome, created_at, closed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            cases_to_insert,
        )

        print(f"Inserting {len(assignment_history_to_insert)} assignment attempts...")
        conn.executemany(
            """
            INSERT INTO assignment_history (
                assignment_id, case_id, technician_id, slot_id, outcome,
                rejected_reason, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            assignment_history_to_insert,
        )

        print(f"Inserting {len(photos_to_insert)} photos...")
        conn.executemany(
            "INSERT INTO case_photos (photo_id, case_id, path, kind, created_at) VALUES (?, ?, ?, ?, ?)",
            [(f"CP-{index:04d}", *row) for index, row in enumerate(photos_to_insert, start=1)],
        )

        print(f"Inserting {len(events_to_insert)} case events...")
        conn.executemany(
            "INSERT INTO case_events (event_id, case_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
            [(f"CE-{index:04d}", *row) for index, row in enumerate(events_to_insert, start=1)],
        )

        print(f"Inserting {len(approvals_to_insert)} approvals...")
        conn.executemany("INSERT INTO approvals (approval_id, case_id, reasons, status, decided_by, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)", approvals_to_insert)

        print(f"Inserting {len(inspection_briefs_to_insert)} inspection briefs...")
        conn.executemany("INSERT INTO inspection_briefs (case_id, brief, created_at) VALUES (?, ?, ?)", inspection_briefs_to_insert)

        print(f"Inserting {len(systemic_issues_to_insert)} systemic issues...")
        conn.executemany(
            """
            INSERT INTO systemic_issues (
                issue_id, title, category, block, stack, related_cases,
                recurrence_count, reopened_count, confidence, detected_at,
                status, recommended_action, approval_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            systemic_issues_to_insert,
        )

        print(f"Inserting {len(verifications_to_insert)} verification records...")
        conn.executemany(
            "INSERT INTO verifications (verification_id, case_id, protocol, outcome, evidence_notes, photo_path, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            verifications_to_insert,
        )

        print(f"Inserting {len(case_links_to_insert)} case links...")
        conn.executemany(
            "INSERT INTO case_links (case_id, related_case_id, reason, score, created_at) VALUES (?, ?, ?, ?, ?)",
            case_links_to_insert,
        )

        print(f"Inserting {len(buyer_messages_to_insert)} buyer messages...")
        conn.executemany(
            "INSERT INTO buyer_messages (message_id, case_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
            [(f"BM-{index:04d}", *row) for index, row in enumerate(buyer_messages_to_insert, start=1)],
        )

        print(f"Inserting {len(outbox_to_insert)} outbox email notifications...")
        conn.executemany(
            "INSERT INTO outbox (email_id, case_id, to_addr, subject, body, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [(f"OB-{index:04d}", *row) for index, row in enumerate(outbox_to_insert, start=1)],
        )

        # Occupy a slot only after the seeded case has a confirmed booking.
        confirmed_bookings = [
            ("C-0001", "T-03", "%T09:00%", "visit"),
            ("C-0002", "T-04", "%T14:00%", "repair"),
            ("C-0005", "T-02", "%T11:00%", "visit"),
        ]
        for case_id, technician_id, start_pattern, kind in confirmed_bookings:
            slot = cursor.execute(
                "SELECT slot_id FROM slots WHERE technician_id = ? AND start_at LIKE ? ORDER BY start_at LIMIT 1",
                (technician_id, start_pattern),
            ).fetchone()
            if slot is None:
                raise RuntimeError(f"Unable to find confirmed booking slot for {case_id}")
            cursor.execute(
                """
                UPDATE slots
                SET case_id = ?, kind = ?
                WHERE slot_id = ?
                  AND EXISTS (
                      SELECT 1 FROM cases
                      WHERE case_id = ? AND booking_status = 'CONFIRMED'
                  )
                """,
                (case_id, kind, slot["slot_id"], case_id),
            )
            cursor.execute(
                """
                UPDATE assignment_history
                SET slot_id = ?
                WHERE case_id = ? AND outcome = 'ACCEPTED'
                """,
                (slot["slot_id"], case_id),
            )

        accepted_slot = cursor.execute(
            "SELECT slot_id FROM slots WHERE technician_id = ? AND start_at LIKE ? ORDER BY start_at LIMIT 1",
            ("T-02", "2026-10-20T11:00%"),
        ).fetchone()
        if accepted_slot is None:
            raise RuntimeError("Unable to find confirmed booking slot for C-0014")
        cursor.execute(
            """
            UPDATE slots
            SET case_id = ?, kind = 'visit'
            WHERE slot_id = ?
              AND EXISTS (
                  SELECT 1 FROM cases
                  WHERE case_id = ? AND booking_status = 'CONFIRMED'
              )
            """,
            (
                "C-0014",
                accepted_slot["slot_id"],
                "C-0014",
            ),
        )

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
        # Same as "Reset demo": add the web app's columns, clock and subcontractors, or the API fails on the copy.
        from demo_api.migrate import migrate  # noqa: E402
        with db.get_conn(LIVE_DB_PATH) as live:
            migrate(live)
        print("seed_history.py completed successfully!")

    finally:
        pass


if __name__ == "__main__":
    seed_history()
