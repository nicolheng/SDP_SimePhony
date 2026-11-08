import os
import json
import re
import base64
from agents.telemetry import record_agent_reasoning, record_confidence_score, record_guardrail_hit, record_llm_telemetry
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
    "required": ["category", "missing_info", "confidence_score", "reasoning"],
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
        "reasoning": {"type": "string"},
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

_HIGH_RULE_PATTERNS = (
    r"(?:(?:leak|bocor|drip)[^.!?\n]*(?:socket|switch|light|lamp|wiring|wire|plug|soket|suis|wayar)"
    r"|(?:socket|switch|light|lamp|wiring|wire|plug|soket|suis|wayar)[^.!?\n]*(?:leak|bocor|drip))",
    r"spark\w*|burn\w*|smok\w*|scorch\w*|percik\w*|terbakar|hangus",
    r"exposed[^.!?\n]*(?:wire|wiring)|(?:live|exposed)[^.!?\n]*(?:wire|wiring)|wayar hidup",
    r"(?:breaker|fuse)[^.!?\n]*trip|trip[^.!?\n]*(?:breaker|fuse)",
    r"collaps|sag|bulg|fall|runtuh",
    r"structur|major crack|wide crack|movement|shift|retak besar|beam|column",
    r"flood|banjir|gush|ankle|knee|torrent|ingress",
    r"glass|kaca|pane|falling",
    r"\bgas\b",
)

_LOW_RULE_PATTERNS = (
    r"paint|cat|peel|mengelupas",
    r"hairline|minor crack|retak rambut|retak sikit",
    r"scratch|scuff|superficial",
    r"tile|jubin|cosmetic|minor",
)


# Malay / English keywords -> category, checked in this order (a crack near a window is a crack).
_CATEGORY_KEYWORDS = (
    ("electrical", ("spark", "socket", "wiring", "soket", "suis", "wayar", "litar")),
    ("wall_crack", ("retak", "crack")),
    ("drainage", ("longkang", "tersumbat", "tak turun", "drain", "pooling")),
    ("tiles", ("jubin", "tile")),
    ("sanitary_fittings", ("flush", "cistern", "pam tandas", "mangkuk tandas", "faucet")),
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
ROOM_QUESTION = "Which room is this in, and roughly where (e.g. ceiling above the wardrobe)?"


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


# Strength (0-255) of the photo's crispest edges: the top 1% of edge pixels, photo scaled to 256 px wide with the
# border cut off. Blur flattens every edge; even a plain ceiling has a few crisp ones (a stain's outline).
# Measured on the test photos: sharp 13 (plain ceiling) to 255, heavily blurred copies 4-8, blur.jpg 0,
# mildly blurred copies 5-34 (some are flagged, some not).
_MIN_EDGE_STRENGTH = 10
_MIN_PHOTO_SIDE = 200  # px


def _photo_too_unclear(path: str) -> bool:
    """True when the photo is too small or too blurred to show a defect."""
    try:
        from PIL import Image, ImageFilter
        with Image.open(path) as img:
            if min(img.size) < _MIN_PHOTO_SIDE:
                return True
            g = img.convert("L")
            g = g.resize((256, max(8, round(256 * g.height / g.width))))
            edges = g.filter(ImageFilter.FIND_EDGES)
            edges = edges.crop((2, 2, edges.width - 2, edges.height - 2))  # FIND_EDGES marks the border itself
            counts, seen = edges.histogram(), 0
            for strength in range(255, -1, -1):  # walk down from the strongest edges to the top 1%
                seen += counts[strength]
                if seen >= sum(counts) * 0.01:
                    return strength < _MIN_EDGE_STRENGTH
            return True
    except ImportError:
        return os.path.getsize(path) < 2000  # Pillow missing: only a tiny file counts as unclear
    except Exception:
        return False  # unreadable here; the vision model still looks at it


def _room_in_text(text: str) -> str | None:
    """The room a report names ('bilik tidur utama' -> 'master bedroom'), or None."""
    return next((name for name, words in _ROOM_KEYWORDS if any(w in text for w in words)), None)


def _drop_room(title: str) -> str | None:
    """The title without its room phrase: 'Hairline crack on living room wall' -> 'Hairline crack'.
    None if nothing sensible is left."""
    words = "|".join(re.escape(w) for _, ws in _ROOM_KEYWORDS for w in ws)
    cut = re.sub(rf"\s+(?:in|on|at|of|near|inside|from|beside)\s+(?:the\s+)?(?:{words})\b(?:\s+(?:wall|ceiling|floor))?"
                 r"(?=\s*$|\s*[,.;]|\s+(?:is|are|was|has|keeps|does|not|won't|can't|cannot)\b)",
                 "", title, flags=re.IGNORECASE)
    cut = " ".join(cut.split()).strip(" ,.-")
    return cut if cut != title.strip(" ,.-") and len(cut.split()) >= 2 else None


def _names_room(location: str, room: str) -> bool:
    """Whether the model's location keeps the resident's room: 'bedroom, beside bed' keeps 'master bedroom'."""
    words = set(re.findall(r"[a-z]+", location.lower()))
    return bool(words & (set(room.split()) - {"room"}))


def _evidence_quote(text: str, terms: tuple[str, ...]) -> str | None:
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
        if any(term in sentence.lower() for term in terms):
            return sentence.strip()
    return None


def _evidence_sentence(text: str, pattern: str) -> str | None:
    return next(
        (
            sentence.strip()
            for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip())
            if re.search(pattern, sentence, re.IGNORECASE)
        ),
        None,
    )


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


