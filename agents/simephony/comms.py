from .llm_client import get_client, get_models
from .stub_tools import send_email, get_unit
from .guardrails import scan_for_liability, scan_for_unsafe_steps, strip_placeholders_and_signoff

INVALID_CLOSING = "If the problem gets worse or changes, please submit a new report."

_FALLBACK = "Thank you for your report."

# Fixed, pre-scanned messages used when the guardrail rewrite is still flagged. No LLM text.
NEUTRAL_TEMPLATES = {
    "VALID": "Our technician has confirmed the reported defect. We will contact you shortly to arrange the repair.",
    "INVALID": "Our technician has reviewed your report and found that it is not covered as a developer defect.",
    "ASSIGNED": "A technician has been assigned to your case. We will notify you of the visit slot soon.",
    "PENDING_SIGNOFF": (
        "The technician has reported that the repair is complete. "
        "Please check the repaired area using the steps below before signing off."
    ),
    "REOPENED": "Your case has been reopened. We will contact you shortly about the next steps.",
    "ESCALATION_PENDING": (
        "Your case has been referred to our team for further review. "
        "We will contact you shortly about the next steps."
    ),
}
_NEUTRAL_DEFAULT = "There is an update on your case. We will contact you shortly about the next steps."


def _clean(text: str) -> str:
    """Remove [..] placeholder lines and any trailing sign-off block."""
    return strip_placeholders_and_signoff(text) or _FALLBACK


def comms_node(state: dict) -> dict:
    """Drafts and sends buyer updates (valid/invalid, bookings, etc.)."""
    client = get_client()
    _, text_model = get_models()
    
    # 1. Retrieve dynamic data from state
    unit_id = state.get("unit_id", "A-12-08")
    case_id = state.get("case_id", "C-NEW")
    status = state.get("current_status", "UNKNOWN")
    category = state.get("intake_result", {}).get("category", "defect")
    tech = state.get("booking_result", {}).get("assigned_technician", "a technician")
    
    # Technical notes to be translated
    verdict_note = state.get("verdict_note", "")
    repair_note = state.get("repair_note", "")
    technical_context = verdict_note or repair_note or "No specific technical details provided."
    
    # 2. Dynamic Recipient Lookup
    unit_info = get_unit(unit_id)
    buyer_email = unit_info.get("buyer", {}).get("email", "buyer@example.com")
    
    # 3. Professional Translation & Drafting
    if status == "VALID":
        prompt = f"The technician confirmed the {category} defect. Tech note: {technical_context}. We will now book a repair."
    elif status == "INVALID":
        prompt = f"The technician inspected the {category} report and determined it is not a developer defect. Tech note: {technical_context}."
    elif status == "ASSIGNED":
        prompt = f"Your {category} case is now ASSIGNED to {tech}. We will notify you of the visit slot soon."
    elif status == "PENDING_SIGNOFF" and state.get("verification_status") == "verified":
        prompt = (f"The resident confirmed the {category} repair looks fixed. "
                  "The case now waits for final sign-off. Thank them briefly.")
    elif status == "PENDING_SIGNOFF":
        prompt = (f"The technician reported the {category} repair is complete. Write a short intro asking the "
                  "resident to check the repair using the steps that follow before signing off. "
                  "Do not list any steps yourself.")
    else:
        prompt = f"Your case status is now {status}. Context: {technical_context}."

    response = client.chat.completions.create(
        model=text_model,
        messages=[
            {"role": "system", "content": "You are a professional property manager. Translate technical technician notes into polite, resident-friendly language. Do not use jargon like '15mm pipe' or '5 bar pressure'. Do not admit fault, apologize for mistakes, or promise financial compensation. Keep it concise and helpful."},
            {"role": "user", "content": f"Draft a short notification for the resident based on this: {prompt}"}
        ],
        temperature=0.1
    )
    
    message = _clean(response.choices[0].message.content)
    
    # 4. Guardrail Layer
    is_dangerous, offending_terms = scan_for_liability(message)
    if is_dangerous:
        rewrite_response = client.chat.completions.create(
            model=text_model,
            messages=[
                {"role": "system", "content": "You are a legal compliance officer. The previous draft admitted liability or promised money. Rewrite it to be strictly neutral and professional. Remove any mentions of fault, apologies for mistakes, or financial compensation."},
                {"role": "user", "content": f"Rewrite this dangerous message: {message}\n\nForbidden terms found: {', '.join(offending_terms)}"}
            ],
            temperature=0.0
        )
        message = _clean(rewrite_response.choices[0].message.content)
        if scan_for_liability(message)[0]:
            # Rewrite still unsafe: send a fixed neutral template, no LLM text.
            message = NEUTRAL_TEMPLATES.get(status, _NEUTRAL_DEFAULT)
    if scan_for_unsafe_steps(message):
        # LLM text must never tell the buyer to open panels, touch wiring, climb or use tools.
        message = NEUTRAL_TEMPLATES.get(status, _NEUTRAL_DEFAULT)

    # Fixed text appended verbatim AFTER the guardrail step (never passed through the LLM).
    if status == "INVALID":
        message = f"{message}\n\n{INVALID_CLOSING}"
    protocol = (state.get("verification_result") or {}).get("protocol")
    if status == "PENDING_SIGNOFF" and protocol and state.get("verification_status") != "verified":
        message = f"{message}\n\n{protocol}"

    # 5. Dynamic Sending
    send_email(
        to=buyer_email,
        subject=f"Case Update: {status}",
        body=message,
        case_id=case_id
    )
    
    state["comms_result"] = {
        "status": status,
        "message": message
    }
    return state
