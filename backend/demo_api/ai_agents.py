"""The LangGraph agents (agents/simephony) in the web app's agent slots, behind USE_AI_AGENTS.

USE_AI_AGENTS (.env):  "" / false = the rule-based stand-ins in agents.py only (default)
                        true / all = every agent below
                        or a comma list: intake, similar, triage, estimate, verification, inspection, comms
Direct workflow callers run agents inline. API requests use rule-based results in their transaction and
defer the agent computations until after commit, where each step loads current case data on a fresh
connection. AI results do not replace the rule-based action already returned to the caller.
"""
import base64
import logging
import os
import sys
import tempfile
from pathlib import Path

import db
import tools

from . import agents as standins

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))  # agents/simephony lives at the repo root

AGENTS = ("intake", "similar", "triage", "estimate", "verification", "inspection", "comms")
log = logging.getLogger("simephony.ai_agents")


def enabled(name: str) -> bool:
    value = os.getenv("USE_AI_AGENTS", "").strip().lower()
    if value in ("", "0", "false", "no", "off"):
        return False
    if value in ("1", "true", "yes", "on", "all"):
        return True
    return name in {x.strip() for x in value.split(",")}


def _run(ctx, name: str, ai, fallback, background_args: dict | None = None):
    """Run inline, defer after commit, or use the rule-based result when disabled or unavailable."""
    if not enabled(name):
        return fallback()
    if ctx.defer_agents:
        ctx.defer_agent_step(name, **(background_args or {}))
        return fallback()
    try:
        with tools.use_connection(ctx.conn):
            result = ai()
        ctx.invalidate()
        return result
    except Exception as e:  # never let an agent break the request: use the rule-based stand-in
        log.warning("%s agent failed, using the stand-in: %s", name, e)
        print(f"[AI AGENTS] {name} failed, using the stand-in: {e}")
        case_id = (background_args or {}).get("case_id")
        if case_id:
            _save_fallback(ctx, case_id, name, str(e), type(e).__name__)
        else:
            ctx.pending_agent_fallbacks.append({"step": name, "error_type": type(e).__name__, "reason": str(e)[:500]})
        return fallback()


def _save_fallback(ctx, case_id: str, name: str, reason: str, error_type: str) -> bool:
    try:
        message = f"Used rule-based fallback for {name}: {error_type}"
        with tools.use_connection(ctx.conn):
            result = tools.log_agent_step(
                case_id,
                _agent_label(name),
                message,
                {"fallback_used": True, "step": name, "reason": reason[:500]},
            )
        if result.get("ok") is False:
            log.error("Could not save %s fallback status for case %s: %s", name, case_id, result["error"])
            return False
        return True
    except Exception:
        log.exception("Could not save %s fallback status for case %s", name, case_id)
        return False


def record_pending_fallbacks(ctx, case_id: str) -> None:
    """Attach pre-case agent failures to the case created from their rule-based result."""
    for fallback in ctx.pending_agent_fallbacks[:]:
        if _save_fallback(ctx, case_id, fallback["step"], fallback["reason"], fallback["error_type"]):
            ctx.pending_agent_fallbacks.remove(fallback)


def _agent_label(name: str) -> str:
    return {
        "intake": "IntakeAgent",
        "similar": "SimilarDefectAgent",
        "triage": "TriageAgent",
        "estimate": "RepairEstimateAgent",
        "verification": "VerificationAgent",
        "inspection": "InitialInspectionAgent",
        "comms": "CommsAgent",
    }.get(name, name)


def _photo_path(ctx, case_id: str | None, kind: str, photo: str | None = None) -> str | None:
    """A file path for the vision model: a data URL from the browser is written to a temp file; otherwise
    the case's latest photo of this kind from uploads/."""
    if photo and photo.startswith("data:image/"):
        header, data = photo.split(",", 1)
        suffix = ".png" if "png" in header else ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(base64.b64decode(data))
            return f.name
    if photo and Path(photo).is_file():
        return photo
    if not case_id:
        return None
    row = ctx.conn.execute("SELECT path FROM case_photos WHERE case_id = ? AND kind = ? ORDER BY created_at DESC, photo_id DESC",
                           (case_id, kind)).fetchone()
    path = tools.UPLOADS_DIR / row["path"] if row else None
    return str(path) if path and path.is_file() else None


