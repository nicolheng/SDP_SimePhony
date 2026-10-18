# tests/run_batch_tests.py
import os
import sys
import json

# 1. CRITICAL FIX: Add the root folder to Python's path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ["USE_LOCAL_OLLAMA"] = "true"
from agents.simephony.workflow import agent_app

# 2. Get the directory where this script lives
script_dir = os.path.dirname(os.path.abspath(__file__))

# Load the test cases from the tests/test_cases/ folder
cases_file = os.path.join(script_dir, "test_cases", "cases.json")
with open(cases_file, "r", encoding="utf-8") as f:
    test_cases = json.load(f)

print(f"🚀 Starting Batch Test for {len(test_cases)} cases...\n")

for case in test_cases:
    print(f"--- Testing Case #{case['id']}: {case['description'][:40]}... ---")
    
    # 3. Smart Image Path Fix: Grab just the filename and look in the local tests folder
    img_filename = os.path.basename(case["image_path"])
    image_path = os.path.join(script_dir, "test_cases", "images", img_filename)

    initial_state = {
        "user_description": case["description"],
        "image_path": image_path,
        "unit_id": "A-12-08",
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED"
    }

    try:
        final_state = None
        for event in agent_app.stream(initial_state, stream_mode="values"):
            final_state = event
            
        if final_state:
            result = final_state["intake_result"]
            category = result.get("category", "Unknown")
            # Removed image_quality/mismatch to keep output clean, add back if needed
            
            print(f"✅ AI Detected Category: {category} (Expected: {case['expected_category']})")
            
    except Exception as e:
        print(f"❌ Failed! Error: {e}")
    print("-" * 40)

print("🎉 All batch tests finished!")