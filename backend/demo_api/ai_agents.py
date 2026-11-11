"""The LangGraph agents (agents/simephony) in the web app's agent slots, behind USE_AI_AGENTS.

USE_AI_AGENTS (.env):  "" / false = the rule-based stand-ins in agents.py only (default)
                        true / all = every agent below
                        or a comma list: intake, similar, triage, estimate, verification, inspection, comms
                        only = every agent, for testing: no rule-based stand-ins at all (see below)
Direct workflow callers run agents inline. API requests use rule-based results in their transaction and
defer the agent computations until after commit, where each step loads current case data on a fresh
connection. AI results do not replace the rule-based action already returned to the caller.
With "only", the AI result is the one saved, and a failed agent step is an error instead of using the stand-in.
A new report is saved straight away and its agents run after the request (workflow.process_new_report); a
failure there holds the case for SDP review. Other actions run their agents inline, so the request waits for
the model, and a failure fails the request (nothing is saved).
"""
import base64
import logging
import os
import sys
import tempfile
from pathlib import Path

import db
import floor_plan
import tools
from agents.simephony.llm_client import ai_only
from agents.telemetry import record_agent_reasoning, telemetry_payload, telemetry_scope

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
    if value in ("1", "true", "yes", "on", "all", "only"):
        return True
    return name in {x.strip() for x in value.split(",")}


def warmup_ollama_models() -> None:
    """Load configured Ollama models with a minimal completion before live requests use them."""
    if not any(enabled(name) for name in AGENTS):
        log.info("Ollama warmup skipped because USE_AI_AGENTS is disabled")
        return

    from agents.simephony.llm_client import LLM_TIMEOUT_VISION, get_client, get_models, is_local

    if not is_local():  # a cloud model is always loaded; warming up would only use up the free quota
        log.info("Model warmup skipped: cloud model")
        return
    client = get_client()
    vision_model, text_model = get_models()
    for model in dict.fromkeys((text_model, vision_model)):
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply OK."}],
            max_tokens=1,
            temperature=0,
            timeout=LLM_TIMEOUT_VISION,  # warmup is a cold start, so allow the longer limit
        )


def _run(ctx, name: str, ai, fallback, background_args: dict | None = None, failure_fallback=None):
    """Run inline, defer after commit, or use the rule-based result when disabled or unavailable."""
    if not enabled(name):
        return fallback()
    if ctx.defer_agents and not ai_only():
        ctx.defer_agent_step(name, **(background_args or {}))
        return fallback()
    error = None
    with telemetry_scope() as telemetry:
        try:
            with tools.use_connection(ctx.conn):
                result = ai()
                payload = telemetry_payload(telemetry)
                ctx.pending_agent_telemetry[_agent_label(name)] = payload
                if telemetry["agent_step_events"] == 0:
                    case_id = (background_args or {}).get("case_id")
                    if case_id:
                        tools.log_agent_step(
                            case_id,
                            _agent_label(name),
                            f"Completed {name} agent step",
                            payload,
                        )
        except Exception as exc:
            error = exc
    if error is None:
        ctx.invalidate()
        return result
    if error is not None:
        e = error
        if ai_only():
            from .workflow import WorkflowError
            log.error("%s agent failed and USE_AI_AGENTS=only: %s", name, e)
            raise WorkflowError(f"{_agent_label(name)} failed and USE_AI_AGENTS=only, so no rule-based answer was "
                                f"used: {type(e).__name__}: {e}") from e
        log.warning("%s agent failed, using the stand-in: %s", name, e)
        print(f"[AI AGENTS] {name} failed, using the stand-in: {e}")
        case_id = (background_args or {}).get("case_id")
        if case_id:
            _save_fallback(ctx, case_id, name, str(e), type(e).__name__, telemetry)
        else:
            ctx.pending_agent_fallbacks.append({
                "step": name,
                "error_type": type(e).__name__,
                "reason": str(e)[:500],
                "telemetry": telemetry,
            })
        if failure_fallback is not None:
            return failure_fallback()
        return fallback()


