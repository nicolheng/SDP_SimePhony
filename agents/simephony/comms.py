from .llm_client import get_client, get_models
from .stub_tools import send_email, get_unit
from .guardrails import scan_for_liability

def comms_node(state: dict) -> dict:
    """Drafts and sends buyer updates (valid/invalid, bookings, etc.)."""
    client = get_client()
    _, text_model = get_models()
    
    # 1. Retrieve dynamic data from state
    unit_id = state.get("unit_id", "A-12-08")
    case_id = state.get("case_id", "C-NEW")
    status = state.get("current_status", "UNKNOWN")
    category = state.get("intake_result", {}).get("category", "defect")
    tech = state.get("triage_result", {}).get("assigned_technician", "a technician")
    
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
    
    message = response.choices[0].message.content
    
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
        message = rewrite_response.choices[0].message.content

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
