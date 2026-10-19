"""REST API for the SimePhony web app: the buyer, technician/subcontractor and SDP screens.

Every action reads and writes data/simephony.db. The rules and rule-based agent stand-ins live in
agents.py / workflow.py, so P2's LangGraph agents can replace them inside the same endpoints later.
"""