# ---------- IntakeAgent ----------

def intake(ctx, description: str, photo: str | None, has_photo: bool | None = None, case_id: str | None = None) -> dict:
    stand = standins.intake(description, bool(photo) if has_photo is None else has_photo)
    if "non_defect" in stand:
        return stand  # the rule-based building-management screen stays in front

    def ai():
        from agents.simephony.intake import intake_node
        image = _photo_path(ctx, case_id, "original", photo)
        r = intake_node({"user_description": description, "image_path": image, "decide_only": True})["intake_result"]
        if r.get("category") in (None, "error"):
            raise RuntimeError(f"intake failed: {r.get('summary')}")
        missing = list(r.get("missing_info") or [])
        return {"category": r["category"], "sub_category": r.get("sub_category") or stand["sub_category"],
                "location_in_unit": r.get("location_in_unit") or "", "summary": r.get("summary") or stand["summary"],
                "urgency": r.get("urgency") or "normal", "missing_info": missing,
                # a question only when something is actually missing (avoids needless follow-up rounds)
                "follow_up_question": (r.get("follow_up_question") or stand["follow_up_question"]) if missing else None}
    return _run(ctx, "intake", ai, lambda: stand,
                {"case_id": case_id})


# ---------- SimilarDefectAgent ----------

def similar(ctx, case: dict) -> dict:
    stand = standins.similar(ctx, case)  # same unit + same stack from the DB (what the case page links)

    def ai():
        from agents.simephony.similar_defect import similar_defect_node
        r = similar_defect_node({"case_id": case["case_id"], "unit_id": case["unit_id"],
                                 "user_description": case.get("description") or case.get("summary") or "",
                                 "intake_result": {"category": case["category"]}, "decide_only": True})["similar_cases_result"]
        return {**stand, "cluster_reason": r.get("cluster_reason")}
    return _run(ctx, "similar", ai, lambda: stand, {"case_id": case["case_id"]})


# ---------- TriageAgent + BookingAgent ----------

def triage(ctx, case: dict, preferred: str | None) -> dict:
    """{technician_id, slot, reason} like the stand-in. TriageAgent saves its urgency (rules.yaml rules);
    BookingAgent proposes the technician and time; workflow.py books it."""
    def ai():
        from agents.simephony.booking import booking_node
        from agents.simephony.triage import triage_node
        state = {"case_id": case["case_id"], "unit_id": case["unit_id"], "current_status": case["status"],
                 "user_description": case.get("description") or "", "decide_only": True,
                 "intake_result": {"category": case["category"], "urgency": case.get("urgency"), "summary": case.get("summary")}}
        state = triage_node(state)
        state = booking_node(state)
        b = state["booking_result"]
        if b.get("booking_status") != "PROPOSED":
            raise RuntimeError(b.get("reason") or b.get("error") or "no technician proposed")
        return {"technician_id": b["assigned_technician"], "slot": b["start"], "reason": b["reason"]}
    return _run(ctx, "triage", ai, lambda: standins.triage(ctx, case, preferred),
                {"case_id": case["case_id"]})


# ---------- RepairEstimateAgent (no stand-in: the category's normal hours apply) ----------

def repair_estimate(ctx, case: dict) -> dict | None:
    def ai():
        from agents.simephony.repair_estimate import repair_estimate_node
        r = repair_estimate_node({"case_id": case["case_id"], "current_status": case["status"],
                                  "intake_result": {"category": case["category"]},
                                  "verdict_note": case.get("verdict_note") or "",
                                  "reopen_count": case.get("reopen_count") or 0})["repair_estimate"]
        if r.get("error"):
            raise RuntimeError(r["error"])
        return r
    return _run(ctx, "estimate", ai, lambda: None, {"case_id": case["case_id"]})


# ---------- VerificationAgent ----------

