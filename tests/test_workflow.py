# test_workflow.py
import os
os.environ["USE_LOCAL_OLLAMA"] = "true"

from agents.simephony.workflow import agent_app

image_path = "tests/test_cases/images/test_wall_break.jpeg"

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

# CHANGE THIS LINE: Use "updates" instead of "values"
for event in agent_app.stream(initial_state, stream_mode="updates"):
    
    # In "updates" mode, the key of the dictionary is the NODE NAME
    node_name = list(event.keys())[0] 
    node_output = event[node_name]

    print(f"✅ Node completed: {node_name.upper()}")
    
    if node_name == "intake":
        # Look inside the intake_result for the category
        print("   -> Intake Category:", node_output.get("intake_result", {}).get("category", "Unknown"))
        print("   -> Missing Info:", node_output.get("missing_info", []))
        
    elif node_name == "similar_defect":
        # Look inside the ai_analysis for recurrence
        analysis = node_output.get("similar_cases_result", {}).get("ai_analysis", {})
        print("   -> Is Recurring?", analysis.get("is_recurring"))
        print("   -> Reason:", analysis.get("cluster_reason"))
        
    elif node_name == "triage":
        # Look inside triage_result for the technician
        print("   -> Assigned Tech:", node_output.get("triage_result", {}).get("assigned_technician"))
        print("   -> Urgency:", node_output.get("triage_result", {}).get("urgency"))
        
    print("-" * 40)

print(" Workflow finished successfully!")