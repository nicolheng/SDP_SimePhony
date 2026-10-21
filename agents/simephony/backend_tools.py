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


def get_verification_protocol(category: str) -> dict:
    """Safe post-repair checks for a category from rules.yaml verification_protocols: {matched, steps}."""
    return tools.get_verification_protocol(category)


def start_verification(case_id: str, guide: dict) -> dict:
    """Save the buyer's check guide {intro, steps, ifFails} (REPAIRED -> PENDING_SIGNOFF in the DB)."""
    return tools.start_verification(case_id, guide)


def notify_buyer(case_id: str, title: str, body: str) -> dict:
    """Post the update to the buyer's in-app inbox and email it (subject "[case_id] title", outbox logged).
    The buyer is found from the case. Returns {ok, message_id, email_status}."""
    return tools.notify_buyer(case_id, title, body)
