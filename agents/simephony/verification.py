import json
import os

from .llm_client import get_client, get_models
from .guardrails import scan_for_liability, scan_for_unsafe_steps, strip_placeholders_and_signoff
from .intake import encode_image
from . import backend_tools

_ALLOWED = {"looks_resolved", "unclear", "not_resolved"}
_UNCLEAR = {"assessment": "unclear", "observations": "", "matches_location": False}
_UNAVAILABLE = "Photo check unavailable"
_VALID_OUTCOMES = {"FIXED", "NOT_FIXED", "CANNOT_VERIFY"}

# Higher-risk categories: the buyer guide is the rules.yaml steps word for word, never LLM phrasing.
_VERBATIM_CATEGORIES = {"electrical", "roof", "door_window"}

# Used only when tools.get_verification_protocol fails or returns nothing.
_FALLBACK_STEPS = [
    "Look at the repaired area and check it matches what the technician described.",
    "Use the repaired item as you normally would and check it works.",
]
# Kept for electrical until rules.yaml carries an equivalent stop rule (board card v2).
_ELECTRICAL_STOP = "If you see sparks or smell burning, stop, do not touch anything, and report it."
# Same wording as the web app's sign-off page (tools.start_verification default).
IF_FAILS = 'If any check fails, do not sign off: choose "Still not fixed" and add a photo. Your case will be reopened.'


def protocol_steps(category: str) -> list[str]:
    """The buyer's check steps for a category: xiaowen's rules.yaml verification_protocols via tools.py,
    screened by the guardrails, with a minimal safe fallback."""
    try:
        steps = list(backend_tools.get_verification_protocol(category).get("steps") or [])
    except Exception as e:
        print(f"[VERIFICATION] check steps unavailable for {category}: {e}")
        steps = []
    steps = [s for s in steps if not scan_for_unsafe_steps(s) and not scan_for_liability(s)[0]]
    if not steps:
        steps = list(_FALLBACK_STEPS)
    if category == "electrical" and not any("spark" in s.lower() and "stop" in s.lower() for s in steps):
        steps.append(_ELECTRICAL_STOP)
    return steps


_VISION_SYSTEM = (
    "You are a property repair photo checker. You compare a technician's repair photo against the "
    "original defect report. Output ONLY valid JSON with exactly these keys: "
    '{"assessment": "looks_resolved" | "unclear" | "not_resolved", '
    '"observations": "one or two short sentences describing what you see", '
    '"matches_location": true | false}. '
    "matches_location is true only if the repair photo shows the location and defect type described. "
    "If the photo is blurry, unrelated or you are not sure, use \"unclear\"."
)


def _location(state: dict) -> str:
    return state.get("intake_result", {}).get("location_in_unit") or "the reported area"


def _image_part(path: str) -> dict:
    return {
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{encode_image(path)}"},
    }


def assess_repair_photo(state: dict) -> dict:
    """One vision call comparing the technician's repair photo to the original report.

    Advisory only: it can hold back the buyer message, it never closes a case.
    """
    client = get_client()
    vision_model, _ = get_models()
    intake = state.get("intake_result", {})
    category = intake.get("category", "other")
    location = _location(state)

    content = []
    original = state.get("image_path")
    if original and os.path.exists(original):
        content.append(_image_part(original))
    content.append(_image_part(state["repair_photo_path"]))
    content.append({
        "type": "text",
        "text": (
            f"Buyer description: {state.get('user_description', '')}\n"
            f"Category: {category}\n"
            f"Location: {location}\n"
            f"Technician repair note: {state.get('repair_note', '')}\n"
            "The first image (if two are given) is the original defect; the last image is the repair photo."
        ),
    })
    messages = [
        {"role": "system", "content": _VISION_SYSTEM},
        {"role": "user", "content": content},
    ]
    try:
        response = client.chat.completions.create(model=vision_model, messages=messages, temperature=0.1)
    except Exception as e:
        print(f"⚠️ [VERIFICATION] vision check failed: {e}")
        return {**_UNCLEAR, "observations": _UNAVAILABLE}
    try:
        raw = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        data = json.loads(raw)
        assessment = data.get("assessment")
        matches = data.get("matches_location")
        if assessment not in _ALLOWED or not isinstance(matches, bool):
            return dict(_UNCLEAR)
        return {
            "assessment": assessment,
            "observations": str(data.get("observations", "")),
            "matches_location": matches,
        }
    except Exception:
        return dict(_UNCLEAR)


