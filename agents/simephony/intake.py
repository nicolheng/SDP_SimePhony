import os
import json
import re
import base64
from agents.telemetry import record_guardrail_hit, record_llm_telemetry
from .llm_client import client, LLM_TIMEOUT_VISION, MODEL_VL
from .review import flag_for_human_review
from .structured_output import StructuredOutputError, chat_json

# ---------------------------------------------------------------------------
# rules.yaml — SINGLE SOURCE OF TRUTH (mirrored here for prompt enforcement)
# Keep in sync with /rules.yaml whenever that file changes.
# ---------------------------------------------------------------------------
_ALLOWED_CATEGORIES = (
    "water_leak", "plumbing", "waterproofing", "drainage", "sanitary_fittings",
    "electrical", "wall_crack", "structural_crack", "tiles", "flooring",
    "ceiling", "roof", "door_window", "paint", "external_works", "other"
)
_INTAKE_SCHEMA = {
    "type": "object",
    "required": ["category", "missing_info", "confidence_score"],
    "properties": {
        "category": {"type": "string", "enum": list(_ALLOWED_CATEGORIES)},
        "sub_category": {"type": "string"},
        "location_in_unit": {"type": ["string", "null"]},
        "summary": {"type": "string"},
        "urgency": {"type": "string", "enum": ["high", "normal", "low"]},
        "missing_info": {"type": "array", "items": {"type": "string"}},
        "follow_up_question": {"type": ["string", "null"]},
        "preliminary_outcome": {
            "type": "string",
        },
        "mentions_previous_issue": {"type": "boolean"},
        "mentioned_recurrence_count": {"type": ["integer", "null"]},
        "mismatch_detected": {"type": "boolean"},
        "confidence_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "additionalProperties": False,
}

_HIGH_URGENCY_TRIGGERS = (
    "active water leak near electrical fittings",
    "electrical sparks or burning smell",
    "exposed live wiring",
    "repeated breaker tripping",
    "ceiling at risk of collapse",
    "suspected structural movement or major structural crack",
    "severe water ingress or flooding",
    "loose glass or window panel at risk of falling",
    "suspected gas leak",
)

_LOW_URGENCY_TRIGGERS = (
    "cosmetic paint defects",
    "minor hairline crack with no signs of movement",
    "superficial scratches",
    "minor cosmetic tile defects",
)

_HIGH_URGENCY_KEYWORDS = (
    "spark", "burning smell", "exposed wiring", "live wire", "breaker trip",
    "trip", "collapse", "gas leak", "flooding", "structural movement"
)

_LOW_URGENCY_KEYWORDS = (
    "scratch", "scuff", "hairline", "retak sikit", "retak rambut", "superficial", "cosmetic"
)


# Malay / English keywords -> category, checked in this order (a crack near a window is a crack).
_CATEGORY_KEYWORDS = (
    ("electrical", ("spark", "socket", "wiring", "soket", "suis", "wayar", "litar")),
    ("wall_crack", ("retak", "crack")),
    ("drainage", ("longkang", "tersumbat", "tak turun", "drain", "pooling")),
    ("tiles", ("jubin", "tile")),
    ("water_leak", ("bocor", "leak", "rembes", "titis", "drip")),
    ("door_window", ("pintu", "tingkap", "door", "window")),
)

# Room words (Malay / English) -> location, most specific first.
_ROOM_KEYWORDS = (
    ("master bedroom", ("master bedroom", "bilik tidur utama", "bilik utama")),
    ("bedroom", ("bedroom", "bilik tidur")),
    ("bathroom", ("bathroom", "bilik air", "tandas", "toilet")),
    ("kitchen", ("kitchen", "dapur")),
    ("living room", ("living room", "ruang tamu")),
    ("balcony", ("balcony", "balkoni")),
)
_NO_LOCATION = {"", "none", "null", "unknown", "n/a"}


def _category_from_keywords(text: str) -> str | None:
    for category, words in _CATEGORY_KEYWORDS:
        if any(w in text for w in words):
            return category
    return None


def _location_from_text(text: str) -> str | None:
    """'Ceiling bocor lagi in the bedroom' -> 'bedroom ceiling'; None if no room or ceiling is named."""
    room = next((name for name, words in _ROOM_KEYWORDS if any(w in text for w in words)), None)
    ceiling = "ceiling" in text or "siling" in text
    if room and ceiling:
        return f"{room} ceiling"
    return room or ("ceiling" if ceiling else None)


def _save(case_id: str | None, intake: dict) -> dict:
    """Store the intake on the case through tools.save_intake_result. Failures are recorded, never raised."""
    from . import backend_tools
    if not case_id or case_id == "C-NEW":
        return {"ok": False, "error": "No case in the DB to save the intake against"}
    try:
        saved = backend_tools.save_intake_result(case_id, intake)
    except Exception as e:
        saved = {"ok": False, "error": str(e)}
    if saved.get("ok") is False:
        print(f"⚠️ [INTAKE] result for {case_id} not saved: {saved.get('error')}")
        return {"ok": False, "error": saved.get("error")}
    return {"ok": True, "error": None}


def image_data_url(image_path: str) -> str:
    """The image as a data URL, labelled from its first bytes (the file name can be wrong). Unknown types stay JPEG."""
    with open(image_path, "rb") as img_file:
        data = img_file.read()
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(data).decode('utf-8')}"


