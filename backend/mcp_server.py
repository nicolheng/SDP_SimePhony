# backend/mcp_server.py
"""FastMCP server exposing the real tools from CONTRACTS.md §2. Agents connect via McpToolset."""
from fastmcp import FastMCP
from tools import (
    create_case, add_photo, get_unit, get_available_slots, assign_technician, 
    book_slot, record_verdict, record_signoff, reopen_case, send_email,
    get_case_history, find_similar_cases, get_stack_cases, get_recurring_stats,
    request_extra_inspection, get_approval_status, get_systemic_issues, attach_inspection_brief
)

mcp = FastMCP("simephony")

# P3 Tools
@mcp.tool()
def create_case(unit_id: str, buyer_id: str, description: str, preferred_slot_id: str) -> dict: return create_case(unit_id, buyer_id, description, preferred_slot_id)

@mcp.tool()
def add_photo(case_id: str, photo_path: str, kind: str) -> dict: return add_photo(case_id, photo_path, kind)

@mcp.tool()
def get_unit(unit_id: str) -> dict: return get_unit(unit_id)

@mcp.tool()
def get_available_slots(skill: str, block: str, from_date: str, to_date: str) -> list[dict]: return get_available_slots(skill, block, from_date, to_date)

@mcp.tool()
def assign_technician(case_id: str, technician_id: str, slot_id: str, reason: str) -> dict: return assign_technician(case_id, technician_id, slot_id, reason)

@mcp.tool()
def book_slot(case_id: str, slot_id: str, kind: str) -> dict: return book_slot(case_id, slot_id, kind)

@mcp.tool()
def record_verdict(case_id: str, verdict: str, note: str, photo_path: str = None) -> dict: return record_verdict(case_id, verdict, note, photo_path)

@mcp.tool()
def record_signoff(case_id: str, party: str) -> dict: return record_signoff(case_id, party)

@mcp.tool()
def reopen_case(case_id: str, photo_path: str, description: str) -> dict: return reopen_case(case_id, photo_path, description)

@mcp.tool()
def send_email(to: str, subject: str, body: str, case_id: str) -> dict: return send_email(to, subject, body, case_id)

# P4 Tools
@mcp.tool()
def get_case_history(case_id: str = None, unit_id: str = None) -> list[dict]: return get_case_history(case_id, unit_id)

@mcp.tool()
def find_similar_cases(case_id: str = None, text: str = None, filters: dict = None, top_k: int = 5) -> list[dict]: return find_similar_cases(case_id, text, filters, top_k)

@mcp.tool()
def get_stack_cases(block: str, stack: str) -> list[dict]: return get_stack_cases(block, stack)

@mcp.tool()
def get_recurring_stats(filters: dict = None) -> dict: return get_recurring_stats(filters)

@mcp.tool()
def request_extra_inspection(case_id: str, reasons: list, systemic_issue_id: str = None, create_systemic_issue: bool = False, issue_details: dict = None) -> dict: return request_extra_inspection(case_id, reasons, systemic_issue_id, create_systemic_issue, issue_details)

@mcp.tool()
def get_approval_status(approval_id: str) -> dict: return get_approval_status(approval_id)

@mcp.tool()
def get_systemic_issues(status: str = None, category: str = None, block: str = None) -> list[dict]: return get_systemic_issues(status, category, block)

@mcp.tool()
def attach_inspection_brief(case_id: str, brief: str) -> dict: return attach_inspection_brief(case_id, brief)

if __name__ == "__main__":
    mcp.run()