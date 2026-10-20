# tests/run_batch_tests.py
import os
import sys
import json

# Force UTF-8 output so emoji don't crash on Windows cp1252
sys.stdout.reconfigure(encoding="utf-8")

# 1. Add the root folder to Python's path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ["USE_LOCAL_OLLAMA"] = "true"
from agents.simephony.workflow import agent_app

# 2. Locate files relative to this script
script_dir = os.path.dirname(os.path.abspath(__file__))
cases_file = os.path.join(script_dir, "data", "test_cases", "cases.json")

with open(cases_file, "r", encoding="utf-8") as f:
    test_cases = json.load(f)

passed_count = 0
failed_count = 0
skipped_count = 0

print(f"🚀 Starting Batch Test for {len(test_cases)} cases...\n")

for case in test_cases:
    desc_preview = case['description'][:50] + "..." if len(case['description']) > 50 else case['description']
    print(f"--- Testing Case #{case['id']}: {desc_preview} ---")

    # Resolve image path relative to this script's directory
    img_filename = os.path.basename(case["image_path"])
    image_path = os.path.join(script_dir, "data", "test_cases", "images", img_filename)

    if not os.path.exists(image_path):
        print(f"⚠️  SKIP — image not found: {image_path}")
        skipped_count += 1
        print("-" * 60)
        continue

    initial_state = {
        "user_description": case["description"],
        "image_path": image_path,
        "unit_id": "A-12-08",
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "initial_inspection_result": {},
        "missing_info": [],
        "current_status": "SUBMITTED",
    }

    try:
        final_state = None
        for event in agent_app.stream(initial_state, stream_mode="values"):
            final_state = event

        if not final_state:
            print("❌ FAILED | No final state returned")
            failed_count += 1
            print("-" * 60)
            continue

        result = final_state.get("intake_result", {})

        # Support both old 'expected_category' and new 'expected' dict
        expected = case.get("expected", {})
        if not expected and "expected_category" in case:
            expected = {"category": case["expected_category"]}

        checks_passed = True
        fail_reasons = []

        # 1. Category
        if "category" in expected and result.get("category") != expected["category"]:
            checks_passed = False
            fail_reasons.append(f"Cat: expected '{expected['category']}', got '{result.get('category')}'")

        # 2. Urgency
        if "urgency" in expected and result.get("urgency") != expected["urgency"]:
            checks_passed = False
            fail_reasons.append(f"Urg: expected '{expected['urgency']}', got '{result.get('urgency')}'")

        # 3. Preliminary Outcome
        if "preliminary_outcome" in expected and result.get("preliminary_outcome") != expected["preliminary_outcome"]:
            checks_passed = False
            fail_reasons.append(f"Outcome: expected '{expected['preliminary_outcome']}', got '{result.get('preliminary_outcome')}'")

        # 4. Mismatch detected
        if "mismatch_detected" in expected and result.get("mismatch_detected") != expected["mismatch_detected"]:
            checks_passed = False
            fail_reasons.append(f"Mismatch: expected {expected['mismatch_detected']}, got {result.get('mismatch_detected')}")

        # 5. Missing info list length
        if "missing_info_length_greater_than" in expected:
            missing_len = len(result.get("missing_info", []))
            threshold = expected["missing_info_length_greater_than"]
            if missing_len <= threshold:
                checks_passed = False
                fail_reasons.append(f"Missing Info: expected >{threshold}, got {missing_len}")

        # 6. Mentions previous issue
        if "mentions_previous_issue" in expected and result.get("mentions_previous_issue") != expected["mentions_previous_issue"]:
            checks_passed = False
            fail_reasons.append(f"Prev Issue: expected {expected['mentions_previous_issue']}, got {result.get('mentions_previous_issue')}")

        # 7. Mentioned recurrence count (if specified)
        if "mentioned_recurrence_count" in expected:
            got = result.get("mentioned_recurrence_count")
            exp = expected["mentioned_recurrence_count"]
            if got != exp:
                checks_passed = False
                fail_reasons.append(f"Recurrence Count: expected {exp}, got {got}")

        if checks_passed:
            passed_count += 1
            print(f"✅ PASSED | Category: {result.get('category'):<18} | Urgency: {result.get('urgency'):<6} | Outcome: {result.get('preliminary_outcome')}")
        else:
            failed_count += 1
            print(f"❌ FAILED | {' | '.join(fail_reasons)}")
            print(f"   Got   → cat={result.get('category')}, urg={result.get('urgency')}, outcome={result.get('preliminary_outcome')}")

    except Exception as e:
        failed_count += 1
        print(f"❌ ERROR | {e}")
        import traceback
        traceback.print_exc()

    print("-" * 60)

# Final summary
total = passed_count + failed_count
print(f"\n{'='*60}")
print(f"📊 BATCH TEST RESULTS: {passed_count}/{total} PASSED  |  {failed_count}/{total} FAILED  |  {skipped_count} SKIPPED")
print(f"{'='*60}")
