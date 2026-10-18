# tests/test_initial_inspection.py
import os
import sys

# Add root folder to path so we can import 'agents'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ["USE_LOCAL_OLLAMA"] = "true"

from agents.simephony.initial_inspection import initial_inspection_node

def test_initial_inspection():
    print("🚀 Testing Initial Inspection Node...\n")
    
    # Mock state mimicking the output of Intake and SimilarDefect for A-12-08
    mock_state = {
        "unit_id": "A-12-08",
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": "tests/test_cases/images/water_leak_again.jpg",
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