def _save_fallback(ctx, case_id: str, name: str, reason: str, error_type: str, telemetry: dict | None = None) -> bool:
    try:
        message = f"Used rule-based fallback for {name}: {error_type}"
        fallback_telemetry = telemetry_payload(telemetry, fallback_used=True, fallback_reason=reason[:500])
        if fallback_telemetry.get("confidence_score") is None:
            fallback_telemetry["confidence_score"] = 0.8
        if fallback_telemetry.get("reasoning") is None:
            fallback_telemetry["reasoning"] = {
                "matched_rule": f"Rule-based fallback for {name}",
                "evidence": reason[:500],
                "related_cases": [],
            }
        with tools.use_connection(ctx.conn):
            result = tools.log_agent_step(
                case_id,
                _agent_label(name),
                message,
                {
                    **fallback_telemetry,
                    "fallback_used": True,
                    "fallback_reason": reason[:500],
                    "step": name,
                    "reason": reason[:500],
                },
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
        if _save_fallback(
            ctx,
            case_id,
            fallback["step"],
            fallback["reason"],
            fallback["error_type"],
            fallback.get("telemetry"),
        ):
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


def _photo_path(
    ctx,
    case_id: str | None,
    kind: str,
    temporary_photos: list[str],
    photo: str | None = None,
) -> str | None:
    """A file path for the vision model: a data URL from the browser is written to a temp file; otherwise
    the case's latest photo of this kind from uploads/."""
    if photo and photo.startswith("data:image/"):
        header, data = photo.split(",", 1)
        suffix = ".png" if "png" in header else ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            temporary_photos.append(f.name)
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


def _cleanup_temp_photos(temporary_photos: list[str]) -> None:
    for path in temporary_photos:
        try:
            os.remove(path)
        except OSError:
            log.warning("Could not delete temporary AI photo %s", path, exc_info=True)


# ---------- IntakeAgent ----------

def intake(ctx, description: str, photo: str | None, has_photo: bool | None = None, case_id: str | None = None,
           pin_room: str | None = None) -> dict:
    """pin_room: the room the buyer pinned on the floor plan (or "Whole unit"). It becomes the location, so no
    follow-up question asks which room it is (floor_plan.apply_pin); other missing details are still asked."""
    stand = standins.intake(description, bool(photo) if has_photo is None else has_photo)
    if "non_defect" in stand:
        return stand  # the rule-based building-management screen stays in front

    def ai():
        from agents.simephony.intake import intake_node
        temporary_photos = []
        try:
            image = _photo_path(ctx, case_id, "original", temporary_photos, photo)
            result = intake_node({
                "case_id": case_id,
                "user_description": floor_plan.intake_text(description, pin_room),
                "image_path": image,
                "decide_only": True,
            })
        finally:
            _cleanup_temp_photos(temporary_photos)
        if result.get("_structured_output_error") and not result.get("needs_human_review"):
            from agents.simephony.structured_output import StructuredOutputError
            raise StructuredOutputError()
        r = result["intake_result"]
        if r.get("category") in (None, "error"):
            raise RuntimeError(f"intake failed: {r.get('summary')}")
        missing = list(r.get("missing_info") or [])
        return {"category": r["category"], "sub_category": r.get("sub_category") or stand["sub_category"],
                "location_in_unit": r.get("location_in_unit") or "", "summary": r.get("summary") or stand["summary"],
                "urgency": r.get("urgency") or "normal", "missing_info": missing,
                # a question only when something is actually missing (avoids needless follow-up rounds)
                "follow_up_question": (r.get("follow_up_question") or stand["follow_up_question"]) if missing else None,
                "confidence_score": r.get("confidence_score"),
                "needs_human_review": result.get("needs_human_review", False),
                "review_reason": result.get("review_reason"),
                "review_step": "IntakeAgent"}
    return floor_plan.apply_pin(_run(ctx, "intake", ai, lambda: stand, {"case_id": case_id}), pin_room, description)


# ---------- SimilarDefectAgent ----------

def similar(ctx, case: dict) -> dict:
    stand = standins.similar(ctx, case)  # same unit + same stack from the DB (what the case page links)

    def ai():
        from agents.simephony.similar_defect import similar_defect_node
        r = similar_defect_node({"case_id": case["case_id"], "unit_id": case["unit_id"],
                                 "user_description": case.get("description") or case.get("summary") or "",
                                 "intake_result": {"category": case["category"], "location_in_unit": case.get("location_in_unit")},
                                 "decide_only": True})["similar_cases_result"]
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
        if state.get("_structured_output_error"):
            from agents.simephony.structured_output import StructuredOutputError
            raise StructuredOutputError()
        if state.get("needs_human_review"):
            result = state["triage_result"]
            return {
                "needs_human_review": True,
                "review_reason": state.get("review_reason"),
                "confidence_score": result.get("confidence_score", 0.0),
                "review_step": "TriageAgent",
            }
        state = booking_node(state)
        b = state["booking_result"]
        if b.get("booking_status") != "PROPOSED":
            raise RuntimeError(b.get("reason") or b.get("error") or "no technician proposed")
        record_agent_reasoning({
            "matched_rule": (state.get("triage_result") or {}).get("matched_rule"),
            "evidence": b["reason"],
            "related_cases": [],
        })
        return {
            "technician_id": b["assigned_technician"],
            "slot": b["start"],
            "reason": b["reason"],
            "needs_human_review": False,
        }
    return _run(ctx, "triage", ai, lambda: standins.triage(ctx, case, preferred),
                {"case_id": case["case_id"]})


# ---------- RepairEstimateAgent (no stand-in: the category's normal hours apply) ----------

def repair_estimate(ctx, case: dict) -> dict | None:
    def rule_fallback():
        from agents.simephony.repair_estimate import repair_estimate_node
        state = repair_estimate_node({
            "case_id": case["case_id"],
            "current_status": case["status"],
            "intake_result": {"category": case["category"]},
            "verdict_note": case.get("verdict_note") or "",
            "reopen_count": case.get("reopen_count") or 0,
            "_skip_scope_facts": True,
        })
        return state["repair_estimate"]

    def ai():
        from agents.simephony.repair_estimate import repair_estimate_node
        r = repair_estimate_node({"case_id": case["case_id"], "current_status": case["status"],
                                  "intake_result": {"category": case["category"]},
                                  "verdict_note": case.get("verdict_note") or "",
                                  "reopen_count": case.get("reopen_count") or 0})["repair_estimate"]
        if r.get("_structured_output_error"):
            from agents.simephony.structured_output import StructuredOutputError
            raise StructuredOutputError()
        if r.get("error"):
            raise RuntimeError(r["error"])
        return r
    return _run(ctx, "estimate", ai, lambda: None, {"case_id": case["case_id"]}, rule_fallback)


# ---------- VerificationAgent ----------

def _save_photo_check(case_id: str, v: dict, similarity: dict | None = None) -> None:
    """Keep the photo check for the developer sign-off, where SDP accepts or rejects the repair."""
    similar = bool((similarity or {}).get("similar"))
    from agents.simephony.llm_client import get_models
    rule = v.get("checked_by") == "same_photo_rule"  # a file comparison in code: the model never saw the photo
    check = {"assessment": v.get("assessment") or "unclear", "observations": v.get("observations") or "",
             "confidence": None if rule else v.get("confidence_score"),
             "flagged": bool(v.get("needs_human_review") or v.get("needs_technician_input") or similar),
             "similar_to_original": similar,
             "source": "rule" if rule else "ai", "model": None if rule else get_models()[0]}
    result = tools.save_repair_photo_check(case_id, check)
    if result.get("ok") is False:
        log.error("Could not save the repair photo check for %s: %s", case_id, result["error"])


def verification_guide(ctx, case: dict) -> tuple[dict | None, str | None, dict | None]:
    """(guide, note for the SDP trace, None). The repair photo is checked against the original and the check is
    saved for the developer sign-off: SDP signs before the buyer, so a person always decides. A flagged photo is
    never held for review: the buyer gets the standard checklist and SDP sees the flag at sign-off."""
    def ai():
        from agents.simephony.verification import verification_node
        temporary_photos = []
        try:
            state = verification_node({
                "case_id": case["case_id"], "current_status": "REPAIRED", "decide_only": True,
                "intake_result": {"category": case["category"], "location_in_unit": case.get("location_in_unit")},
                "user_description": case.get("description") or "", "repair_note": case.get("repair_note") or "",
                "image_path": _photo_path(ctx, case["case_id"], "original", temporary_photos=temporary_photos),
                "repair_photo_path": _photo_path(ctx, case["case_id"], "repair", temporary_photos=temporary_photos)})
        finally:
            _cleanup_temp_photos(temporary_photos)
        v = state["verification_result"]
        if v.get("_structured_output_error"):
            from agents.simephony.structured_output import StructuredOutputError
            raise StructuredOutputError()
        _save_photo_check(case["case_id"], v, state.get("photo_similarity"))
        obs = v.get("observations") or "no notes"
        if v.get("needs_human_review") or v.get("needs_technician_input"):
            return (standins.verification_guide(case),
                    f"Photo check: {v.get('assessment') or 'unclear'} ({obs}). Flagged for SDP to check at sign-off.", None)
        if (state.get("photo_similarity") or {}).get("similar"):
            return (v["guide"], f"Photo check: {v['assessment']} ({obs}). The repair photo looks almost the same as "
                                "the original: flagged for SDP to compare at sign-off.", None)
        return v["guide"], f"Photo check: {v['assessment']} ({obs})", None
    result = _run(ctx, "verification", ai, lambda: (standins.verification_guide(case), None, None),
                  {"case_id": case["case_id"]})
    if len(result) == 2:
        return result[0], result[1], None
    return result


# ---------- InitialInspectionAgent ----------

def initial_inspection(ctx, case: dict, verdict_note: str | None, verification: dict | None) -> dict:
    """The stand-in's facts (timeline, neighbouring units, photo comparison) + the agent's likely components
    and checklist."""
    stand = standins.initial_inspection(ctx, case, verdict_note, verification)

    def ai():
        from agents.simephony.initial_inspection import initial_inspection_node
        sim = standins.similar(ctx, case)
        result = initial_inspection_node({
            "case_id": case["case_id"], "unit_id": case["unit_id"], "decide_only": True,
            "intake_result": {"category": case["category"], "urgency": case.get("urgency"), "summary": case.get("summary")},
            "similar_cases_result": {"past_case_count": sim["occurrence"] - 1, "stack_units": sim["stack_units"],
                                     "timeline": stand["timeline"]}})
        if result.get("_structured_output_error"):
            from agents.simephony.structured_output import StructuredOutputError
            raise StructuredOutputError()
        r = result["initial_inspection_result"]
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
            guide = backend_tools.get_signoff_info(case["case_id"]).get("guide")
            extra["guide"] = _guide_text(guide)
            if isinstance(guide, dict) and guide.get("steps"):
                extra["guide_steps"] = list(guide["steps"])  # the message lists just the checks
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
                result = None
                if name == "intake":
                    result = intake(ctx, case["description"] or "", None, bool(ctx.photo_kinds(case_id)), case_id)
                elif name == "similar":
                    result = similar(ctx, case)
                elif name == "triage":
                    result = triage(ctx, case, case.get("preferred_visit_at"))
                elif name == "estimate":
                    result = repair_estimate(ctx, case)
                elif name == "verification":
                    result = verification_guide(ctx, case)
                elif name == "inspection":
                    result = initial_inspection(ctx, case, case.get("verdict_note"), latest_verification(ctx, case_id))
                elif name == "comms":
                    result = comms(ctx, step["kind"], case, step.get("extra"))
                else:
                    raise ValueError(f"Unknown background agent step: {name}")
                review = result[2] if name == "verification" and isinstance(result, tuple) and len(result) > 2 else result
                if isinstance(review, dict) and review.get("needs_human_review"):
                    with tools.use_connection(conn):
                        review_result = tools.flag_case_for_human_review(
                            case_id,
                            review.get("review_step", _agent_label(name)),
                            review.get("review_reason") or "AI abstained and routed the case to human review.",
                            float(review.get("confidence_score", 0.0)),
                        )
                    if review_result.get("ok") is False:
                        log.error("Could not route case %s to human review: %s", case_id, review_result["error"])
                    break
        except WorkflowError:
            log.info("Skipping %s agent step for case %s because the case no longer exists", name, case_id)
        except Exception:
            log.exception("Background %s agent step failed for case %s", name, case_id)
