import os
import json
import base64
from .llm_client import client, MODEL_VL

def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as img_file:
        return base64.b64encode(img_file.read()).decode("utf-8")

def intake_node(state: dict) -> dict:
    """P1: Parse photo + text into structured JSON."""
    image_content = []
    if state.get("image_path") and os.path.exists(state["image_path"]):
        base64_img = encode_image(state["image_path"])
        image_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}
        })
    
    image_content.append({"type": "text", "text": f"Defect description: {state['user_description']}"})

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert property defect intake AI. Analyze the photo and description. "
                "You MUST output ONLY valid JSON matching this exact schema: "
                "{"
                '"category": "string", "sub_category": "string", "location_in_unit": "string", '
                '"summary": "string", "severity_hint": "LOW" | "MEDIUM" | "HIGH", '
                '"mentions_previous_issue": boolean, "missing_info": ["string"]'
                "}. If the image is blurry or unrelated, set category to 'invalid_image'."
            )
        },
        {"role": "user", "content": image_content}
    ]

    try:
        response = client.chat.completions.create(model=MODEL_VL, messages=messages, temperature=0.1)
        raw_text = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        
        try:
            parsed_intake = json.loads(raw_text)
        except json.JSONDecodeError:
            parsed_intake = {"category": "other", "summary": raw_text, "missing_info": ["AI failed to parse JSON"]}
            
    except Exception as e:
        # THIS IS THE SAFETY NET!
        print(f"⚠️ Vision model failed: {e}")
        parsed_intake = {
            "category": "error", 
            "summary": "Image processing failed", 
            "missing_info": ["Please upload a clear, real photo"]
        }

    state["intake_result"] = parsed_intake
    state["missing_info"] = parsed_intake.get("missing_info", [])
    return state