"""FastMCP server exposing the real tools from CONTRACTS.md §2. Agents connect via McpToolset.

Run: python backend/mcp_server.py
"""
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

mcp = FastMCP("simephony")


# --- P3: buyer / technician / booking / email tools -------------------------

@mcp.tool()
def create_case(unit_id: str, buyer_id: str, description: str, preferred_slot_id: str) -> dict:
    raise NotImplementedError("P3")


@mcp.tool()
def send_email(to: str, subject: str, body: str, case_id: str) -> dict:
    """Send via Gmail SMTP, always save to outbox, emit email.sent. Never raise."""
    raise NotImplementedError("P3")


# TODO P3: add_photo, get_unit, get_available_slots, assign_technician, book_slot,
#          record_verdict, record_signoff, reopen_case


# --- P4: history / analytics / approval tools ------------------------------

@mcp.tool()
def find_similar_cases(case_id: str, top_k: int = 5) -> list[dict]:
    raise NotImplementedError("P4")


# TODO P4: get_case_history, get_stack_cases, get_recurring_stats,
#          request_extra_inspection, get_approval_status, attach_inspection_brief


if __name__ == "__main__":
    mcp.run()
