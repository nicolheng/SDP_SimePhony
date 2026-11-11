"""Unit floor plans (frontend/src/lib/floor-plan.json, also drawn by the web app): the room a buyer's pin falls
in, and how that pinned room becomes the case's location so IntakeAgent doesn't ask which room it is."""
import json
import re
from functools import lru_cache
from typing import Optional

import db

PLAN_PATH = db.ROOT / "frontend" / "src" / "lib" / "floor-plan.json"
WHOLE_UNIT = "Whole unit"

_ASKS_WHERE = re.compile(r"location|which room|what room|\bwhere\b", re.IGNORECASE)
DETAIL_QUESTION = "Could you add a clearer photo or a little more detail about what you see?"

_SURFACES = (
    ("ceiling", ("ceiling", "siling")),
    ("wall", ("wall", "dinding")),
    ("floor", ("floor", "lantai")),
    ("window", ("window", "tingkap")),
    ("door", ("door", "pintu")),
    ("socket", ("socket", "power point", "plug point")),
    ("sink", ("sink", "basin", "singki")),
    ("toilet", ("toilet bowl", "mangkuk tandas", "cistern")),
    ("shower", ("shower",)),
    ("drain", ("drain", "longkang", "floor trap")),
    ("tap", ("tap", "faucet", "paip")),
)


@lru_cache(maxsize=1)
def _plans() -> dict:
    return json.loads(PLAN_PATH.read_text(encoding="utf-8"))


def layout_for(unit_id: str) -> dict:
    """The unit's floor plan (every unit uses the default layout unless floor-plan.json maps it to another)."""
    plans = _plans()
    return plans["layouts"][plans["units"].get(unit_id, plans["default"])]


def _inside(x: float, y: float, points: list) -> bool:
    """Ray casting: whether (x, y) is inside the polygon."""
    hit = False
    for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def _on_edge(x: float, y: float, points: list) -> bool:
    """Whether (x, y) lies on the polygon's outline (a wall): the ray test can miss points there."""
    for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
        cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)
        if abs(cross) < 1e-9 and min(x1, x2) - 1e-9 <= x <= max(x1, x2) + 1e-9 and min(y1, y2) - 1e-9 <= y <= max(y1, y2) + 1e-9:
            return True
    return False


def room_at(unit_id: str, x: float, y: float) -> Optional[str]:
    """The room label at a pin. x, y: fractions (0..1) of the plan's width and height. None outside every room."""
    layout = layout_for(unit_id)
    px, py = x * layout["width"], y * layout["height"]
    rooms = layout["rooms"]
    room = next((r for r in rooms if _inside(px, py, r["points"])), None) or next((r for r in rooms if _on_edge(px, py, r["points"])), None)
    return room["label"] if room else None


def resolve_pin(unit_id: str, x: Optional[float], y: Optional[float], whole_unit: bool = False) -> dict:
    """The pin to store on a new case: {x, y, room}. whole_unit: the buyer chose "Whole unit" (x, y None).
    Raises ValueError for a pin outside the plan."""
    if whole_unit:
        return {"x": None, "y": None, "room": WHOLE_UNIT}
    if x is None or y is None or not (0 <= x <= 1 and 0 <= y <= 1):
        raise ValueError("Please tap where the defect is on the floor plan.")
    room = room_at(unit_id, x, y)
    if not room:
        raise ValueError("That spot is outside the floor plan. Please tap inside a room.")
    return {"x": round(x, 4), "y": round(y, 4), "room": room}


def pinned_location(room: str, intake_location: Optional[str], description: str) -> str:
    """The case location from the pinned room: the room plus the part of it the report names.
    ("Master bedroom", "bedroom ceiling", ...) -> "master bedroom ceiling"; the AI's own location is kept when it
    already names the pinned room ("master bedroom ceiling above the wardrobe")."""
    if room == WHOLE_UNIT:
        return "whole unit"
    name = room.lower()
    location = (intake_location or "").strip()
    if name in location.lower():
        return location
    for text in (location.lower(), description.lower()):
        for surface, words in _SURFACES:
            if any(re.search(rf"\b{re.escape(w)}\b", text) for w in words):
                return f"{name} {surface}"
    return name


def apply_pin(result: dict, room: Optional[str], description: str) -> dict:
    """IntakeAgent's result with the pinned room as the location: nothing asks where the defect is any more.
    Other missing details (a blurry photo, too little detail) still get their follow-up question."""
    if not room or "non_defect" in result:
        return result
    had_location = bool((result.get("location_in_unit") or "").strip())
    location = pinned_location(room, result.get("location_in_unit"), description)
    missing = [m for m in (result.get("missing_info") or []) if not _ASKS_WHERE.search(str(m))]
    question = result.get("follow_up_question")
    if not missing:
        question = None
    elif question and _ASKS_WHERE.search(question):
        question = DETAIL_QUESTION
    summary = result.get("summary") or ""
    if not had_location and summary and room != WHOLE_UNIT and " in " not in summary.lower():
        summary = f"{summary} in {room.lower()}"
    return {**result, "location_in_unit": location, "summary": summary, "missing_info": missing, "follow_up_question": question}


def intake_text(description: str, room: Optional[str]) -> str:
    """The report as IntakeAgent reads it: the buyer's words plus where they pinned it on the floor plan."""
    if not room:
        return description
    where = "the whole unit, not one spot" if room == WHOLE_UNIT else room
    return f"{description.rstrip()}\n(Location pinned on the unit floor plan: {where}.)"
