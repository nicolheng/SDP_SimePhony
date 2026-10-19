from .llm_client import get_client, get_models

def verification_node(state: dict) -> dict:
    """Guides buyer through verification, records result, closes or reopens."""
    client = get_client()
    _, text_model = get_models()
    
    category = state.get("intake_result", {}).get("category", "general")
    
    # Basic protocol map for the placeholder
    protocols = {
        "water_leak": "Check for dampness around the repair area. Run the water for 5 mins and check for drips.",
        "electrical": "Toggle the switch 5 times. Check for any sparking or smell of burning.",
        "wall_crack": "Press firmly on the repaired crack. Ensure there is no movement or gaps.",
        "general": "Inspect the repair area. Ensure it looks clean and functions as expected."
    }
    
    base_protocol = protocols.get(category, protocols["general"])
    
    # Use LLM to personalize it for this specific case
    response = client.chat.completions.create(
        model=text_model,
        messages=[
            {"role": "system", "content": "You are a technical verification assistant. Create a clear, step-by-step guide for a resident to verify a repair. Be specific and safe."},
            {"role": "user", "content": f"Create a verification guide for a {category} repair using this base protocol: {base_protocol}"}
        ],
        temperature=0.1
    )
    
    protocol = response.choices[0].message.content
    
    state["verification_result"] = {
        "category": category,
        "protocol": protocol
    }
    return state
