"""Defect knowledge base: loads and checks the kb/ files (sources, limit rules, repair methods, invalid reasons).

Plain Python, 0 AI tokens. The backend loads it at start-up, so a typo in a kb/ file stops the server with a
clear list of problems instead of failing quietly later. Other KB functions (#123-#125) read from get().
"""
import math
import sys
from pathlib import Path

import yaml

from agents.simephony.rules import load_rules

KB_DIR = Path(__file__).resolve().parent.parent.parent / "kb"

# The DLP dates are worked out in the backend (one rule for the dashboard and the KB).
sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))
from demo_api.analytics import dlp_days_left, dlp_expiry  # noqa: E402

AUTHORITIES = {"law", "industry_standard", "intl_reference", "manufacturer_guide"}
LICENCES = {"public_law", "free_public", "cc_by_3.0", "copyright_paraphrase_only"}
CHECKS = {"measure", "yes_no"}
OPS = {">", "<"}

SOURCE_FIELDS = ("id", "title", "edition", "publisher", "url", "authority", "licence", "verified", "used_for")
RULE_FIELDS = ("id", "category", "condition", "check", "tool", "how_to_measure", "photo_can_decide", "source",
               "repair_method_id", "verified")
METHOD_FIELDS = ("id", "title", "categories", "for_rules", "steps", "needs_drying_or_curing", "sources", "verified")
REASON_FIELDS = ("code", "label", "description", "source_ids")

_kb: dict | None = None


class KBError(ValueError):
    """A kb/ file is missing or broken. The message lists every problem found."""


