"""Escalation decision for a reopened case: xiaowen's tools.check_escalation plus this case's reopens.

tools.check_escalation counts earlier same-unit cases and stack units from the DB. A case that keeps
reopening is one case in the DB, so its reopens are added here: occurrence = earlier same-unit cases
+ this case + its reopens (agreed 20 Oct). Pure: never requests an inspection.
"""
from . import backend_tools
from .rules import load_rules


def check_escalation(case_id: str, reopen_count: int) -> dict:
    cfg = load_rules()["escalation"]
    try:
        db = backend_tools.check_escalation(case_id)
    except Exception as e:  # DB unavailable: never escalate on missing data, never crash the run
        db = {"ok": False, "error": str(e)}
    if db.get("ok") is False:
        return {"escalate": False, "reasons": [], "occurrence": reopen_count + 1, "cluster_size": 1,
                "pending_approval_id": None, "error": db["error"]}

    reopens = max(reopen_count, db.get("reopen_count") or 0)
    earlier = db["occurrence_count"] - 1
    occurrence = db["occurrence_count"] + reopens
    repeated = occurrence >= cfg["occurrence_threshold"]
    cluster = db["stack_unit_count"] >= cfg["stack_cluster_threshold"]

    reasons = []
    if repeated:
        reasons.append(f"Reported {occurrence} times in this unit ({earlier} earlier case(s), "
                       f"this case reopened {reopens}×).")
    if cluster:
        reasons += [r for r in db["reasons"] if "stack" in r]  # tools' sentence naming the stack units
    pending = db.get("pending_approval_id")
    return {"escalate": (repeated or cluster) and not pending, "reasons": reasons, "occurrence": occurrence,
            "cluster_size": db["stack_unit_count"], "pending_approval_id": pending, "error": None}
