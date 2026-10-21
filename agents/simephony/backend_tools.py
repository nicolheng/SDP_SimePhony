"""The agents' door to backend/tools.py (xiaowen's tools, CONTRACTS.md section 2).

CONTRACTS: agents add backend/ to sys.path and call tools.py directly. Doing it here keeps that in one
place, and gives tests one module to patch. Write tools return {ok: false, error} instead of raising
when a business rule blocks the action, so callers check `ok`.
"""
import os
import sys

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if _BACKEND not in sys.path:
    sys.path.append(_BACKEND)

import tools  # noqa: E402


def check_escalation(case_id: str) -> dict:
    """Earlier same-unit cases, stack units, pending approval for a case in the DB."""
    return tools.check_escalation(case_id)


def request_extra_inspection(case_id: str, reasons: list[str]) -> dict:
    """Ask SDP to approve an extra inspection (-> ESCALATION_PENDING, approval row, SDP email)."""
    return tools.request_extra_inspection(case_id, reasons)
