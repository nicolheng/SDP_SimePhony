# tests/test_planted_story.py
import os
import sys

# Add the root folder to the Python path so we can import 'agents'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ["USE_LOCAL_OLLAMA"] = "true"
from agents.simephony.workflow import agent_app

def run_workflow(unit_id: str, description: str, image_path: str) -> dict:
    print(f"\n{'='*60}")
    print(f"🚀 Running Workflow for Unit: {unit_id}")
    print(f"Description: {description}")
    print(f"{'='*60}\n")
    
    initial_state = {
        "unit_id": unit_id,
        "user_description": description,
        "image_path": image_path,
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED"
    }
    
    final_state = None
    try:
        for event in agent_app.stream(initial_state, stream_mode="values"):
            final_state = event
            
        if final_state:
            # ADD THESE TWO LINES TO SEE WHAT THE AI GUESSED
            intake = final_state.get("intake_result", {})
            print(f"   -> AI Detected Category: {intake.get('category', 'Unknown')}")
            
            analysis = final_state.get("similar_cases_result", {}).get("ai_analysis", {})
            print("✅ Workflow Completed Successfully!")
            print(f"   -> Recurrence Count: {analysis.get('recurrence_count', 'N/A')}")
            print(f"   -> Recommendation:   {analysis.get('recommendation', 'N/A')}")
        return final_state
        
    except Exception as e:
        print(f"❌ Workflow Failed with Error: {e}")
        return None

# --- RUN 1: The Planted Story (Should trigger escalation) ---
run_workflow(
    unit_id="A-12-08",
    description="Ceiling bocor lagi, dah 3 kali ni!",
    image_path="tests/test_cases/images/water_leak_again.jpg" # <-- UPDATED PATH
)

# --- RUN 2: The Clean Unit (Should be normal triage) ---
run_workflow(
    unit_id="C-05-02",
    description="Water leaking from ceiling.",
    image_path="tests/test_cases/images/ceiling-water-leak.jpg" # <-- UPDATED PATH
)

print("\n🎉 Planted Story Test Finished!")