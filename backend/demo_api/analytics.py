"""SDP console figures, computed here so the dashboard and the RecurrenceAgent's escalations use the same rules.

Sent as `analytics` in the state (frontend/src/lib/types.ts Analytics). The screens only display these numbers.
"""
from collections import defaultdict

from . import config
from .timeutil import MYT, add_days, days_between, parse

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


def build_analytics(ctx, issue_rows: list[dict]) -> dict:
    cases = [dict(r) for r in ctx.conn.execute(
        "SELECT case_id, unit_id, category, status, urgency, reopen_count, created_at, closed_at FROM cases")]
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
    }
