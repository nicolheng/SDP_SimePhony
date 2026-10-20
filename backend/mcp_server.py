# backend/mcp_server.py
"""FastMCP server exposing the agent-facing tools from tools.py (CONTRACTS.md §2).

Human decisions (technician verdict, mark repaired, buyer verification / sign-off / reopen, SDP
approval, repair booking) are deliberately not exposed: people make them in the web app, and an AI
client must not take them on their behalf.

Run:
    python backend/mcp_server.py                 # stdio (an MCP client starts this as a subprocess)
    python backend/mcp_server.py --http          # streamable HTTP on MCP_PORT (default 8002), path /mcp
"""
import os
import sys

from fastmcp import FastMCP

import tools

mcp = FastMCP(
    "simephony",
    instructions=(
        "Defect-management tools for the SimePhony property defect workflow. Times use the app's demo "
        "clock (get_clock), not the real date. Case statuses are in CONTRACTS.md; business rules are in "
        "the simephony://rules resource. Write tools return {ok: false, error} when a business rule "
        "blocks the action."
    ),
)

READ_ONLY = {"readOnlyHint": True}

for fn in (
    tools.get_clock, tools.get_case, tools.get_unit, tools.get_case_history,
    tools.get_available_slots, tools.get_booking_options, tools.get_verification_protocol,
    tools.find_similar_cases, tools.check_escalation, tools.get_stack_cases, tools.get_recurring_stats,
    tools.get_systemic_issues, tools.get_approval_status,
):
    mcp.tool(fn, annotations=READ_ONLY)

for fn in (
    tools.save_intake_result,        # IntakeAgent
    tools.save_similar_cases,        # SimilarDefectAgent
    tools.assign_technician,         # TriageAgent
    tools.escalate_booking,          # TriageAgent
    tools.start_verification,        # VerificationAgent
    tools.request_extra_inspection,  # RecurrenceAgent
    tools.attach_inspection_brief,   # InitialInspectionAgent
    tools.notify_buyer,              # CommsAgent
    tools.notify_technician,
    tools.send_email,
    tools.log_agent_step,
):
    mcp.tool(fn)


@mcp.resource("simephony://rules", mime_type="text/yaml")
def business_rules() -> str:
    """rules.yaml: category -> skill, urgency rules, grace period, escalation thresholds, verification protocols."""
    return tools.RULES_PATH.read_text(encoding="utf-8")


if __name__ == "__main__":
    if "--http" in sys.argv:
        mcp.run(transport="http", host="127.0.0.1", port=int(os.getenv("MCP_PORT", "8002")))
    else:
        mcp.run()
