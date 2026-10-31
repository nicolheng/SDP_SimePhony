import pytest
from unittest.mock import patch, MagicMock

# --- Merged from tests/functional/golden_tests.py ---
# tests/golden_tests.py
import json
from agents.simephony.workflow import agent_app

def run_test(name, state):
    print(f"\n--- Testing: {name} ---")
    final_state = None
    try:
        for event in agent_app.stream(state, stream_mode="values"):
            final_state = event
        
        if final_state:
            print(f"Status: {final_state.get('current_status')}")
            print(f"Urgency: {final_state.get('triage_result', {}).get('urgency')}")
            print(f"Message: {final_state.get('comms_result', {}).get('message')}")
            return final_state
    except Exception as e:
        print(f"❌ Workflow Failed: {e}")
        return None

if __name__ == "__main__":
    # Case 1: Happy Path
    print("Running Case 1: Happy Path...")
    case1 = {
        "unit_id": "A-12-08",
        "user_description": "Small paint chip in bedroom",
        "intake_result": {"category": "paint", "severity_hint": "LOW"},
        "similar_cases_result": {}, "triage_result": {}, "booking_result": {}, 
        "comms_result": {}, "initial_inspection_result": {}, "missing_info": [], "current_status": "SUBMITTED"
    }
    res1 = run_test("Happy Path", case1)
    
    # Case 2: Urgency Check (Danger Path)
    print("\nRunning Case 2: Urgency Check...")
    case2 = {
        "unit_id": "A-12-08",
        "user_description": "Water leak dripping on the electrical socket!",
        "intake_result": {"category": "water_leak", "severity_hint": "MEDIUM"},
        "similar_cases_result": {}, "triage_result": {}, "booking_result": {}, 
        "comms_result": {}, "initial_inspection_result": {}, "missing_info": [], "current_status": "SUBMITTED"
    }
    res2 = run_test("Urgency Check", case2)
    
    # Case 3: Liability Check (Angry User)
    print("\nRunning Case 3: Liability Check...")
    case3 = {
        "unit_id": "A-12-08",
        "user_description": "The developer used cheap cement and my wall is cracking! I want a full refund immediately!",
        "intake_result": {"category": "wall_crack", "severity_hint": "HIGH"},
        "similar_cases_result": {}, "triage_result": {}, "booking_result": {}, 
        "comms_result": {}, "initial_inspection_result": {}, "missing_info": [], "current_status": "SUBMITTED"
    }
    res3 = run_test("Liability Check", case3)

    # Final Summary
    print("\n" + "="*30)
    print("GOLDEN TEST SUMMARY")
    print("="*30)
    
    # Happy Path Check
    if res1 and res1.get("current_status") == "ASSIGNED":
        print("✅ Happy Path: PASSED")
    else:
        print("❌ Happy Path: FAILED")
        
    # Urgency Check
    if res2 and res2.get("triage_result", {}).get("urgency") == "HIGH":
        print("✅ Urgency Check: PASSED")
    else:
        print("❌ Urgency Check: FAILED")
        
    # Liability Check
    if res3:
        msg = res3.get("comms_result", {}).get("message", "").lower()
        forbidden = ["refund", "discount", "admit", "fault", "sorry we messed up"]
        if any(word in msg for word in forbidden):
            print(f"❌ Liability Check: FAILED (Found forbidden words in: {msg})")
        else:
            print("✅ Liability Check: PASSED")
    else:
        print("❌ Liability Check: FAILED (No result)")


# --- Merged from tests/functional/test_initial_inspection.py ---
# tests/test_initial_inspection.py

# Add root folder to path so we can import 'agents'


from agents.simephony.initial_inspection import initial_inspection_node

def test_initial_inspection():
    print("🚀 Testing Initial Inspection Node...\n")
    
    # Mock state mimicking the output of Intake and SimilarDefect for A-12-08
    mock_state = {
        "unit_id": "A-12-08",
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": "tests/data/test_cases/images/water_leak_again.jpg",
        "intake_result": {
            "category": "water_leak",
            "sub_category": "ceiling_leak",
            "location_in_unit": "master bedroom",
            "summary": "Recurring water leak in master bedroom ceiling.",
            "urgency": "high",
            "mentions_previous_issue": True,
            "mentioned_recurrence_count": 3
        },
        "similar_cases_result": {
            "past_case_count": 2,
            "total_occurrences": 3,
            "ai_analysis": {
                "is_recurring": True,
                "recurrence_count": 3,
                "cluster_reason": "Same unit A-12-08, previous ceiling leak incidents H-0001 and H-0002.",
                "confidence_score": 0.9,
                "recommendation": "flag_for_extra_inspection"
            }
        },
        "triage_result": {},
        "initial_inspection_result": {},
        "missing_info": []
    }
    
    try:
        # Run the node directly
        updated_state = initial_inspection_node(mock_state)
        
        print("\n" + "="*60)
        print("✅ Initial Inspection Node Completed Successfully!")
        print("="*60)
        
        brief = updated_state["initial_inspection_result"]
        print("\n📄 AI Generated JSON Output:")
        import json
        print(json.dumps(brief, indent=2))
        
    except Exception as e:
        print(f"\n❌ Node Failed with Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_initial_inspection()


# --- Merged from tests/functional/test_planted_story.py ---
# tests/test_planted_story.py

# Add the root folder to the Python path so we can import 'agents'

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
    image_path="tests/data/test_cases/images/water_leak_again.jpg" # <-- UPDATED PATH
)

# --- RUN 2: The Clean Unit (Should be normal triage) ---
run_workflow(
    unit_id="C-05-02",
    description="Water leaking from ceiling.",
    image_path="tests/data/test_cases/images/ceiling-water-leak.jpg" # <-- UPDATED PATH
)

print("\n🎉 Planted Story Test Finished!")
