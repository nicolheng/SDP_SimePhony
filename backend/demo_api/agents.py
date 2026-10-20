"""Rule-based stand-ins for the agents (CONTRACTS.md §7). Same behaviour the web app used in the browser,
now running on the server against the database. P2's LangGraph agents can replace these one by one."""
import re
from datetime import datetime

from . import config
from .timeutil import add_days, fmt_date, fmt_datetime, local_day, parse, slot_iso

# ---------- IntakeAgent ----------

CATEGORY_RULES = [
    (r"bocor|leak|seep|drip|titis|basah|damp|lembap|water stain|air masuk", "water_leak", "Water leak"),
    (r"spark|socket|plug|switch|suis|lampu|light|breaker|trip|wiring|elektrik|power", "electrical", "Electrical fault"),
    (r"crack|retak", "wall_crack", "Crack"),
    (r"tile|jubin|hollow|kopak", "tiles", "Tile defect"),
    (r"door|pintu|window|tingkap|hinge|engsel|lock|kunci|sliding", "door_window", "Door / window defect"),
    (r"drain|clog|sumbat|longkang|floor trap", "drainage", "Drainage issue"),
    (r"toilet|tandas|flush|basin|sink|singki|tap|paip", "sanitary_fittings", "Sanitary fitting issue"),
    (r"paint|peel|mengelupas|\bcat\b", "paint", "Paint defect"),
]
LOCATION_RULES = [
    (r"master|bilik utama", "Master bedroom"),
    (r"kitchen|dapur", "Kitchen"),
    (r"bathroom|bilik air|toilet|tandas", "Bathroom"),
    (r"living|ruang tamu|hall", "Living room"),
    (r"dining|makan", "Dining area"),
    (r"balcony|balkoni", "Balcony"),
    (r"bedroom|bilik", "Bedroom"),
    (r"entrance|main door|pintu utama", "Main entrance"),
]


def _has(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.I) is not None


def intake(description: str, has_photo: bool) -> dict:
    text = description.strip()
    if _has(r"noisy|bising|neighbou?r|jiran|parking|security guard", text) and not any(_has(p, text) for p, _, _ in CATEGORY_RULES):
        return {
            "non_defect": "This sounds like a building management matter rather than a defect in your unit. Please contact your "
            "Joint Management Body; defect reports cover the unit's construction and fittings."
        }
    rule = next((r for r in CATEGORY_RULES if _has(r[0], text)), None)
    category = rule[1] if rule else "other"
    sub = rule[2] if rule else "General defect"
    if category == "water_leak":
        sub = "Ceiling leak" if _has(r"ceiling|siling|atas", text) else "Wall seepage" if _has(r"wall|dinding", text) else "Water leak"
    location = next((loc for p, loc in LOCATION_RULES if _has(p, text)), "")

    missing = []
    if not location:
        missing.append("location_in_unit")
    if len(text) < 15:
        missing.append("description_detail")
    if not has_photo:
        missing.append("photo")

    urgency = "normal"
    if (category == "water_leak" and _has(r"ceiling|siling|socket|light|lampu|banjir|flood|heavy|teruk", text)) or _has(r"spark|burn|hangus|exposed wire|smell", text):
        urgency = "high"
    elif category == "paint" or _has(r"hairline|halus|minor|sikit", text):
        urgency = "low"

    question = (
        "Which room is this in, and roughly where (e.g. ceiling above the wardrobe)?"
        if "location_in_unit" in missing
        else "Could you describe what you see in a little more detail (size, when it started)?"
        if "description_detail" in missing
        else None
    )
    return {
        "category": category,
        "sub_category": sub,
        "location_in_unit": location,
        "summary": f"{sub} in {location.lower()}" if location else sub,
        "urgency": urgency,
        "missing_info": missing,
        "follow_up_question": question,
    }


# ---------- SimilarDefectAgent ----------


