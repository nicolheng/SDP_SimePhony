"""SDP console figures, computed here so the dashboard and the RecurrenceAgent's escalations use the same rules.

Sent as `analytics` in the state (frontend/src/lib/types.ts Analytics). The screens only display these numbers.
"""
from collections import defaultdict

from . import config
from .timeutil import MYT, add_days, days_between, norm, parse

OPEN = {"SUBMITTED", "INFO_NEEDED", "PENDING_REVIEW", "VISIT_SCHEDULED", "VALID", "REPAIR_BOOKED", "REPAIRED", "PENDING_SIGNOFF", "REOPENED",
        "ESCALATION_PENDING", "EXTRA_INSPECTION"}

# Clusters below this confidence go on the watchlist instead of being called systemic.
SYSTEMIC_CONFIDENCE = 0.7


def cluster_confidence(units: int, repeat_units: int, reopened: int) -> float:
    """How likely a block + stack + category cluster shares one cause: more units, repeat units and reopens raise it."""
    return round(min(0.95, 0.35 + units * 0.08 + repeat_units * 0.05 + reopened * 0.05), 2)


def stack_clusters(ctx, cases: list[dict]) -> list[dict]:
    """Valid cases grouped by block + stack + category, keeping groups that reach the stack threshold in rules.yaml."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for c in cases:
        if c["status"] == "INVALID":
            continue
        u = ctx.units[c["unit_id"]]
        groups[(u["block"], u["stack"], c["category"])].append(c)
    out = []
    for (block, stack, category), items in groups.items():
        per_unit = defaultdict(int)
        for c in items:
            per_unit[c["unit_id"]] += 1
        if len(per_unit) < config.STACK_CLUSTER_THRESHOLD:
            continue
        reopened = sum(c["reopen_count"] or 0 for c in items)
        out.append({
            "block": block, "stack": stack, "category": category, "cases": items,
            "units": sorted(per_unit, key=lambda u: -ctx.units[u]["floor"]),
            "reopened": reopened,
            "confidence": cluster_confidence(len(per_unit), sum(1 for n in per_unit.values() if n > 1), reopened),
        })
    return sorted(out, key=lambda d: (-d["confidence"], -len(d["cases"])))


def dlp_expiry(vp_date: str | None) -> str | None:
    """Last day of the defect liability period: vacant possession + dlp_months (rules.yaml statutory)."""
    if not vp_date:
        return None
    y, m, d = (int(x) for x in vp_date[:10].split("-"))
    m += config.DLP_MONTHS
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}-{min(d, 28 if m == 2 else 30 if m in (4, 6, 9, 11) else 31):02d}"


def dlp_days_left(vp_date: str | None, now: str) -> float | None:
    end = dlp_expiry(vp_date)
    return days_between(now, f"{end}T23:59:59+08:00") if end else None


def repair_clock(case: dict, reopened_at: str | None) -> dict | None:
    """The 30-day repair clock (rules.yaml statutory.repair_days_from_notice): it starts at the buyer's notice
    (the report, or the latest reopen) and stops when the repair is done. None for cases found not to be defects."""
    if case["status"] == "INVALID" or not case.get("created_at"):
        return None
    notice = norm(reopened_at) if reopened_at and parse(reopened_at) > parse(case["created_at"]) else norm(case["created_at"])
    repaired = norm(case.get("repaired_at"))
    done = repaired if repaired and parse(repaired) >= parse(notice) else None
    if not done and case["status"] == "CLOSED":  # closed with no repair time recorded (seeded history)
        done = norm(case.get("closed_at"))
    return {"noticeAt": notice, "dueAt": add_days(notice, config.REPAIR_DAYS_FROM_NOTICE), "doneAt": done}


def statutory(ctx, cases: list[dict], clocks: dict[str, dict]) -> dict:
    """DLP per block, worked out from each unit's own vacant possession date (a buyer's DLP is their unit's), and
    the 30-day repair clocks. A block row shows its earliest VP and DLP end, and how many units are in each state."""
    def state(left: float | None) -> str:
        return "unknown" if left is None else "expired" if left < 0 else "expiring" if left <= config.DLP_EXPIRING_DAYS else "active"

    blocks: dict[str, dict] = {}
    for u in ctx.units.values():
        b = blocks.setdefault(u["block"], {"block": u["block"], "vpDates": [], "units": 0, "openCases": 0,
                                           "active": 0, "expiring": 0, "expired": 0, "unknown": 0})
        b["units"] += 1
        b[state(dlp_days_left(u.get("vp_date"), ctx.now))] += 1
        if u.get("vp_date"):
            b["vpDates"].append(u["vp_date"][:10])
    for c in cases:
        if c["status"] in OPEN:
            blocks[ctx.units[c["unit_id"]]["block"]]["openCases"] += 1
    dlp = []
    for b in sorted(blocks.values(), key=lambda x: x["block"]):
        vps = sorted(b.pop("vpDates"))
        first = vps[0] if vps else None  # the earliest handover ends its DLP first
        left = dlp_days_left(first, ctx.now)
        dlp.append({**b, "vpDate": first, "vpDateLast": vps[-1] if vps else None, "dlpExpiry": dlp_expiry(first),
                    "dlpExpiryLast": dlp_expiry(vps[-1]) if vps else None, "daysLeft": None if left is None else round(left),
                    "state": state(left)})

    summary = {c["case_id"]: c for c in cases}
    overdue, due_soon, met, done = [], 0, 0, 0
    for cid, k in clocks.items():
        if k["doneAt"]:
            done += 1
            met += parse(k["doneAt"]) <= parse(k["dueAt"])
            continue
        if summary[cid]["status"] not in OPEN:
            continue
        left = days_between(ctx.now, k["dueAt"])
        if left < 0:
            c = summary[cid]
            overdue.append({"caseId": cid, "unitId": c["unit_id"], "summary": c.get("summary") or "", "status": c["status"],
                            "dueAt": k["dueAt"], "daysOverdue": int(-left) + (1 if -left % 1 else 0)})
        elif left <= 7:
            due_soon += 1
    return {
        "dlpMonths": config.DLP_MONTHS,
        "repairDays": config.REPAIR_DAYS_FROM_NOTICE,
        "dlp": dlp,
        "overdue": sorted(overdue, key=lambda o: -o["daysOverdue"]),
        "dueSoon": due_soon,
        "onTimeRate": met / done if done else 0,
        "repaired": done,
    }


def satisfaction(ctx) -> dict:
    """Buyer ratings (1-5) given after sign-off: average, spread, response rate, per category and latest comments."""
    rated = [dict(r) for r in ctx.conn.execute(
        """SELECT case_id, unit_id, category, technician_id, buyer_rating, buyer_rating_comment, buyer_rated_at FROM cases
           WHERE buyer_rating IS NOT NULL ORDER BY buyer_rated_at DESC, case_id DESC""")]
    signed = ctx.conn.execute("SELECT COUNT(*) FROM cases WHERE buyer_signed_at IS NOT NULL").fetchone()[0]
    by_cat: dict[str, list[int]] = defaultdict(list)
    for r in rated:
        by_cat[r["category"] if r["category"] in config.CATEGORY_LABEL else "other"].append(r["buyer_rating"])
    stars = [r["buyer_rating"] for r in rated]
    return {
        "count": len(stars),
        "average": sum(stars) / len(stars) if stars else 0,
        "responseRate": len(stars) / signed if signed else 0,
        "low": sum(1 for s in stars if s <= 2),
        "distribution": [{"stars": n, "count": stars.count(n)} for n in range(5, 0, -1)],
        "byCategory": sorted(({"key": k, "name": config.CATEGORY_LABEL[k], "average": sum(v) / len(v), "count": len(v)}
                              for k, v in by_cat.items()), key=lambda x: x["average"]),
        "recent": [{"caseId": r["case_id"], "unitId": r["unit_id"], "technicianId": r["technician_id"], "stars": r["buyer_rating"],
                    "comment": r["buyer_rating_comment"] or "", "at": norm(r["buyer_rated_at"])} for r in rated[:8]],
    }


def build_analytics(ctx, issue_rows: list[dict], clocks: dict[str, dict] | None = None) -> dict:
    cases = [dict(r) for r in ctx.conn.execute(
        "SELECT case_id, unit_id, category, status, urgency, reopen_count, summary, created_at, closed_at FROM cases")]
    for c in cases:
        c["category"] = c["category"] if c["category"] in config.CATEGORY_LABEL else "other"
    label = config.CATEGORY_LABEL
    open_ = [c for c in cases if c["status"] in OPEN]
    closed = [c for c in cases if c["status"] in ("CLOSED", "INVALID")]
    reopened = [c for c in cases if (c["reopen_count"] or 0) > 0]
    durations = [days_between(c["created_at"], c["closed_at"]) for c in cases if c["status"] == "CLOSED" and c["closed_at"]]

    by_cat: dict[str, int] = defaultdict(int)
    by_block: dict[str, dict] = defaultdict(lambda: {"open": 0, "total": 0})
    for c in cases:
        by_cat[c["category"]] += 1
        b = by_block[ctx.units[c["unit_id"]]["block"]]
        b["total"] += 1
        b["open"] += c["status"] in OPEN

    months = []
    for i in range(11, -1, -1):
        end = add_days(ctx.now, -30 * i)
        start = add_days(end, -30)
        months.append({"month": parse(end).astimezone(MYT).strftime("%b"),
                       "count": sum(1 for c in cases if parse(start) < parse(c["created_at"]) <= parse(end))})

    recurring: dict[tuple, dict] = {}
    for c in cases:
        if c["status"] == "INVALID":
            continue
        r = recurring.setdefault((c["unit_id"], c["category"]), {"unitId": c["unit_id"], "category": c["category"], "count": 0, "reopens": 0, "open": False})
        r["count"] += 1
        r["reopens"] += c["reopen_count"] or 0
        r["open"] = r["open"] or c["status"] in OPEN
    top = sorted(({**r, "score": r["count"] + r["reopens"]} for r in recurring.values() if r["count"] + r["reopens"] > 1), key=lambda r: -r["score"])[:6]

    record_for = {(i["block"], i["stack"], i["category"]): i["issue_id"] for i in issue_rows}
    detected = [{
        "key": f"{d['block']}|{d['stack']}|{d['category']}",
        "block": d["block"], "stack": d["stack"], "category": d["category"],
        "caseIds": [c["case_id"] for c in d["cases"]],
        "units": d["units"],
        "reopened": d["reopened"],
        "openCases": sum(1 for c in d["cases"] if c["status"] in OPEN),
        "confidence": d["confidence"],
        "headline": f"{len(d['cases'])} related {label[d['category']].lower()} cases concentrated in Block {d['block']} / Stack {d['stack']}",
        "recordId": record_for.get((d["block"], d["stack"], d["category"])),
    } for d in stack_clusters(ctx, cases)]

    lead = next((d for d in detected if d["confidence"] >= SYSTEMIC_CONFIDENCE), None)
    if lead:
        reopens = f", {lead['reopened']} reopen(s)" if lead["reopened"] else ""
        insight = (f"Systemic issue detected: {lead['headline']} ({len(lead['units'])} units{reopens}). Units stacked vertically share "
                   "risers and bathrooms, so this points to a shared source rather than separate defects.")
    else:
        insight = "No systemic issues detected. Defects are spread out with no stack clusters."

    # Per unit and category, for the stack heatmap (count includes reopens).
    unit_stats: dict[tuple, dict] = {}
    for c in cases:
        if c["status"] == "INVALID":
            continue
        s = unit_stats.setdefault((c["unit_id"], c["category"]), {"unitId": c["unit_id"], "category": c["category"], "count": 0, "open": False})
        s["count"] += 1 + (c["reopen_count"] or 0)
        s["open"] = s["open"] or c["status"] in OPEN

    return {
        "kpis": {
            "total": len(cases),
            "open": len(open_),
            "closed": len(closed),
            "reopened": len(reopened),
            "reopenRate": len(reopened) / (len(closed) + len(open_)) if closed or open_ else 0,
            "avgDaysToClose": sum(durations) / len(durations) if durations else 0,
            "highOpen": sum(1 for c in open_ if c["urgency"] == "high"),
        },
        "byCategory": sorted(({"key": k, "name": label[k], "count": v} for k, v in by_cat.items()), key=lambda x: -x["count"]),
        "byBlock": [{"name": f"Block {b}", **v} for b, v in sorted(by_block.items())],
        "monthly": months,
        "topRecurring": top,
        "detected": detected,
        "systemicConfidence": SYSTEMIC_CONFIDENCE,
        "insight": insight,
        "unitStats": list(unit_stats.values()),
        "satisfaction": satisfaction(ctx),
        "statutory": statutory(ctx, cases, clocks or {}),
    }