def _hold(state: dict, category: str, assessment: str, observations: str, message: str) -> dict:
    state["verification_result"] = {
        "category": category,
        "assessment": assessment,
        "observations": observations,
        "protocol": None,
        "needs_technician_input": True,
        "technician_message": message,
    }
    return state


def _safe_lines(text: str) -> list[str]:
    kept = []
    for line in strip_placeholders_and_signoff(text).splitlines():
        line = line.strip()
        if not line:
            continue
        if line.endswith(":") or line.lower().startswith(("here are", "here is", "sure", "certainly")):
            continue  # preamble / heading, not a check
        if scan_for_unsafe_steps(line) or scan_for_liability(line)[0]:
            continue
        kept.append(line)
    return kept


def _phrase_checks(state: dict, category: str, location: str, checks: list[str]) -> list[str]:
    """Text LLM phrases the allow-listed checks for the location; unsafe/liability lines dropped."""
    client = get_client()
    _, text_model = get_models()
    try:
        response = client.chat.completions.create(
            model=text_model,
            messages=[
                {"role": "system", "content": (
                    "You write short verification checks for a home buyer to confirm a repair. "
                    "Use ONLY the checks provided, phrased for the given location. One check per line, no numbering "
                    "headings or sign-off. Never ask the buyer to open panels, touch wiring, climb or use tools. "
                    "Do not promise the defect will not return and do not admit fault."
                )},
                {"role": "user", "content": (
                    f"Location: {location}\nCategory: {category}\n"
                    f"Technician repair note: {state['repair_note']}\nChecks:\n" + "\n".join(f"- {c}" for c in checks)
                )},
            ],
            temperature=0.1,
        )
        lines = _safe_lines(response.choices[0].message.content)
    except Exception:
        lines = []
    return lines


def _save_guide(case_id: str | None, guide: dict) -> tuple[str | None, str | None]:
    """Store the guide through tools.start_verification. Returns (verification_id, error)."""
    if not case_id:
        return None, "No case_id to save the guide against"
    try:
        saved = backend_tools.start_verification(case_id, guide)
    except Exception as e:
        saved = {"ok": False, "error": str(e)}
    if saved.get("ok") is False:
        print(f"[VERIFICATION] guide for {case_id} not saved: {saved.get('error')}")
        return None, saved.get("error")
    return saved.get("verification_id"), None


def verification_node(state: dict) -> dict:
    """Photo-checks the technician's repair, then builds a safe, case-specific buyer guide."""
    category = state.get("intake_result", {}).get("category", "other")
    location = _location(state)

    status = state.get("current_status")
    if status != "REPAIRED":
        # Not a repair to verify: leave the status alone and never message the buyer.
        reason = f"Repair verification needs status REPAIRED (status is {status})"
        # Only the rejection is recorded; the existing record (guide already sent, flags) stays as it was.
        result = dict(state.get("verification_result") or {})
        result["rejected_reason"] = reason
        result.setdefault("protocol", None)
        state["verification_result"] = result
        return state

    missing = []
    if not state.get("repair_note"):
        missing.append("repair note")
    photo = state.get("repair_photo_path")
    if not photo or not os.path.exists(photo):
        missing.append("repair photo")
    if missing:
        return _hold(
            state, category, "unclear", "",
            f"Please add the {' and '.join(missing)} so the repair can be verified before the buyer is contacted.",
        )

    photo_check = assess_repair_photo(state)
    if photo_check["assessment"] != "looks_resolved" or not photo_check["matches_location"]:
        obs = photo_check["observations"] or "No clear observations."
        return _hold(
            state, category, photo_check["assessment"], photo_check["observations"],
            f"The repair photo could not be confirmed as resolved at {location}: {obs} "
            "Please check the repair or upload a clearer photo.",
        )

    checks = protocol_steps(category)
    if category in _VERBATIM_CATEGORIES:
        lines = list(checks)
    else:
        lines = _phrase_checks(state, category, location, checks)
    if not lines:
        lines = list(checks)

    intro = f"The technician's photo appears to show the repair completed at {location}."
    verification_id, save_error = _save_guide(state.get("case_id"), {"intro": intro, "steps": lines, "ifFails": IF_FAILS})
    state["verification_result"] = {
        "category": category,
        "assessment": photo_check["assessment"],
        "observations": photo_check["observations"],
        "protocol": "\n".join([intro] + lines + [IF_FAILS]),
        "needs_technician_input": False,
        "technician_message": None,
        "verification_id": verification_id,  # the guide saved for the buyer's sign-off page
        "save_error": save_error,
    }
    state["current_status"] = "PENDING_SIGNOFF"
    state["verification_status"] = "pending"  # a new repair cycle: an earlier "verified" no longer applies
    return state


