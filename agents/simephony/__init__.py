# Expose the compiled LangGraph app as the main entry point
from .workflow import agent_app

# Optional: Expose the state type if other files need to know the data structure
from .workflow import AgentState

__all__ = ["agent_app", "AgentState"]