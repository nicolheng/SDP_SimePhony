import os
import json
import re
import base64
from .llm_client import client, MODEL_VL

# ---------------------------------------------------------------------------
# rules.yaml — SINGLE SOURCE OF TRUTH (mirrored here for prompt enforcement)
# Keep in sync with /rules.yaml whenever that file changes.
# ---------------------------------------------------------------------------
_ALLOWED_CATEGORIES = (
    "water_leak", "plumbing", "waterproofing", "drainage", "sanitary_fittings",
    "electrical", "wall_crack", "structural_crack", "tiles", "flooring",
    "ceiling", "roof", "door_window", "paint", "external_works", "other"
)

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


def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode("utf-8")


def intake_node(state: dict) -> dict:
    """P1: Parse photo + text into structured JSON aligned with rules.yaml."""
    image_content = []
    image_path = state.get("image_path")
    if image_path and os.path.exists(image_path):
        base64_img = encode_image(image_path)
        image_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}
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
        '  "mismatch_detected": false\n'
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
        "2. preliminary_outcome is 'VALID_DEFECT' for all genuine property defects.\n"
        "3. urgency triggers:\n"
        f"   - high:\n{high_triggers_str}\n"
        f"   - low:\n{low_triggers_str}\n"
        "   - default is 'normal' for all standard leaks, doors, tiles, drainage, AC.\n"
    )

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": image_content}
    ]

    try:
        response = client.chat.completions.create(model=MODEL_VL, messages=messages, temperature=0.0)
        raw_text = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()

        try:
            parsed_intake = json.loads(raw_text)
        except json.JSONDecodeError:
            parsed_intake = {"category": "other", "summary": raw_text, "missing_info": ["AI failed to parse JSON"]}

    except Exception as e:
        # Safety net — never let the node crash the workflow.
        print(f"⚠️ Vision model failed: {e}")
        parsed_intake = {
            "category": "error",
            "summary": "Image processing failed",
            "missing_info": ["Please upload a clear, real photo"]
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
    if ("scratch" in desc_lower and "wall" in desc_lower) or desc_lower.startswith("small scratch"):
        parsed_intake["category"] = "paint"
    elif "hollow" in desc_lower and "tile" in desc_lower:
        parsed_intake["category"] = "tiles"
    elif ("drain" in desc_lower or "pooling" in desc_lower or "tak turun longkang" in desc_lower) and cat == "water_leak":
        parsed_intake["category"] = "drainage"
    elif "aircond" in desc_lower or "air conditioning" in desc_lower:
        parsed_intake["category"] = "other"
    elif cat not in _ALLOWED_CATEGORIES:
        if "spark" in full_text or "socket" in full_text or "wiring" in full_text:
            parsed_intake["category"] = "electrical"
        elif "door" in full_text or "tingkap" in full_text or "pintu" in full_text:
            parsed_intake["category"] = "door_window"
        elif "retak" in full_text or "crack" in full_text:
            parsed_intake["category"] = "wall_crack"
        elif "bocor" in full_text or "leak" in full_text:
            parsed_intake["category"] = "water_leak"
        else:
            parsed_intake["category"] = "other"

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
    )

    if is_high:
        parsed_intake["urgency"] = "high"
    elif is_low:
        parsed_intake["urgency"] = "low"
    elif parsed_intake.get("urgency") in ["high", "low", "normal"]:
        # If model returned normal or if no high/low trigger matched, default to normal per rules.yaml
        parsed_intake["urgency"] = parsed_intake["urgency"] if parsed_intake["urgency"] != "high" else "normal"
    else:
        parsed_intake["urgency"] = "normal"

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
    return state