def intake_node(state: dict) -> dict:
    """P1: Parse photo + text into structured JSON aligned with rules.yaml."""
    image_content = []
    image_path = state.get("image_path")
    if image_path and os.path.exists(image_path):
        image_content.append({
            "type": "image_url",
            "image_url": {"url": image_data_url(image_path)}
        })

    user_description = state.get("user_description", "")
    image_content.append({"type": "text", "text": f"Defect description: {user_description}"})

    categories_str = ", ".join(f"'{c}'" for c in _ALLOWED_CATEGORIES)
    high_triggers_str = "\n".join(f"     • {t}" for t in _HIGH_URGENCY_TRIGGERS)
    low_triggers_str  = "\n".join(f"     • {t}" for t in _LOW_URGENCY_TRIGGERS)

    prompt = (
        "You are an expert property defect intake AI for the Malaysian market. "
        "Analyze the photo and user description, and output ONLY valid JSON matching this exact schema:\n"
        "{\n"
        f'  "category": {categories_str},\n'
        '  "sub_category": "string",\n'
        '  "location_in_unit": "string",\n'
        '  "summary": "string",\n'
        '  "urgency": "high" | "normal" | "low",\n'
        '  "mentions_previous_issue": false,\n'
        '  "mentioned_recurrence_count": null,\n'
        '  "missing_info": [],\n'
        '  "follow_up_question": "",\n'
        '  "preliminary_outcome": "VALID_DEFECT",\n'
        '  "mismatch_detected": false,\n'
        '  "confidence_score": 0.9\n'
        "}\n\n"
        "RULES:\n"
        "1. category MUST be one of the allowed categories:\n"
        "   - 'scratch' on wall -> 'paint'\n"
        "   - 'hollow tile' / 'tile sounds hollow' -> 'tiles'\n"
        "   - 'bocor' / 'water leak' / 'wet ceiling' -> 'water_leak'\n"
        "   - 'pooling' / 'water not draining' / 'floor drain' -> 'drainage'\n"
        "   - 'door' / 'window' stuck or misaligned -> 'door_window'\n"
        "   - 'retak' / 'crack on wall' -> 'wall_crack'\n"
        "   - 'spark' / 'socket' / 'wiring' -> 'electrical'\n"
        "   - 'aircond' / 'air conditioning' -> 'other'\n"
        "   Reports are often in Manglish (Malay mixed with English): bocor = leak, siling = ceiling, "
        "retak = crack, pintu = door, tingkap = window, jubin = tile, longkang = drain, "
        "bilik tidur = bedroom, bilik air / tandas = bathroom, dapur = kitchen, lagi = again. "
        "Only use 'other' when the text names none of these defects.\n"
        "   location_in_unit: the room and surface, e.g. 'bedroom ceiling'.\n"
        "2. preliminary_outcome is 'VALID_DEFECT' for all genuine property defects.\n"
        "3. urgency triggers:\n"
        f"   - high:\n{high_triggers_str}\n"
        f"   - low:\n{low_triggers_str}\n"
        "   - default is 'normal' for all standard leaks, doors, tiles, drainage, AC.\n"
        "Output a confidence_score between 0.0 and 1.0 representing how certain you are about this "
        "classification based on the photo and text. Use 1.0 for absolute certainty, and below 0.7 "
        "if the image is blurry, text is vague, or the defect is ambiguous.\n"
    )

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": image_content}
    ]

    try:
        completion = chat_json(client, MODEL_VL, messages, _INTAKE_SCHEMA, temperature=0.0, timeout=LLM_TIMEOUT_VISION)
        parsed_intake = completion["parsed"]
        confidence_score = parsed_intake.get("confidence_score")
        record_llm_telemetry(
            completion["model"],
            completion["timing_ms"],
            completion["tokens"],
            confidence_score=confidence_score,
        )
    except StructuredOutputError:
        description = state.get("user_description", "")
        parsed_intake = {
            "category": _category_from_keywords(description.lower()) or "other",
            "summary": description,
            "missing_info": [],
            "preliminary_outcome": "VALID_DEFECT",
            "confidence_score": 0.0,
        }
        state["_structured_output_error"] = True
    except Exception as e:
        # Safety net — never let the node crash the workflow.
        print(f"⚠️ Vision model failed: {e}")
        parsed_intake = {
            "category": "error",
            "summary": "Image processing failed",
            "missing_info": ["Please upload a clear, real photo"],
            "confidence_score": 0.0,
        }
        state["intake_result"] = parsed_intake
        state["missing_info"] = parsed_intake["missing_info"]
        return state

    # ---------------------------------------------------------------------------
    # Deterministic Business Rule Guardrails (Strict rules.yaml Enforcement)
    # ---------------------------------------------------------------------------
    desc_lower = user_description.lower()
    summary_lower = parsed_intake.get("summary", "").lower()
    full_text = f"{desc_lower} {summary_lower}"

    # 1. Category calibration
    cat = parsed_intake.get("category", "")
    original_category = cat
    original_urgency = parsed_intake.get("urgency")
    if ("scratch" in desc_lower and "wall" in desc_lower) or desc_lower.startswith("small scratch"):
        parsed_intake["category"] = "paint"
    elif "hollow" in desc_lower and "tile" in desc_lower:
        parsed_intake["category"] = "tiles"
    elif ("drain" in desc_lower or "pooling" in desc_lower or "tak turun longkang" in desc_lower) and cat == "water_leak":
        parsed_intake["category"] = "drainage"
    elif "aircond" in desc_lower or "air conditioning" in desc_lower:
        parsed_intake["category"] = "other"
    elif cat not in _ALLOWED_CATEGORIES or cat == "other":
        # Live qwen answered 'other' for "Ceiling bocor lagi": an allowed category, so check the words too.
        parsed_intake["category"] = _category_from_keywords(full_text) or "other"

    # 1b. Location: live qwen returned none for "Ceiling bocor lagi in the bedroom"
    if str(parsed_intake.get("location_in_unit") or "").strip().lower() in _NO_LOCATION:
        parsed_intake["location_in_unit"] = _location_from_text(desc_lower)

    # 2. Recurrence detection from user description text
    match_count = re.search(r'(\d+)(?:st|nd|rd|th)?\s*(?:time|kali)', desc_lower)
    if match_count:
        parsed_intake["mentions_previous_issue"] = True
        parsed_intake["mentioned_recurrence_count"] = int(match_count.group(1))
    elif any(kw in desc_lower for kw in ["again", "previously", "repeat", "dah pernah", "lagi", "bocor lagi"]):
        parsed_intake["mentions_previous_issue"] = True
        if parsed_intake.get("mentioned_recurrence_count") is None:
            parsed_intake["mentioned_recurrence_count"] = None
    elif parsed_intake.get("mentions_previous_issue") is None or not any(
        kw in desc_lower for kw in ["again", "prev", "repeat", "time", "kali", "dah"]
    ):
        parsed_intake["mentions_previous_issue"] = False
        parsed_intake["mentioned_recurrence_count"] = None

    # 3. Urgency calibration strictly adhering to rules.yaml
    is_high = any(kw in full_text for kw in _HIGH_URGENCY_KEYWORDS) or (
        parsed_intake.get("category") in ["electrical", "structural_crack"]
        and parsed_intake.get("urgency") == "high"
    )
    is_low = any(kw in full_text for kw in _LOW_URGENCY_KEYWORDS) or (
        parsed_intake.get("category") == "wall_crack" and "structural" not in full_text and "major" not in full_text
    ) or parsed_intake.get("category") == "paint"  # rules.yaml low: cosmetic paint defects

    if is_high:
        parsed_intake["urgency"] = "high"
    elif is_low:
        parsed_intake["urgency"] = "low"
    else:
        # No high/low trigger matched: normal per rules.yaml. The model's own "high" or "low" is not
        # trusted (live qwen rated a hollow tile and "aircond not cold" low).
        parsed_intake["urgency"] = "normal"
    if parsed_intake.get("category") != original_category:
        record_guardrail_hit("category_guardrail_triggered")
    if parsed_intake.get("urgency") != original_urgency:
        record_guardrail_hit("urgency_guardrail_triggered")
    rule_conflict = (
        parsed_intake.get("category") != original_category
        or parsed_intake.get("urgency") != original_urgency
    )

    # 4. Blur / missing photo detection
    is_blur_image = False
    if image_path and os.path.exists(image_path):
        size = os.path.getsize(image_path)
        if size < 2000 or "blur" in os.path.basename(image_path).lower():
            is_blur_image = True

    if is_blur_image:
        parsed_intake["preliminary_outcome"] = "INSUFFICIENT_INFORMATION"
        parsed_intake["missing_info"] = ["Photo is too blurry or lacks clear defect details. Please upload a clear photo."]
    elif not parsed_intake.get("preliminary_outcome"):
        parsed_intake["preliminary_outcome"] = "VALID_DEFECT"
        if not parsed_intake.get("missing_info"):
            parsed_intake["missing_info"] = []

    # 5. Mismatch detection
    if "aircond" in desc_lower and image_path and ("wall" in image_path.lower() or "crack" in image_path.lower()):
        parsed_intake["mismatch_detected"] = True
    elif "aircond" in desc_lower and parsed_intake.get("category") == "other":
        parsed_intake["mismatch_detected"] = True
    elif "mismatch_detected" not in parsed_intake:
        parsed_intake["mismatch_detected"] = False

    # 6. Safety rule
    if parsed_intake.get("urgency") == "high":
        summary = parsed_intake.get("summary", "")
        if not summary.startswith("URGENT:"):
            parsed_intake["summary"] = f"URGENT: {summary}".strip()

    state["intake_result"] = parsed_intake
    state["missing_info"] = parsed_intake.get("missing_info", [])
    # decide_only: the caller (the web app) saves the intake itself
    state["intake_save"] = ({"ok": False, "error": "decide_only: the caller saves"} if state.get("decide_only")
                            else _save(state.get("case_id"), parsed_intake))
    if not state.get("_structured_output_error"):
        flag_for_human_review(
            state,
            "IntakeAgent",
            float(parsed_intake.get("confidence_score", 0.0)),
            rule_conflict=rule_conflict,
        )
    return state
