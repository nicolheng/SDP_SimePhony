"""Shared escalation decision (occurrence threshold + stack cluster). Pure: never requests an inspection."""
from .rules import load_rules
from .stub_tools import get_stack_cases, get_unit


def check_escalation(case_id: str, unit_id: str, category: str, occurrence: int) -> dict:
    cfg = load_rules()["escalation"]
    unit = get_unit(unit_id)
    others = [
        c for c in get_stack_cases(unit["block"], unit["stack"])
        if c.get("case_id") != case_id
        and c.get("category") == category
        and c.get("status") != "INVALID"
    ]
    cluster_size = len(others) + 1  # include this case

    reasons = []
    if occurrence >= cfg["occurrence_threshold"]:
        reasons.append("3rd occurrence")
    if cluster_size >= cfg["stack_cluster_threshold"]:
        reasons.append("stack cluster")
    return {"escalate": bool(reasons), "reasons": reasons, "cluster_size": cluster_size}
