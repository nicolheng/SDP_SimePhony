import sys

# Agent logs print emoji; a Windows console (cp1252) can't encode them and print() would crash the run.
# Replace what the console can't show instead of raising.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):  # not a text stream we can reconfigure (e.g. pytest capture)
        pass

# Expose the compiled LangGraph app as the main entry point
from .workflow import agent_app

# Optional: Expose the state type if other files need to know the data structure
from .workflow import AgentState

__all__ = ["agent_app", "AgentState"]