def similar(ctx, case: dict) -> dict:
    unit = ctx.units[case["unit_id"]]
    others = [x for x in ctx.all_cases() if x["case_id"] != case["case_id"] and x["category"] == case["category"] and x["status"] != "INVALID"]
    same_unit = [x for x in others if x["unit_id"] == case["unit_id"]]
    same_stack = [
        x for x in others if x["unit_id"] != case["unit_id"] and ctx.units[x["unit_id"]]["block"] == unit["block"] and ctx.units[x["unit_id"]]["stack"] == unit["stack"]
    ]
    refs = [
        {"case_id": x["case_id"], "unit_id": x["unit_id"], "at": x["created_at"], "reason": f"Same unit: {(x['sub_category'] or '').replace('_', ' ').lower()} on {fmt_date(x['created_at'])}"}
        for x in same_unit
    ]
    for x in same_stack:
        u = ctx.units[x["unit_id"]]
        where = "next door" if u["floor"] == unit["floor"] else f"{u['floor'] - unit['floor']} floor(s) above" if u["floor"] > unit["floor"] else f"{unit['floor'] - u['floor']} floor(s) below"
        refs.append({"case_id": x["case_id"], "unit_id": x["unit_id"], "at": x["created_at"], "reason": f"Same stack {unit['block']}-{unit['stack']}, {where}"})
    return {"refs": refs[:8], "occurrence": len(same_unit) + 1, "stack_units": sorted({x["unit_id"] for x in same_stack})}


# ---------- Slots & TriageAgent ----------


def upcoming_slots(now: str, days: int = config.BOOKING_WINDOW_DAYS) -> list[str]:
    out = []
    for d in range(1, days + 4):
        day = local_day(add_days(now, d))
        if datetime.fromisoformat(f"{day}T12:00:00+08:00").weekday() == 6:  # no Sunday visits
            continue
        out.extend(slot_iso(day, t) for t in config.SLOT_TIMES)
        if len(out) >= days * len(config.SLOT_TIMES):
            break
    return out


def busy(ctx, worker_id: str, start: str) -> bool:
    s = parse(start)
    e = parse(add_days(start, config.SLOT_HOURS / 24))
    return any(b["technician_id"] == worker_id and b["start"] < e and b["end"] > s for b in ctx.bookings())


def technicians_for(ctx, category: str, block: str) -> list[dict]:
    skills = config.skills_for(category)
    return [w for w in ctx.workers if w["kind"] == "technician" and block in w["blocks"] and set(w["skills"]) & set(skills)]


def free_slots_for(ctx, category: str, block: str) -> list[str]:
    techs = technicians_for(ctx, category, block)
    return [s for s in upcoming_slots(ctx.now) if any(not busy(ctx, t["technician_id"], s) for t in techs)]


def any_free_visit_slots(ctx) -> list[str]:
    """Visit slots where at least one in-house technician is free (category not known yet)."""
    techs = [w for w in ctx.workers if w["kind"] == "technician"]
    return [s for s in upcoming_slots(ctx.now) if any(not busy(ctx, t["technician_id"], s) for t in techs)]


def triage(ctx, case: dict, preferred: str | None) -> dict:
    unit = ctx.units[case["unit_id"]]
    techs = technicians_for(ctx, case["category"], unit["block"])
    if not techs:
        raise ValueError(f"No in-house technician covers {config.CATEGORY_LABEL.get(case['category'], case['category'])} in Block {unit['block']}.")
    skill = " / ".join(config.skills_for(case["category"]))
    label = config.CATEGORY_LABEL.get(case["category"], case["category"])
    if preferred:
        free = next((t for t in techs if not busy(ctx, t["technician_id"], preferred)), None)
        if free:
            return {"technician_id": free["technician_id"], "slot": preferred,
                    "reason": f"{label} needs {skill}; {free['name']} covers Block {unit['block']} and is free {fmt_datetime(preferred)}."}
    options = free_slots_for(ctx, case["category"], unit["block"])
    if not options:
        raise ValueError("No technician is free in the next 2 weeks.")
    slot = options[0]
    tech = next(t for t in techs if not busy(ctx, t["technician_id"], slot))
    return {"technician_id": tech["technician_id"], "slot": slot,
            "reason": f"No {skill} technician free at the chosen time; booked {tech['name']} at the earliest alternative, {fmt_datetime(slot)}."}


# ---------- Repair allocation ----------


def repairers_for(ctx, case: dict, any_kind: bool = False) -> list[dict]:
    """Workers with the trade for this repair: the planned kind (in-house or subcontractor) first, or anyone qualified."""
    plan = config.REPAIR_PLAN.get(case["category"], config.REPAIR_PLAN["other"])
    block = ctx.units[case["unit_id"]]["block"]
    fits = [w for w in ctx.workers if block in w["blocks"] and set(w["skills"]) & set(plan["skills"])]
    planned = [w for w in fits if w["kind"] == plan["by"]]
    return fits if any_kind else planned or fits


