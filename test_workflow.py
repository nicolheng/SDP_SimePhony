# test_workflow.py
import os
os.environ["USE_LOCAL_OLLAMA"] = "true"

from agents.simephony.workflow import agent_app

image_path = "tests/test_wall_break.jpeg"

if not os.path.exists(image_path):
    print(f" Error: Please check if '{image_path}' exists!")
    exit()

initial_state = {
    "user_description": "Dinding bocor in master bedroom, dah pernah kena last month.",
    "image_path": image_path, # Use the variable here
    "unit_id": "A-12-08",
    "intake_result": {},
    "similar_cases_result": {},
    "triage_result": {},
    "missing_info": [],
    "current_status": "SUBMITTED"
}

print("🚀 Starting LangGraph Workflow Test...\n")

for event in agent_app.stream(initial_state, stream_mode="values"):
    last_node = list(event.keys())[-1]
    if last_node != "current_status":
        print(f"✅ Node completed: {last_node.upper()}")
        if last_node == "intake":
            print("   -> Intake JSON:", event["intake_result"].get("category", "Unknown"))
        elif last_node == "similar_defect":
            print("   -> Recurring?", event["similar_cases_result"].get("ai_analysis", {}).get("is_recurring"))
        elif last_node == "triage":
            print("   -> Assigned Tech:", event["triage_result"].get("assigned_technician"))
        print("-" * 40)

print("🎉 Workflow finished successfully!")