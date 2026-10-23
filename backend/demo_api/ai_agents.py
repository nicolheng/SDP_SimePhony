"""The LangGraph agents (agents/simephony) in the web app's agent slots, behind USE_AI_AGENTS.

USE_AI_AGENTS (.env):  "" / false = the rule-based stand-ins in agents.py only (default)
                        true / all = every agent below
                        or a comma list: intake, similar, triage, estimate, verification, inspection, comms
Each agent runs inside the web request's transaction (tools.use_connection) in decide_only mode: it returns
its decision and workflow.py writes it, exactly as with the stand-ins. The two things the web app never
writes are saved by the agents themselves: triage's urgency (set_triage_result) and the repair estimate
(set_repair_estimate). If an agent fails (e.g. Ollama is down), that step falls back to its stand-in, so the
app keeps working. The LLM calls run inside the request, so a step can take seconds (text) to a minute or
two (the vision model) on a laptop.
"""
import base64
import logging
import os
import sys
import tempfile
from pathlib import Path

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


def _run(ctx, name: str, ai, fallback):
    """ai() inside the request's transaction; the stand-in if the agent is off or fails."""
    if not enabled(name):
        return fallback()
    try:
        with tools.use_connection(ctx.conn):
            result = ai()
        ctx.invalidate()
        return result
    except Exception as e:  # never let an agent break the request: use the rule-based stand-in
        log.warning("%s agent failed, using the stand-in: %s", name, e)
        print(f"[AI AGENTS] {name} failed, using the stand-in: {e}")
        return fallback()


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
    return _run(ctx, "intake", ai, lambda: stand)


# ---------- SimilarDefectAgent ----------

def similar(ctx, case: dict) -> dict:
    stand = standins.similar(ctx, case)  # same unit + same stack from the DB (what the case page links)

    def ai():
        from agents.simephony.similar_defect import similar_defect_node
        r = similar_defect_node({"case_id": case["case_id"], "unit_id": case["unit_id"],
                                 "user_description": case.get("description") or case.get("summary") or "",
                                 "intake_result": {"category": case["category"]}, "decide_only": True})["similar_cases_result"]
        return {**stand, "cluster_reason": r.get("cluster_reason")}
    return _run(ctx, "similar", ai, lambda: stand)


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
    return _run(ctx, "triage", ai, lambda: standins.triage(ctx, case, preferred))


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
    return _run(ctx, "estimate", ai, lambda: None)


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
    return _run(ctx, "verification", ai, lambda: (standins.verification_guide(case), None))


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
    return _run(ctx, "inspection", ai, lambda: stand)


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
    return _run(ctx, "comms", ai, lambda: standins.comms(ctx, kind, case, extra))
