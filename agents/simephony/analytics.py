import json
import sys
import os

# 1. Fix path to import from sibling 'backend' folder
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend')))
from tools import get_recurring_stats

# 2. Local imports
from .llm_client import client, MODEL_TEXT

def generate_analytics_insight() -> str:
    """Generate a concise executive summary of defect recurrence insights."""
    
    try:
        # Call the get_recurring_stats function to get the raw data dictionary
        stats = get_recurring_stats()
    except Exception as e:
        return f"⚠️ Could not fetch analytics data: {e}"

    system_prompt = (
        "You are a data analyst for a property management company. Read the JSON statistics of defect recurrences. "
        "Write a concise, 3-sentence executive summary highlighting the most critical recurring problem and which building block is most affected. "
        "Do not hallucinate numbers. Output ONLY plain text, no JSON formatting."
    )

    user_input = json.dumps(stats)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_input}
    ]

    try:
        response = client.chat.completions.create(
            model=MODEL_TEXT,
            messages=messages,
            temperature=0.1,
        )
        summary = response.choices[0].message.content.strip()
        return summary
    except Exception as e:
        return f"⚠️ AI failed to generate insight: {e}"

if __name__ == "__main__":
    print("📊 Generating Analytics Insight...\n")
    insight = generate_analytics_insight()
    print(insight)