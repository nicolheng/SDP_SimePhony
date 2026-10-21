# agents/simephony/booking.py
"""BookingAgent: picks the inspection visit time and technician through xiaowen's tools.py.

tools.get_booking_options gives the free times (technicians who rejected this visit are left out);
tools.assign_technician holds the time (case ASSIGNED, booking PENDING until the technician accepts
in the app); tools.escalate_booking flags SDP when nobody is free (booking NEEDS_STAFF, status
unchanged). A rejection in the app arrives later as a booking.rejected event and runs this node again.
"""
from . import backend_tools

MAX_ATTEMPTS = 5  # assignments tried in one run before handing over to SDP


def _candidates(options: dict, urgency: str) -> list[dict]:
    """Visit times in the order to try: high urgency = earliest first; otherwise the buyer's
    preferred time first (if someone is free then), then the next times."""
    preferred = [options["preferred"]] if options.get("preferred") else []
    others = sorted(options.get("alternatives") or [], key=lambda o: o["start"])
    if urgency == "high":
        return sorted(preferred + others, key=lambda o: o["start"])
    return preferred + others


def _escalate(state: dict, case_id: str, reason: str, tried: list[str], attempts: int) -> dict:
    print(f"❌ [BOOKING] {reason} Escalating to SDP for manual booking.")
    try:
        sent = backend_tools.escalate_booking(case_id, reason)
    except Exception as e:
        sent = {"ok": False, "error": str(e)}
    state["booking_result"] = {
        "booking_status": "NEEDS_STAFF", "assignment_ok": None, "reason": reason,
        "error": None if sent.get("ok") is not False else sent.get("error"),
        "reassignment_count": attempts,
    }
    state["tried_technicians"] = tried
    state["reassignment_count"] = attempts
    return state  # current_status unchanged (CONTRACTS: escalate_booking keeps the status)


def booking_node(state: dict) -> dict:
    """P2 (Nicol) owns this. Finds a visit time and technician for the case and holds the booking."""
    case_id = state.get("case_id")
    tried = list(state.get("tried_technicians") or [])
    attempts = state.get("reassignment_count", 0)
    triage = state.get("triage_result") or {}
    skill = triage.get("assigned_skill", "general")
    urgency = str(triage.get("urgency") or "normal").lower()

    if not case_id or case_id == "C-NEW":
        state["booking_result"] = {"error": f"Case {case_id!r} is not in the DB yet; nothing to book"}
        return state

    try:
        options = backend_tools.get_booking_options(case_id, "visit")
    except Exception as e:
        options = {"ok": False, "error": str(e)}
    if options.get("ok") is False:
        print(f"⚠️ [BOOKING] Booking options for {case_id} unavailable: {options.get('error')}")
        state["booking_result"] = {"error": options.get("error")}
        return state

    candidates = _candidates(options, urgency)
    for option in candidates:
        for tech in option["technicians"]:
            if tech["technician_id"] in tried:
                continue
            if attempts >= MAX_ATTEMPTS:
                return _escalate(state, case_id, f"No booking after {attempts} attempts.", tried, attempts)
            reason = (f"Needs {skill}; {tech['name']} covers this block and is free "
                      f"{option['start_local']}.")
            print(f"🛠️ [BOOKING] Requesting {tech['technician_id']} for {option['start_local']}")
            try:
                held = backend_tools.assign_technician(case_id, tech["technician_id"], option["start"], reason, urgency)
            except Exception as e:
                held = {"ok": False, "error": str(e)}
            if held.get("ok") is False:
                print(f"🔄 [BOOKING] {tech['technician_id']} not booked: {held.get('error')}")
                tried.append(tech["technician_id"])
                attempts += 1
                continue
            state["booking_result"] = {
                "assigned_technician": tech["technician_id"], "technician_name": tech["name"],
                "start": option["start"], "start_local": option["start_local"],
                "assignment_ok": True, "booking_status": "PENDING", "reason": reason,
                "alternatives": [o for o in candidates if o["start"] != option["start"]][:3],
                "reassignment_count": attempts,
            }
            state["tried_technicians"] = tried
            state["reassignment_count"] = attempts
            state["current_status"] = "ASSIGNED"
            return state

    return _escalate(state, case_id, f"No {skill} technician is free in the booking window.", tried, attempts)