def _guide_text(guide) -> str | None:
    """The saved guide ({intro, steps, ifFails} or a list of steps) as the text the buyer gets."""
    if isinstance(guide, dict):
        lines = [guide.get("intro"), *(guide.get("steps") or []), guide.get("ifFails")]
        return "\n".join(x for x in lines if x) or None
    if isinstance(guide, list):
        return "\n".join(guide) or None
    return guide or None


def signoff_ready_node(state: dict) -> dict:
    """SDP signed the repair off (developer.signed): the buyer can now check it. Loads the guide saved at
    repair.done and the buyer's sign-off deadline, for CommsAgent. Sign-off order: technician -> SDP -> buyer."""
    result = dict(state.get("verification_result") or {})
    result.pop("rejected_reason", None)
    try:
        info = backend_tools.get_signoff_info(state.get("case_id"))
    except Exception as e:
        info = {"ok": False, "error": str(e)}
    if info.get("ok") is False:
        result["rejected_reason"] = f"Sign-off details unavailable: {info.get('error')}"
    elif info["status"] != "PENDING_SIGNOFF" or not info["developer_signed"]:
        result["rejected_reason"] = "The developer has not signed this repair off yet"
    else:
        result["protocol"] = _guide_text(info.get("guide")) or result.get("protocol")
        state["signoff_deadline_local"] = info["deadline_local"]
        state["current_status"] = "PENDING_SIGNOFF"
    state["verification_result"] = result
    return state


def verification_result_node(state: dict) -> dict:
    """Applies the buyer's verification outcome (D2)."""
    outcome = state.get("verification_outcome")
    result = state.setdefault("verification_result", {})
    result.pop("rejected_reason", None)
    status = state.get("current_status")
    if status != "PENDING_SIGNOFF":
        result["rejected_reason"] = f"Verification outcome needs status PENDING_SIGNOFF (status is {status})"
        return state
    if outcome not in _VALID_OUTCOMES:
        result["rejected_reason"] = f"Unknown verification outcome: {outcome!r}"
        return state
    result["next_event"] = None
    if outcome == "FIXED":
        # Sign-off order is technician -> SDP -> buyer (tools.record_verification refuses FIXED before the
        # SDP sign-off), so the buyer's FIXED is the last sign-off and closes the case.
        state["current_status"] = "CLOSED"
        state["verification_status"] = "verified"
    elif outcome == "NOT_FIXED":
        # CONTRACTS: NOT_FIXED needs a new photo and reopens the case; RecurrenceAgent checks escalation next.
        if not state.get("reopen_photo_path"):
            result["rejected_reason"] = "NOT_FIXED needs a new photo showing the problem"
            return state
        state["verification_status"] = "not_verified"
        state["current_status"] = "REOPENED"
        state["reopen_count"] = state.get("reopen_count", 0) + 1
        result["next_event"] = "case.reopened"
    elif outcome == "CANNOT_VERIFY":
        state["verification_status"] = "pending"
    return state
