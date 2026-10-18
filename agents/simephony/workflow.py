import os
import json
import base64
from typing import TypedDict, Optional, Any
from openai import OpenAI
from langgraph.graph import StateGraph, END

from .intake import intake_node
from .similar_defect import similar_defect_node
from .triage import triage_node
from .initial_inspection import initial_inspection_node

# 1. Setup Qwen Client (Points to local Ollama by default)
client = OpenAI(
    base_url=os.getenv("QWEN_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("QWEN_API_KEY", "ollama")
)
MODEL_VL = os.getenv("QWEN_MODEL_VL", "llava-llama3")
# SAFETY FIX: Default to 7b to prevent 16GB RAM laptops from freezing!
MODEL_TEXT = os.getenv("QWEN_MODEL_TEXT", "qwen2.5:7b") 

# 2. Define the State (The "Memory" passed between agents)
class AgentState(TypedDict):
    user_description: str
    image_path: Optional[str]
    unit_id: str
    intake_result: dict
    similar_cases_result: dict
    triage_result: dict
    initial_inspection_result: dict
    missing_info: list[str]

# 3. Build the LangGraph
workflow = StateGraph(AgentState)
workflow.add_node("intake", intake_node)
workflow.add_node("similar_defect", similar_defect_node)
workflow.add_node("triage", triage_node)
workflow.add_node("initial_inspection", initial_inspection_node)

# 4. Define the edges
workflow.set_entry_point("intake")
workflow.add_edge("intake", "similar_defect")
workflow.add_edge("similar_defect", "triage")

# TODO: On Day 4, add a conditional edge here. 
# If similar_cases_result.ai_analysis.recommendation == "flag_for_extra_inspection", 
# route to initial_inspection. Otherwise, route to END.
# workflow.add_conditional_edges("triage", lambda state: "initial_inspection" if state["similar_cases_result"]["ai_analysis"]["recommendation"] == "flag_for_extra_inspection" else END)

# 5. Compile the graph
agent_app = workflow.compile()

# 6. Testing block
if __name__ == "__main__":
    example_state = {
        "unit_id": "A-12-08",
        "user_description": "Ceiling bocor lagi, dah 3 kali ni!",
        "image_path": "tests/test_cases/images/water_leak_again.jpg",
        "intake_result": {},
        "similar_cases_result": {},
        "triage_result": {},
        "initial_inspection_result": {},
        "missing_info": []
    }
    
    print("🚀 Running Workflow Test...")
    final_state = None
    try:
        # FIX: workflow.stream returns a generator, we must loop through it
        for event in agent_app.stream(example_state, stream_mode="values"):
            final_state = event
            
        if final_state:
            print("\n✅ Workflow Completed Successfully!")
            print(json.dumps(final_state.get("initial_inspection_result", {}), indent=2))
    except Exception as e:
        print(f"\n❌ Workflow Failed: {e}")