def _read(path: Path, key: str) -> list:
    if not path.exists():
        raise KBError(f"Missing knowledge base file: {path}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise KBError(f"{path.name} is not valid YAML: {exc}") from exc
    items = data.get(key)
    if not isinstance(items, list):
        raise KBError(f"{path.name} needs a '{key}:' list at the top level")
    return items


def _index(items: list, file: str, errors: list, key: str = "id") -> dict:
    """{id: item}, noting items without an id and duplicate ids."""
    out = {}
    for n, item in enumerate(items, 1):
        item_id = item.get(key) if isinstance(item, dict) else None
        if not item_id:
            errors.append(f"{file}: item {n} has no {key}")
        elif item_id in out:
            errors.append(f"{file}: {key} {item_id} is used twice")
        else:
            out[item_id] = item
    return out


def _missing(item: dict, fields: tuple, where: str, errors: list) -> None:
    for field in fields:
        if field not in item:
            errors.append(f"{where}: missing '{field}'")


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_source_ref(ref, where: str, sources: dict, withdrawn: dict, errors: list,
                      limit: bool = False) -> None:
    if ref in withdrawn:
        errors.append(f"{where}: cites {ref}, which is withdrawn and must never be quoted")
    elif ref not in sources:
        errors.append(f"{where}: source {ref!r} is not in sources.yaml")
    elif limit and sources[ref].get("authority") == "manufacturer_guide":
        errors.append(f"{where}: a limit can't come from a manufacturer guide ({ref})")


def load(kb_dir: Path = KB_DIR) -> dict:
    """Read and check the kb/ files. Returns {sources, withdrawn, rules, methods, reasons}, each {id: item}.

    Raises KBError listing every problem, so one run shows everything that needs fixing.
    """
    errors: list[str] = []
    sources_path = kb_dir / "sources.yaml"
    sources = _index(_read(sources_path, "sources"), "sources.yaml", errors)
    withdrawn = _index(_read(sources_path, "withdrawn"), "sources.yaml (withdrawn)", errors)
    rules = _index(_read(kb_dir / "tolerances.yaml", "rules"), "tolerances.yaml", errors)
    methods = _index(_read(kb_dir / "repair_methods.yaml", "methods"), "repair_methods.yaml", errors)
    reasons = _index(_read(kb_dir / "invalid_defect_reasons.yaml", "invalid_defect_reasons"),
                     "invalid_defect_reasons.yaml", errors, key="code")
    categories = set(load_rules().get("category_to_skill", {}))

    for sid, src in sources.items():
        where = f"sources.yaml: {sid}"
        _missing(src, SOURCE_FIELDS, where, errors)
        if sid in withdrawn:
            errors.append(f"{where}: is also in the withdrawn list")
        if "authority" in src and src["authority"] not in AUTHORITIES:
            errors.append(f"{where}: authority {src['authority']!r} must be one of {sorted(AUTHORITIES)}")
        if "licence" in src and src["licence"] not in LICENCES:
            errors.append(f"{where}: licence {src['licence']!r} must be one of {sorted(LICENCES)}")

    for rid, rule in rules.items():
        where = f"tolerances.yaml: {rid}"
        _missing(rule, RULE_FIELDS, where, errors)
        if "category" in rule and rule["category"] not in categories:
            errors.append(f"{where}: category {rule['category']!r} is not in rules.yaml category_to_skill")
        check = rule.get("check")
        if check not in CHECKS:
            errors.append(f"{where}: check {check!r} must be one of {sorted(CHECKS)}")
        elif check == "measure":
            if rule.get("op") not in OPS:
                errors.append(f"{where}: op {rule.get('op')!r} must be one of {sorted(OPS)}")
            if not _is_number(rule.get("threshold")):
                errors.append(f"{where}: threshold must be a number, got {rule.get('threshold')!r}")
            if not rule.get("unit"):
                errors.append(f"{where}: a measure rule needs a unit")
        elif not rule.get("question"):
            errors.append(f"{where}: a yes_no rule needs a question")
        source = rule.get("source")
        if source is not None:
            ref = source.get("id") if isinstance(source, dict) else None
            _check_source_ref(ref, where, sources, withdrawn, errors, limit=True)
        for extra in rule.get("see_also") or []:
            _check_source_ref(extra.get("id"), f"{where} see_also", sources, withdrawn, errors, limit=True)
        method_id = rule.get("repair_method_id")
        if method_id and method_id not in methods:
            errors.append(f"{where}: repair_method_id {method_id} is not in repair_methods.yaml")

    for mid, method in methods.items():
        where = f"repair_methods.yaml: {mid}"
        _missing(method, METHOD_FIELDS, where, errors)
        for cat in method.get("categories") or []:
            if cat not in categories:
                errors.append(f"{where}: category {cat!r} is not in rules.yaml category_to_skill")
        if "steps" in method and not method["steps"]:
            errors.append(f"{where}: needs at least one step")
        if "needs_drying_or_curing" in method and not isinstance(method["needs_drying_or_curing"], bool):
            errors.append(f"{where}: needs_drying_or_curing must be true or false")
        if "sources" in method and not method["sources"]:
            errors.append(f"{where}: needs at least one source")
        for ref in method.get("sources") or []:
            _check_source_ref(ref, where, sources, withdrawn, errors)
        for rid in method.get("for_rules") or []:
            if rid not in rules:
                errors.append(f"{where}: for_rules has {rid}, which is not in tolerances.yaml")
            elif rules[rid].get("repair_method_id") != mid:
                errors.append(f"{where}: lists {rid}, but {rid} points to {rules[rid].get('repair_method_id')}")

    for code, reason in reasons.items():
        where = f"invalid_defect_reasons.yaml: {code}"
        _missing(reason, REASON_FIELDS, where, errors)
        for ref in reason.get("source_ids") or []:  # an empty list is allowed: an internal rule such as DUPLICATE_REPORT
            _check_source_ref(ref, where, sources, withdrawn, errors)

    if errors:
        raise KBError(f"Knowledge base has {len(errors)} problem(s):\n  - " + "\n  - ".join(errors))
    return {"sources": sources, "withdrawn": withdrawn, "rules": rules, "methods": methods, "reasons": reasons}


def init(kb_dir: Path = KB_DIR) -> dict:
    """Load the KB and keep it for get(). The backend calls this at start-up."""
    global _kb
    _kb = load(kb_dir)
    return _kb


def get() -> dict:
    """The loaded KB (loads it on first use, e.g. in scripts and tests that skip start-up)."""
    return _kb if _kb is not None else init()


def public_view() -> dict:
    """The KB for the web app (GET /api/kb), camelCase like the rest of the API: the limit rules the technician
    measures against, the repair method for each rule, and the reasons a defect can be invalid. 0 AI tokens."""
    kb = get()

    def rule(r: dict) -> dict:
        src = kb["sources"][r["source"]["id"]]
        return {
            "id": r["id"], "category": r["category"], "condition": r["condition"], "check": r["check"],
            "metric": r.get("metric"), "question": r.get("question"), "unit": r.get("unit"),
            "op": r.get("op"), "threshold": r.get("threshold"), "escalateOver": r.get("escalate_over"),
            "tool": r["tool"], "howToMeasure": r["how_to_measure"], "photoCanDecide": r["photo_can_decide"],
            "source": {"id": src["id"], "title": src["title"], "authority": src["authority"],
                       "clause": r["source"].get("clause")},
            "verified": r["verified"], "repairMethodId": r.get("repair_method_id"),
        }

    def method(m: dict) -> dict:
        # Technician screens only (repair_methods.yaml): the buyer app never shows these steps.
        return {
            "id": m["id"], "title": m["title"], "categories": m.get("categories", []), "steps": m["steps"],
            "expectedOutcome": m.get("expected_outcome"), "materials": m.get("materials", []),
            "dryingTime": m.get("drying_time"), "callSpecialistIf": m.get("call_specialist_if", []),
            "specialistTrade": m.get("specialist_trade"),
        }

    return {
        "rules": [rule(r) for r in kb["rules"].values()],
        "methods": [method(m) for m in kb["methods"].values()],
        "reasons": [{"code": x["code"], "label": x["label"], "description": x["description"]}
                    for x in kb["reasons"].values()],
    }


def dlp_status(unit: dict, now: str) -> dict:
    """Is the unit still inside its defect liability period (DLP, 24 months from vacant possession)?

    `now` is the demo clock (demo_now / ctx.now), not the real time, so "Skip days" moves the DLP too.
    Returns {status, dlp_end, days_left}. status is:
      "in"       inside the DLP, including its last day: the developer must repair
      "after"    the DLP has ended. Never reject the report automatically: send it to SDP to decide (#142)
      "unknown"  no vacant possession date recorded: can't tell, so treat it like "after" and let SDP decide
    """
    vp_date = unit.get("vp_date")
    left = dlp_days_left(vp_date, now)
    if left is None:
        return {"status": "unknown", "dlp_end": None, "days_left": None}
    # floor, so the last day shows 0 days left and any time after the end shows a negative number
    return {"status": "in" if left >= 0 else "after", "dlp_end": dlp_expiry(vp_date),
            "days_left": math.floor(left)}


# The three answers a rule can give (#124). A suggestion only: the technician always makes the final call.
WITHIN_LIMIT = "within_limit"
LIKELY_DEFECT = "likely_defect"
MEASURE_FIRST = "measure_first"


def check_measurement(rule_id: str, reading) -> dict:
    """Compare the technician's reading with a limit rule from tolerances.yaml. 0 AI tokens.

    reading: a number for a "measure" rule (in the rule's unit), True / False for a "yes_no" rule,
    or None when nothing has been entered yet.
    A reading exactly at the limit is within it (a rule says it is a defect when reading > threshold).
    Returns {answer, rule_id, check, reading, limit, unit, escalate, source} for the suggestion banner (#130).
    Raises ValueError for an unknown rule or a reading of the wrong kind, so a bad input never turns into
    a wrong suggestion.
    """
    kb = get()
    rule = kb["rules"].get(rule_id)
    if rule is None:
        raise ValueError(f"Unknown rule {rule_id!r}")
    src = kb["sources"][rule["source"]["id"]]
    result = {
        "rule_id": rule_id, "check": rule["check"], "reading": reading,
        "limit": rule.get("threshold"), "unit": rule.get("unit"), "escalate": False,
        "source": {"id": src["id"], "title": src["title"], "authority": src["authority"],
                   "clause": rule["source"].get("clause")},
    }
    if reading is None:
        return {**result, "answer": MEASURE_FIRST}

    if rule["check"] == "yes_no":
        if not isinstance(reading, bool):
            raise ValueError(f"{rule_id} is a yes/no check, so the reading must be True or False, got {reading!r}")
        return {**result, "answer": LIKELY_DEFECT if reading else WITHIN_LIMIT}

    if not _is_number(reading):
        raise ValueError(f"{rule_id} needs a number in {rule['unit']}, got {reading!r}")
    if reading < 0:
        raise ValueError(f"{rule_id}: a reading can't be negative, got {reading}")
    threshold = rule["threshold"]
    exceeds = reading > threshold if rule["op"] == ">" else reading < threshold
    escalate_over = rule.get("escalate_over")
    return {**result, "answer": LIKELY_DEFECT if exceeds else WITHIN_LIMIT,
            "escalate": escalate_over is not None and reading > escalate_over}


# Structural defects always go to an engineer first, never to a step-by-step guide (research doc 3.3: a safety or
# structural flag means human review, not a suggestion).
ENGINEER_FIRST = {"structural_crack"}


def _guide(method: dict, matched_by: str) -> dict:
    kb = get()
    return {
        "kind": "guide", "method_id": method["id"], "title": method["title"], "matched_by": matched_by,
        "steps": list(method["steps"]), "materials": list(method.get("materials") or []),
        "needs_drying_or_curing": method["needs_drying_or_curing"], "drying_time": method.get("drying_time"),
        "call_specialist_if": list(method.get("call_specialist_if") or []),
        "specialist_trade": method.get("specialist_trade"), "licensed_only": bool(method.get("licensed_only")),
        "sources": [{"id": s, "title": kb["sources"][s]["title"], "authority": kb["sources"][s]["authority"]}
                    for s in method["sources"]],
        "verified": method["verified"],
    }


def _referral(trade: str, engineer: bool = False) -> dict:
    """No guide in the KB for this defect: say who should do it, without inventing steps."""
    if engineer:
        title, trade = "A structural engineer must assess this first", "structural engineer"
        steps = ["Do not start a repair until a structural engineer has inspected it.",
                 "Keep people away from anything that could fall."]
        specialist = ["Always, for a structural defect."]
    else:
        title = f"Refer to the {trade} trade"
        steps = ["There is no repair guide for this defect in the knowledge base yet.",
                 f"Assign a qualified {trade} worker, who follows their trade's own method and the product labels."]
        specialist = []
    return {
        "kind": "referral", "method_id": None, "title": title, "matched_by": "category", "steps": steps,
        "materials": [], "needs_drying_or_curing": False, "drying_time": None, "call_specialist_if": specialist,
        "specialist_trade": trade, "licensed_only": False, "sources": [], "verified": False,
    }


def repair_method_for(category: str | None, rule_id: str | None = None) -> dict | None:
    """The repair guide (kb/repair_methods.yaml) for a defect, for the technician's repair card (#134). 0 AI tokens.

    Most precise first:
      1. the rule the technician measured against (verdict_rule_id), if it names a method;
      2. a structural defect: always "a structural engineer must assess this first";
      3. the one method that lists the category;
      4. no method, or more than one (e.g. "ceiling" fits both crack filling and spalling): a referral to the trade
         from rules.yaml repair_plan, with no invented steps.
    Returns None for a category the app doesn't know. Technician-only: never send these steps to a buyer.
    """
    kb = get()
    if rule_id:
        rule = kb["rules"].get(rule_id)
        if rule is None:
            raise ValueError(f"Unknown rule {rule_id!r}")
        if rule.get("repair_method_id"):
            return _guide(kb["methods"][rule["repair_method_id"]], "rule")
    plan = load_rules().get("repair_plan", {})
    if category not in plan:
        return None
    if category in ENGINEER_FIRST:
        return _referral(plan[category]["trade"], engineer=True)
    matches = [m for m in kb["methods"].values() if category in m["categories"]]
    if len(matches) == 1:
        return _guide(matches[0], "category")
    return _referral(plan[category]["trade"])


# How each kind of source is named on the technician's screens, so a benchmark is never shown as if it were law.
AUTHORITY_LABELS = {
    "law": "Malaysian law",
    "industry_standard": "Malaysian industry benchmark",
    "intl_reference": "international reference, not a Malaysian contractual standard",
    "manufacturer_guide": "manufacturer guide",
}


def _num(x) -> str:
    return f"{x:g}"


def _card_item(rule: dict) -> dict:
    """One rule as fixed sentences. Every value comes from the rule, so the text can't say anything the KB doesn't."""
    src = get()["sources"][rule["source"]["id"]]
    source = f'Source: {src["title"]} ({AUTHORITY_LABELS[src["authority"]]}).'
    if rule["check"] == "measure":
        over = f' over {_num(rule["over_length_mm"] / 1000)} m' if rule.get("over_length_mm") else ""
        side = "more" if rule["op"] == ">" else "less"
        lines = [f'Measure the {rule["metric"]} with: {rule["tool"]}.', rule["how_to_measure"],
                 f'Likely a real defect if {side} than {_num(rule["threshold"])} {rule["unit"]}{over}.']
        if rule.get("escalate_over") is not None:
            lines.append(f'Over {_num(rule["escalate_over"])} {rule["unit"]}: an engineer must assess it.')
    else:
        lines = [f'Check: {rule["question"]}', f'Use: {rule["tool"]}.', rule["how_to_measure"],
                 'If yes, it is likely a real defect.']
    if not rule["photo_can_decide"]:
        lines.append("A photo can't decide this one: check it in person.")
    return {"rule_id": rule["id"], "condition": rule["condition"], "check": rule["check"],
            "lines": [*lines, source], "verified": rule["verified"]}


def check_card(category: str | None) -> list[dict]:
    """The "what to check" card for a defect category (#127, #128): one item per limit rule for that category,
    built from fixed sentence templates (0 AI tokens, nothing invented). Empty when no rule covers the category."""
    return [_card_item(r) for r in get()["rules"].values() if r["category"] == category]


def technician_guide(case: dict) -> dict:
    """What the technician's job page reads from GET /api/cases/{id}/technician-guide (#128, #134), camelCase like the
    rest of the API. 0 AI tokens. Technician-only: it is not in /api/state, so buyer pages never receive the steps.

    checkCard: the "what to check" items for the case's category (always, so it helps before the inspection).
    repairMethod: the repair guide, only once the defect is confirmed Valid (the technician's verdict, or SDP
    overturning an Invalid one). The intake's preliminary outcome doesn't count: it has no verdict_at.
    """
    category = case.get("category")
    card = [{"ruleId": i["rule_id"], "condition": i["condition"], "check": i["check"], "lines": i["lines"],
             "verified": i["verified"]} for i in check_card(category)]
    confirmed = case.get("inspection_outcome") == "VALID_DEFECT" and bool(case.get("verdict_at"))
    method = None
    if confirmed:
        try:
            method = repair_method_for(category, case.get("verdict_rule_id"))
        except ValueError:  # the measured rule has since left the KB: use the category
            method = repair_method_for(category)
    return {"caseId": case.get("case_id"), "checkCard": card, "repairMethod": method and {
        "kind": method["kind"], "methodId": method["method_id"], "title": method["title"],
        "matchedBy": method["matched_by"], "steps": method["steps"], "materials": method["materials"],
        "needsDryingOrCuring": method["needs_drying_or_curing"], "dryingTime": method["drying_time"],
        "callSpecialistIf": method["call_specialist_if"], "specialistTrade": method["specialist_trade"],
        "licensedOnly": method["licensed_only"], "verified": method["verified"],
        "sources": [{**s, "authorityLabel": AUTHORITY_LABELS[s["authority"]]} for s in method["sources"]],
    }}
