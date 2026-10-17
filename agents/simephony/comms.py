from .llm_client import get_client, get_models
from .stub_tools import send_email

def comms_node(state: dict) -> dict:
    """Drafts and sends buyer updates (valid/invalid, bookings, etc.)."""
    client = get_client()
    _, text_model = get_models()
    
    status = state.get("current_status", "UNKNOWN")
    category = state.get("intake_result", {}).get("category", "defect")
    tech = state.get("triage_result", {}).get("assigned_technician", "a technician")
    
    # Simple prompt based on status
    if status == "VALID":
        prompt = f"The technician has confirmed the {category} defect. We will now book a repair slot with {tech}. Your home is in good hands."
    elif status == "INVALID":
        prompt = f"The technician inspected the {category} report and determined it is not a defect. This case is now closed."
    else:
        prompt = f"Your case status has been updated to {status}. We will notify you of the next steps soon."

    # Use LLM to polish the message (Guardrailed)
    response = client.chat.completions.create(
        model=text_model,
        messages=[
            {"role": "system", "content": "You are a professional property manager. Draft a polite, liability-safe notification for a resident. Do not admit fault or promise financial compensation."},
            {"role": "user", "content": f"Draft a short notification based on this: {prompt}"}
        ],
        temperature=0.1
    )
    
    message = response.choices[0].message.content
    
    # Log to outbox via stub tool
    send_email(
        to="buyer@example.com",
        subject=f"Case Update: {status}",
        body=message,
        case_id="C-NEW"
    )
    
    state["comms_result"] = {
        "status": status,
        "message": message
    }
    return state