def verification_guide(ctx, case: dict) -> tuple[dict, str | None]:
    """(guide, note for the SDP trace). The repair photo is checked against the original; if it doesn't look
    resolved, the standard guide is used and the note asks SDP to check the photo before signing off (SDP
    signs before the buyer, so a person always looks at it)."""
    def ai():
        from agents.simephony.verification import verification_node
        state = verification_node({
            "case_id": case["case_id"], "current_status": "REPAIRED", "decide_only": True,
            "intake_result": {"category": case["category"], "location_in_unit": case.get("location_in_unit")},
            "user_description": case.get("description") or "", "repair_note": case.get("repair_note") or "",
            "image_path": _photo_path(ctx, case["case_id"], "original"),
            "repair_photo_path": _photo_path(ctx, case["case_id"], "repair")})
        v = state["verification_result"]
        if v.get("needs_technician_input"):
            return standins.verification_guide(case), f"Photo check: {v['technician_message']} SDP: please check the repair photo before signing off."
        return v["guide"], f"Photo check: {v['assessment']} ({v.get('observations') or 'no notes'})"
    return _run(ctx, "verification", ai, lambda: (standins.verification_guide(case), None),
                {"case_id": case["case_id"]})


# ---------- InitialInspectionAgent ----------

def initial_inspection(ctx, case: dict, verdict_note: str | None, verification: dict | None) -> dict:
    """The stand-in's facts (timeline, neighbouring units, photo comparison) + the agent's likely components
    and checklist."""
    stand = standins.initial_inspection(ctx, case, verdict_note, verification)

    def ai():
        from agents.simephony.initial_inspection import initial_inspection_node
        sim = standins.similar(ctx, case)
        r = initial_inspection_node({
            "case_id": case["case_id"], "unit_id": case["unit_id"], "decide_only": True,
            "intake_result": {"category": case["category"], "urgency": case.get("urgency"), "summary": case.get("summary")},
            "similar_cases_result": {"past_case_count": sim["occurrence"] - 1, "stack_units": sim["stack_units"],
                                     "timeline": stand["timeline"]}})["initial_inspection_result"]
        checklist = [str(x) for x in (r.get("checklist") or []) if str(x).strip()]
        if len(checklist) < 3:
            raise RuntimeError("brief checklist too short")
        return {**stand, "checklist": checklist,
                "likelyComponents": [str(x) for x in (r.get("likelyComponents") or [])] or stand["likelyComponents"]}
    return _run(ctx, "inspection", ai, lambda: stand, {"case_id": case["case_id"]})


# ---------- CommsAgent ----------

def comms(ctx, kind: str, case: dict, extra: dict | None = None) -> tuple[str, str]:
    extra = dict(extra or {})

    def ai():
        from agents.simephony.comms import message_for_kind
        from agents.simephony.verification import _guide_text
        if kind == "ready_signoff" and "guide" not in extra:
            from agents.simephony import backend_tools
            extra["guide"] = _guide_text(backend_tools.get_signoff_info(case["case_id"]).get("guide"))
        return message_for_kind(kind, case, extra)
    return _run(ctx, "comms", ai, lambda: standins.comms(ctx, kind, case, extra),
                {"case_id": case["case_id"], "kind": kind, "extra": extra})


def run_background_steps(case_id: str, steps: list[dict]) -> None:
    """Run queued AI computations after the request commits, using fresh DB sessions and current case data."""
    for step in steps:
        name = step["name"]
        try:
            with db.get_conn() as conn:
                from .workflow import Ctx, WorkflowError, latest_verification, load_case

                ctx = Ctx(conn)
                case = load_case(ctx, case_id)
                if name == "intake":
                    intake(ctx, case["description"] or "", None, bool(ctx.photo_kinds(case_id)), case_id)
                elif name == "similar":
                    similar(ctx, case)
                elif name == "triage":
                    triage(ctx, case, case.get("preferred_visit_at"))
                elif name == "estimate":
                    repair_estimate(ctx, case)
                elif name == "verification":
                    verification_guide(ctx, case)
                elif name == "inspection":
                    initial_inspection(ctx, case, case.get("verdict_note"), latest_verification(ctx, case_id))
                elif name == "comms":
                    comms(ctx, step["kind"], case, step.get("extra"))
                else:
                    raise ValueError(f"Unknown background agent step: {name}")
        except WorkflowError:
            log.info("Skipping %s agent step for case %s because the case no longer exists", name, case_id)
        except Exception:
            log.exception("Background %s agent step failed for case %s", name, case_id)