def repair_blocks(hours: float) -> int:
    return min(len(config.SLOT_TIMES), max(1, -(-int(hours * 10) // (config.SLOT_HOURS * 10))))


def fmt_hours(h: float) -> str:
    if h >= 8:
        return "about 1 day"
    n = f"{h:.1f}" if h % 1 else f"{int(h)}"
    return f"about {n} hour{'' if h == 1 else 's'}"


def repair_options(ctx, case: dict, pool: list[dict] | None = None) -> list[dict]:
    plan = config.REPAIR_PLAN.get(case["category"], config.REPAIR_PLAN["other"])
    n = repair_blocks(plan["hours"])
    pool = repairers_for(ctx, case) if pool is None else pool
    # Jobs stay within one session: 1 block any time, 2 blocks morning or afternoon, longer = from 9am.
    starts = list(range(len(config.SLOT_TIMES))) if n == 1 else [0, 2] if n == 2 else [0]
    days = sorted({local_day(s) for s in upcoming_slots(ctx.now)})
    out = []
    for day in days:
        for i in starts:
            times = config.SLOT_TIMES[i:i + n]
            if len(times) < n:
                continue
            slots = [slot_iso(day, t) for t in times]
            worker_ids = [w["technician_id"] for w in pool if all(not busy(ctx, w["technician_id"], s) for s in slots)]
            if worker_ids:
                out.append({"start": slots[0], "slots": slots, "workerIds": worker_ids})
    return out


def subcontractor_for(ctx, case: dict) -> dict | None:
    plan = config.REPAIR_PLAN.get(case["category"], config.REPAIR_PLAN["other"])
    block = ctx.units[case["unit_id"]]["block"]
    return next((w for w in ctx.workers if w["kind"] == "subcontractor" and block in w["blocks"] and set(w["skills"]) & set(plan["skills"])), None)


# ---------- Hand-over (technician can't make it) ----------


def handover_options(ctx, case: dict, kind: str, current: list[str]) -> list[dict]:
    """Colleagues who can take over the job: at the same time if they're free, otherwise their next free time.
    Same-time options come first, then the earliest."""
    if kind == "repair":
        pool = repairers_for(ctx, case, any_kind=True)
    else:
        pool = technicians_for(ctx, case["category"], ctx.units[case["unit_id"]]["block"])
    pool = [w for w in pool if w["technician_id"] not in (case.get("technician_id"), case.get("support_id"))]
    repair = repair_options(ctx, case, pool) if kind == "repair" else []
    out = []
    for w in pool:
        wid = w["technician_id"]
        if current and all(not busy(ctx, wid, s) for s in current):
            slots = current
        elif kind == "repair":
            slots = next((o["slots"] for o in repair if wid in o["workerIds"]), None)
        else:
            slots = next(([s] for s in upcoming_slots(ctx.now) if not busy(ctx, wid, s)), None)
        if slots:
            out.append({"technicianId": wid, "start": slots[0], "slots": slots, "sameTime": slots == current})
    return sorted(out, key=lambda o: (not o["sameTime"], o["start"]))


# ---------- CommsAgent ----------


def comms(ctx, kind: str, case: dict, extra: dict | None = None) -> tuple[str, str]:
    extra = extra or {}
    tech = ctx.worker(case.get("technician_id"))
    tech_name = tech["name"] if tech else "a technician"
    ref = f"Case {case['case_id']} ({case['summary']})"
    g = config.GRACE_PERIOD_DAYS
    messages = {
        "received": ("We've received your report", f"{ref}. Inspection visit: {tech_name} on {extra.get('slot')}."),
        "info_needed": ("We need a little more information", f"{ref}. {case.get('follow_up_question') or ''}"),
        "valid": ("Defect confirmed — please book a repair", f"{ref}. The technician confirmed the defect: \"{extra.get('note', '')}\". Please choose a repair slot in the app."),
        "invalid": ("Inspection result", f"{ref}. After inspection, the technician assessed this as not a defect: \"{extra.get('note', '')}\". This case is now closed. If the problem gets worse or changes, please submit a new report."),
        "repair_booked": ("Repair booked", f"{ref}. Repair on {extra.get('slot')} by {tech_name}, estimated {extra.get('duration')}."),
        "verify": ("Please check the repair and sign off", f"{ref}. The repair is done. Follow the short checklist in the app, then sign off if it is fixed."),
        "closed": ("Case closed", f"{ref}. You and the developer have both signed off. You can reopen this case within {g} days if the problem returns."),
        "reopened": ("Case reopened", f"{ref}. We've reopened your case with the new photo you provided. We'll update you on the next step shortly."),
        "escalated": ("Your case is being reviewed", f"{ref}. Because this problem has come back, we've asked our team to arrange a more detailed inspection. We'll confirm the visit soon."),
        "extra_inspection": ("Detailed inspection scheduled", f"{ref}. A detailed inspection is booked for {extra.get('slot')} with {tech_name}."),
        "revisit": ("Technician revisit booked", f"{ref}. {tech_name} will revisit on {extra.get('slot')}."),
        "confirmed": ("Technician confirmed", f"{ref}. {tech_name} confirmed your {extra.get('job')} on {extra.get('slot')}."),
        "reassigned": ("Your technician has changed",
                       f"{ref}. {extra.get('previous')} is no longer available, so {tech_name} will handle your {extra.get('job')} "
                       + (f"at the same time, {extra.get('slot')}." if extra.get("same_time") else f"on {extra.get('slot')} (moved from {extra.get('old_slot')}).")),
    }
    return messages.get(kind, ("Update on your case", ref))


# ---------- VerificationAgent ----------


def verification_guide(case: dict) -> dict:
    loc = case.get("location_in_unit") or ""
    sub = (case.get("sub_category") or "").replace("_", " ")
    where = ", ".join(x for x in [loc, case.get("summary")] if x).lower()
    cat = case["category"]
    if cat == "water_leak":
        steps = [
            f"Look at the repaired spot ({where}). Compare it with your original photo: there should be no wet patch, drip or new stain.",
            f"Run the shower in your bathroom for 10 minutes, then check the repaired ceiling in the {loc.lower() or 'same room'} again."
            if "ceiling" in sub.lower() else "Run the nearest tap for 10 minutes, then check the repaired area again.",
            "Touch the repaired surface lightly: it should feel dry, not damp or soft.",
            "Check once more after the next heavy rain and before your grace period ends.",
        ]
    elif cat == "electrical":
        steps = [f"Use the repaired fitting ({where}) normally: switch it on and off 5 times.",
                 "Check it works each time and nothing flickers, buzzes or feels warm.",
                 "Over the next 24 hours, note if the breaker trips while using it."]
    elif cat == "door_window":
        thing = "window" if "window" in sub.lower() else "door"
        steps = [f"Open and close the repaired {thing} ({where}) 10 times.",
                 "Lock and unlock it 3 times: it should move without forcing.",
                 "Check it no longer scrapes or leaves a visible gap when closed."]
    elif cat == "tiles":
        steps = [f"Look at the repaired tiles ({where}): check for cracks or gaps in the grout.", "Walk across them normally: they should feel solid with no movement."]
    elif cat in ("wall_crack", "structural_crack"):
        steps = [f"Look at the repaired crack ({where}) and compare with your original photo.", "Check again in 7 days: the line should not reappear through the paint."]
    elif cat == "paint":
        steps = [f"Look at the repainted area ({where}): it should be smooth with no bubbles, peeling or patchy colour."]
    elif cat == "drainage":
        steps = [f"Pour a bucket of water near the repaired drain ({where}).", "It should drain within about a minute with no pooling or smell."]
    elif cat == "sanitary_fittings":
        steps = [f"Use the repaired {sub.lower() or 'fitting'} ({where}) normally 3 times (run the tap / flush).", "Check underneath and around it for drips or wet spots."]
    else:
        steps = [f"Check the item you reported (\"{case.get('description', '')}\") in the {loc.lower() or 'same spot'}: it should now work or look as expected."]
    note = case.get("repair_note")
    note_text = f' Technician\'s note: "{note}".' if note else ""
    return {
        "intro": f"Your {(case.get('summary') or '').lower()} was repaired.{note_text} Please check only these points:",
        "steps": steps,
        "ifFails": 'If any check fails, do not sign off: choose "Still not fixed" and add a photo. Your case will be reopened.',
    }


# ---------- RecurrenceAgent ----------


def recurrence(ctx, case: dict) -> dict:
    sim = similar(ctx, case)
    unit = ctx.units[case["unit_id"]]
    label = config.CATEGORY_LABEL.get(case["category"], case["category"])
    reasons = []
    if sim["occurrence"] >= config.OCCURRENCE_THRESHOLD:
        reasons.append(f"{label} reported in {case['unit_id']} {sim['occurrence']} times ({sim['occurrence'] - 1} earlier case(s)), and this case has been reopened {case['reopen_count']}×.")
    if len(sim["stack_units"]) + 1 >= config.STACK_CLUSTER_THRESHOLD:
        units = ", ".join([case["unit_id"], *sim["stack_units"]])
        reasons.append(f"{len(sim['stack_units']) + 1} units in stack {unit['block']}-{unit['stack']} have the same problem: {units}.")
    return {"escalate": bool(reasons), "reasons": reasons, **sim}


# ---------- InitialInspectionAgent ----------

LIKELY_COMPONENTS = {
    "water_leak": ["Waterproofing membrane of the bathroom directly above", "Water supply pipe joints in the ceiling void",
                   "Floor trap and grout seal of the unit above", "Vertical service riser shared by the stack"],
    "electrical": ["Circuit for the affected socket/fitting", "Junction box behind the fitting", "RCCB/MCB rating"],
    "tiles": ["Screed bonding under tiles", "Expansion joints"],
    "wall_crack": ["Beam/column junction", "Plaster bonding"],
}


def initial_inspection(ctx, case: dict, verdict_note: str | None, verification: dict | None) -> dict:
    unit = ctx.units[case["unit_id"]]
    cases = ctx.all_cases()
    history = [x for x in cases if x["unit_id"] == case["unit_id"] and x["category"] == case["category"] and x["case_id"] != case["case_id"]]
    by_unit: dict[str, dict] = {}
    for x in cases:
        u = ctx.units[x["unit_id"]]
        if x["category"] == case["category"] and u["block"] == unit["block"] and u["stack"] == unit["stack"] and x["unit_id"] != case["unit_id"]:
            cur = by_unit.setdefault(x["unit_id"], {"unitId": x["unit_id"], "cases": 0, "last": x["created_at"]})
            cur["cases"] += 1
            cur["last"] = max(cur["last"], x["created_at"])
    timeline = [{"at": x["created_at"], "text": f"{x['case_id']}: {x['summary']} — repaired, closed {fmt_date(x['closed_at'] or x['created_at'])}"} for x in history]
    timeline.append({"at": case["created_at"], "text": f"{case['case_id']}: reported — {case['summary']}"})
    if case.get("verdict_at"):
        timeline.append({"at": case["verdict_at"], "text": f"Technician confirmed: {verdict_note or ''}"})
    if verification and verification.get("completed_at"):
        timeline.append({"at": verification["completed_at"], "text": f"Buyer verification: {(verification.get('outcome') or '').replace('_', ' ').lower()}"})
    timeline.append({"at": ctx.now, "text": f"Reopened {case['reopen_count']}× within grace period; escalated to SDP and approved"})
    timeline.sort(key=lambda t: t["at"])
    kinds = ctx.photo_kinds(case["case_id"])
    checklist = [
        f"Inspect the original repair in {case['unit_id']} ({case.get('location_in_unit') or 'reported area'}).",
        f"Inspect the unit directly above ({unit['block']}-{unit['floor'] + 1}-{unit['stack']}) at the same position.",
    ]
    if case["category"] == "water_leak":
        checklist += ["Moisture-meter readings at the repair and 1 m around it.", "Flood test of the bathroom above for 24 h if accessible."]
    checklist += ["Photograph each check point and attach to the case.", "Record the root cause and whether other units in the stack need the same fix."]
    return {
        "generatedAt": ctx.now,
        "timeline": timeline,
        "photoComparison": "Original and reopen photos attached. Compare the stain's size and position: if it has moved or grown, the source is likely above, not the repaired patch."
        if "original" in kinds and "reopen" in kinds else "Reopen photo not available; take before/after photos on site.",
        "neighbouringUnits": sorted(by_unit.values(), key=lambda u: -ctx.units[u["unitId"]]["floor"]),
        "likelyComponents": LIKELY_COMPONENTS.get(case["category"], ["Original repair area", "Adjacent fittings"]),
        "checklist": checklist,
    }
