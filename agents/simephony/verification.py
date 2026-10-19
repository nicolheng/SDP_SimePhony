import json
import os

from .llm_client import get_client, get_models
from .guardrails import scan_for_liability, scan_for_unsafe_steps
from .intake import encode_image
from .rules import load_rules

_ALLOWED = {"looks_resolved", "unclear", "not_resolved"}
_UNCLEAR = {"assessment": "unclear", "observations": "", "matches_location": False}

_WATER = [
    "Look at the repaired area for damp patches, staining or bubbling paint.",
    "Run the nearby tap or shower for a few minutes, then check the repaired area for drips or dampness.",
    "Touch the surface lightly and check it feels dry.",
]
_SURFACE = [
    "Look at the repaired area for new cracks, gaps or uneven finish.",
    "Press the surface gently with your hand and check it feels firm.",
]

# Allow-list of buyer actions per rules.yaml category. Look, touch the surface,
# run water, use switches/doors as normal. Never panels, wiring, climbing or tools.
SAFE_CHECKS: dict[str, list[str]] = {
    "water_leak": _WATER,
    "plumbing": _WATER,
    "waterproofing": _WATER,
    "drainage": [
        "Run water into the drain for a few minutes and check it flows away without pooling.",
        "Look around the drain and the repaired area for dampness or standing water.",
    ],
    "sanitary_fittings": [
        "Use the fitting as normal and check for drips or dampness around it.",
        "Look at the base and joints of the fitting for water or staining.",
    ],
    "electrical": [
        "Switch the repaired light, socket or switch on and off a few times as you normally would and check it works.",
        "Look at the fitting for scorch marks or discolouration.",
        "If you see sparks or smell burning, stop, do not touch anything, and report it.",
    ],
    "wall_crack": _SURFACE,
    "structural_crack": _SURFACE,
    "tiles": [
        "Look at the repaired tiles for cracks, loose edges or gaps in the grout.",
        "Press gently on the tiles and check none feel loose or hollow.",
    ],
    "flooring": [
        "Walk across the repaired floor and check it feels even and firm.",
        "Look for gaps, lifting edges or uneven joins.",
    ],
    "ceiling": [
        "Look at the repaired ceiling area for new stains, sagging or cracks.",
        "Check the area again after the next rain or after water has been used in the unit above.",
    ],
    "roof": [
        "Look at the ceiling below the repaired area for new stains or damp.",
        "Check the area again after the next rain.",
    ],
    "door_window": [
        "Open and close the door or window a few times and check it moves smoothly and closes fully.",
        "Check the lock or latch engages as normal.",
    ],
    "paint": [
        "Look at the repainted area in daylight for patches, drips or uneven colour.",
        "Touch the surface lightly and check it is dry and smooth.",
    ],
    "cabinetry": [
        "Open and close the doors and drawers a few times and check they move smoothly and align.",
        "Look at the repaired area for gaps or loose parts.",
    ],
    "external_works": [
        "Look at the repaired area for cracks, gaps or standing water.",
    ],
    "other": [
        "Look at the repaired area and check it matches what the technician described.",
        "Use the repaired item as you normally would and check it works.",
    ],
}

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
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if scan_for_unsafe_steps(line) or scan_for_liability(line)[0]:
            continue
        kept.append(line)
    return kept


def verification_node(state: dict) -> dict:
    """Photo-checks the technician's repair, then builds a safe, case-specific buyer guide."""
    category = state.get("intake_result", {}).get("category", "other")
    location = _location(state)

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

    checks = SAFE_CHECKS.get(category, SAFE_CHECKS["other"])
    client = get_client()
    _, text_model = get_models()
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

    grace = load_rules().get("grace_period_days")
    protocol = "\n".join(
        [f"The technician's photo appears to show the repair completed at {location}."]
        + lines
        + [f"If any check fails, do not sign off. Reopen the case within {grace} days with a new photo."]
    )
    state["verification_result"] = {
        "category": category,
        "assessment": photo_check["assessment"],
        "observations": photo_check["observations"],
        "protocol": protocol,
        "needs_technician_input": False,
        "technician_message": None,
    }
    state["current_status"] = "PENDING_SIGNOFF"
    return state


def verification_result_node(state: dict) -> dict:
    """Applies the buyer's verification outcome (D2)."""
    outcome = state.get("verification_outcome")
    result = state.setdefault("verification_result", {})
    result["next_event"] = None
    if outcome == "FIXED":
        state["current_status"] = "PENDING_SIGNOFF"
        state["verification_status"] = "verified"
    elif outcome == "NOT_FIXED":
        state["verification_status"] = "not_verified"
        state["current_status"] = "VALID"
        result["next_event"] = "repair.rebook"
    elif outcome == "CANNOT_VERIFY":
        state["verification_status"] = "pending"
    return state