_TITLE_MAX_WORDS = 10


def _short_title(summary: str) -> str:
    """The case title shown in lists, cards and messages: no full stop, and an over-long model answer cut at its
    first clause ("Toilet flush button sticks after flushing and water keeps running…" -> "…after flushing")."""
    title = summary.strip().rstrip(".").strip()
    if len(title.split()) > _TITLE_MAX_WORDS:
        title = re.split(r",|;| and | which | until | when ", title, maxsplit=1)[0].strip()
    return title


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
        '  "confidence_score": 0.9,\n'
        '  "reasoning": "brief explanation of category and rule"\n'
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
        "   - a faulty toilet flush, cistern, tap, basin or shower fitting -> 'sanitary_fittings', even when water "
        "keeps running (that is the fitting, not a leak)\n"
        "   - 'aircond' / 'air conditioning' -> 'other'\n"
        "   Reports are often in Manglish (Malay mixed with English): bocor = leak, siling = ceiling, "
        "retak = crack, pintu = door, tingkap = window, jubin = tile, longkang = drain, "
        "bilik tidur = bedroom, bilik air / tandas = bathroom, dapur = kitchen, lagi = again. "
        "Only use 'other' when the text names none of these defects.\n"
        "   location_in_unit: 'room, spot', in English. The room is the one the resident names (bilik tidur utama = "
        "master bedroom). The spot is a few words from the report saying where in that room, such as the fitting, "
        "furniture or surface it is next to, above or under; leave it out if the report gives none. Never add a "
        "ceiling, wall or floor that is not mentioned or shown.\n"
        "   summary: a short title for the case in English, 3 to 8 words, no full stop: the defect and where it is, "
        "e.g. 'Hairline crack on living room wall' or 'Loose handle on second bedroom door'. "
        "Never copy the resident's description.\n"
        "2. preliminary_outcome is 'VALID_DEFECT' for all genuine property defects.\n"
        "3. urgency triggers:\n"
        f"   - high:\n{high_triggers_str}\n"
        f"   - low:\n{low_triggers_str}\n"
        "   - default is 'normal' for all standard leaks, doors, tiles, drainage, AC.\n"
        "You MUST output a 'reasoning' string explaining your decision, and a 'confidence_score' between 0.0 and 1.0. "
        "Use 1.0 for absolute certainty, and below 0.7 if the image is blurry, text is vague, or the defect is ambiguous.\n"
    )

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": image_content}
    ]

    try:
        completion = chat_json(client, MODEL_VL, messages, _INTAKE_SCHEMA, temperature=0.0, timeout=LLM_TIMEOUT_VISION)
        parsed_intake = completion["parsed"]
        confidence_score = float(parsed_intake.get("confidence_score") or 0.85)
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
            "confidence_score": 0.85,
            "reasoning": "Fallback keyword classification",
        }
        state["_structured_output_error"] = True
    except Exception as e:
        # Safety net — never let the node crash the workflow.
        print(f"⚠️ Vision model failed: {e}")
        parsed_intake = {
            "category": "error",
            "summary": "Image processing failed",
            "missing_info": ["Please upload a clear, real photo"],
            "preliminary_outcome": "INSUFFICIENT_INFORMATION",
            "confidence_score": 0.5,
            "reasoning": f"Vision model processing error: {e}",
        }
        record_confidence_score(0.5)
        record_agent_reasoning({
            "matched_rule": "Vision model error fallback",
            "evidence": str(e),
            "related_cases": [],
        })
        state["intake_result"] = parsed_intake
        state["missing_info"] = parsed_intake["missing_info"]
        return state

    # Force Python-Level Fallbacks (Crucial)
    reasoning = parsed_intake.get("reasoning") or f"Rule-based decision: {parsed_intake.get('category') or 'Standard processing'}"
    confidence = parsed_intake.get("confidence_score") or 0.85
    try:
        confidence = float(confidence)
    except (ValueError, TypeError):
        confidence = 0.85
    parsed_intake["reasoning"] = str(reasoning)
    parsed_intake["confidence_score"] = confidence
    record_confidence_score(confidence)

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
    category_rule = None
    category_evidence_terms: tuple[str, ...] = ()
    if ("scratch" in desc_lower and "wall" in desc_lower) or desc_lower.startswith("small scratch"):
        parsed_intake["category"] = "paint"
        category_rule = "Rule: scratches on a wall are classified as paint"
        category_evidence_terms = ("scratch", "wall")
    elif "hollow" in desc_lower and "tile" in desc_lower:
        parsed_intake["category"] = "tiles"
        category_rule = "Rule: hollow tiles are classified as tiles"
        category_evidence_terms = ("hollow", "tile")
    elif ("drain" in desc_lower or "pooling" in desc_lower or "tak turun longkang" in desc_lower) and cat == "water_leak":
        parsed_intake["category"] = "drainage"
        category_rule = "Rule: drain reports are classified as drainage"
        category_evidence_terms = ("drain", "pooling", "longkang")
    elif "aircond" in desc_lower or "air conditioning" in desc_lower:
        parsed_intake["category"] = "other"
        category_rule = "Rule: air-conditioning reports are routed to other"
        category_evidence_terms = ("aircond", "air conditioning")
    elif cat not in _ALLOWED_CATEGORIES or cat == "other":
        # Live qwen answered 'other' for "Ceiling bocor lagi": an allowed category, so check the words too.
        parsed_intake["category"] = _category_from_keywords(full_text) or "other"
        if parsed_intake["category"] != "other":
            category_rule = f"Keyword classification: {parsed_intake['category']}"
            category_evidence_terms = tuple(
                term for terms in _CATEGORY_KEYWORDS if terms[0] == parsed_intake["category"] for term in terms[1]
            )

    # 1b. Location: live qwen returned none for "Ceiling bocor lagi in the bedroom", and live llava put
    # "Pintu bilik tidur" in the living room: the room the resident names wins over the model's
    location = str(parsed_intake.get("location_in_unit") or "").strip()
    named_room = _room_in_text(desc_lower)
    other_room = named_room and _room_in_text(location.lower()) and not _names_room(location, named_room)
    if location.lower() in _NO_LOCATION or other_room:
        parsed_intake["location_in_unit"] = _location_from_text(desc_lower)
    elif not named_room:
        # The report names no room, so any room the model gives is a guess from the photo (live llava turned a
        # blurry "There's a mark here" into "living room wall"). Keep only what the text says and ask for the room.
        parsed_intake["location_in_unit"] = _location_from_text(desc_lower)
    if not named_room:
        parsed_intake["missing_info"] = [*(parsed_intake.get("missing_info") or []), "location_in_unit"]
        if not (parsed_intake.get("follow_up_question") or "").strip():
            parsed_intake["follow_up_question"] = ROOM_QUESTION

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
    model_was_specific = original_category in _ALLOWED_CATEGORIES and original_category != "other"
    rule_conflict = model_was_specific and parsed_intake.get("category") != original_category
    urgency_changed = parsed_intake.get("urgency") != original_urgency
    matched_rule = category_rule
    evidence = _evidence_quote(user_description, category_evidence_terms)
    if not matched_rule and urgency_changed:
        rule_triggers = _HIGH_URGENCY_TRIGGERS if is_high else _LOW_URGENCY_TRIGGERS if is_low else ()
        rule_patterns = _HIGH_RULE_PATTERNS if is_high else _LOW_RULE_PATTERNS if is_low else ()
        for rule_number, (trigger, pattern) in enumerate(zip(rule_triggers, rule_patterns), start=1):
            evidence_quote = _evidence_sentence(user_description, pattern)
            if evidence_quote:
                rule_prefix = "H" if is_high else "L"
                matched_rule = f"Rule {rule_prefix}{rule_number}: {trigger}"
                evidence = evidence_quote
                break
        if not matched_rule:
            matched_rule = "Rule-based urgency calibration"
    if not evidence:
        evidence = user_description.strip() or None
    rule_or_reason = matched_rule or parsed_intake.get("reasoning") or f"Classification rule: {parsed_intake.get('category')}"
    record_agent_reasoning({
        "matched_rule": rule_or_reason,
        "evidence": evidence,
        "related_cases": [],
    })

    # 4. Blur / missing photo detection: measured from the picture itself (not its file name)
    is_blur_image = bool(image_path and os.path.exists(image_path) and _photo_too_unclear(image_path))

    if is_blur_image:
        parsed_intake["preliminary_outcome"] = "INSUFFICIENT_INFORMATION"
        parsed_intake["missing_info"] = [*(parsed_intake.get("missing_info") or []),
                                         "Photo is too blurry or lacks clear defect details. Please upload a clear photo."]
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

    # The title stays plain: the app shows urgency as its own badge (and technician emails as "Urgency: high").
    # Live llava sometimes returns the resident's own sentence (Malay included) as the title: build one instead.
    summary = parsed_intake.get("summary") or ""
    where = str(parsed_intake.get("location_in_unit") or "")
    # The title must not name another room than the (already checked) location: live llava titled
    # "Siling bilik tidur utama bocor" as "Water leak in the bathroom" while the location was right.
    title_room = _room_in_text(summary.lower())
    named_room = _room_in_text(desc_lower)
    if title_room and not named_room:
        summary = _drop_room(summary) or summary  # "Hairline crack on living room wall" -> "Hairline crack"
        title_room = _room_in_text(summary.lower())
    wrong_room = bool(title_room and _room_in_text(where.lower()) and not _names_room(where, title_room))
    if wrong_room or summary.strip(" .!?").lower() == user_description.strip(" .!?").lower():
        where = parsed_intake.get("location_in_unit")
        label = str(parsed_intake.get("category") or "defect").replace("_", " ").capitalize()
        summary = f"{label} in {where}" if where else label
    parsed_intake["summary"] = _short_title(summary)

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
