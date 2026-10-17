"""FastMCP server exposing the real tools from CONTRACTS.md §2. Agents connect via McpToolset.

Run: python backend/mcp_server.py
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

import db 

mcp = FastMCP("simephony")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# P3: buyer / technician / booking / email tools

@mcp.tool()
def create_case(unit_id: str, buyer_id: str, description: str, preferred_slot_id: str) -> dict:
    """Create a new defect case. Returns {case_id, status}."""
    raise NotImplementedError("P3")


@mcp.tool()
def add_photo(case_id: str, photo_path: str, kind: str) -> dict:
    """Attach a photo to a case. kind: original | reopen | verdict. Returns {photo_id, url}."""
    raise NotImplementedError("P3")


@mcp.tool()
def get_unit(unit_id: str) -> dict:
    """Return unit details including buyer info. Returns {unit_id, block, floor, stack, contractor, buyer}."""
    raise NotImplementedError("P3")


@mcp.tool()
def get_available_slots(skill: str, block: str, from_date: str, to_date: str) -> list[dict]:
    """Return free technician slots matching skill and block. Returns [{slot_id, technician_id, start, end}]."""
    raise NotImplementedError("P3")


@mcp.tool()
def assign_technician(case_id: str, technician_id: str, slot_id: str, reason: str) -> dict:
    """Assign a technician to a case and book the visit slot. Returns {ok}."""
    raise NotImplementedError("P3")


@mcp.tool()
def book_slot(case_id: str, slot_id: str, kind: str) -> dict:
    """Book a slot for a case. kind: visit | repair. Returns {ok, booking_id}."""
    raise NotImplementedError("P3")


@mcp.tool()
def record_verdict(case_id: str, verdict: str, note: str, photo_path: Optional[str] = None) -> dict:
    """Record technician verdict. verdict: VALID | INVALID. Returns {ok}."""
    raise NotImplementedError("P3")


@mcp.tool()
def record_signoff(case_id: str, party: str) -> dict:
    """Record developer or buyer sign-off. party: developer | buyer. Returns {ok, both_signed}."""
    raise NotImplementedError("P3")


@mcp.tool()
def reopen_case(case_id: str, photo_path: str, description: str) -> dict:
    """Reopen a case within the grace period with a new photo. Returns {ok, reopen_count} or error."""
    raise NotImplementedError("P3")


@mcp.tool()
def send_email(to: str, subject: str, body: str, case_id: str) -> dict:
    """Send via Gmail SMTP, always save to outbox, emit email.sent. Never raise.
    Returns {status: 'sent' | 'logged, not sent'}."""
    raise NotImplementedError("P3")


# P4: history / analytics / approval tools

@mcp.tool()
def get_case_history(
    case_id: Optional[str] = None,
    unit_id: Optional[str] = None,
) -> list[dict]:
    """
    Return all case events for a given case or for all cases in a unit, ordered by time.
    Provide either case_id or unit_id (case_id takes priority).
    Returns [event] where each event has: event_id, case_id, type, payload, created_at.
    """
    if not case_id and not unit_id:
        return []

    with db.get_conn() as conn:
        if case_id:
            rows = conn.execute(
                """
                SELECT e.event_id, e.case_id, e.type, e.payload, e.created_at
                FROM case_events e
                WHERE e.case_id = ?
                ORDER BY e.created_at ASC
                """,
                (case_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT e.event_id, e.case_id, e.type, e.payload, e.created_at
                FROM case_events e
                JOIN cases c ON c.case_id = e.case_id
                WHERE c.unit_id = ?
                ORDER BY e.created_at ASC
                """,
                (unit_id,),
            ).fetchall()

    return [
        {
            "event_id": r["event_id"],
            "case_id": r["case_id"],
            "type": r["type"],
            "payload": json.loads(r["payload"]) if r["payload"] else {},
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@mcp.tool()
def find_similar_cases(
    case_id: Optional[str] = None,
    text: Optional[str] = None,
    filters: Optional[dict] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Find cases similar to a given case_id or free-text description.

    Strategy:
    1. If case_id has an embedding in case_embeddings → cosine similarity over all stored vectors.
    2. Otherwise → SQL filter match on unit, stack, floor, category, contractor.

    filters: {unit_id, floor, stack, category, contractor}
    Returns [{case_id, score, reason}].
    """
    filters = filters or {}

    #  Vector similarity path
    source_vector: Optional[np.ndarray] = None

    if case_id:
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT vector FROM case_embeddings WHERE case_id = ?",
                (case_id,),
            ).fetchone()
        if row:
            source_vector = np.frombuffer(row["vector"], dtype=np.float32)

    if source_vector is not None:
        with db.get_conn() as conn:
            emb_rows = conn.execute(
                "SELECT case_id, vector FROM case_embeddings WHERE case_id != ?",
                (case_id,),
            ).fetchall()

        scored: list[dict] = []
        for r in emb_rows:
            vec = np.frombuffer(r["vector"], dtype=np.float32)
            denom = np.linalg.norm(source_vector) * np.linalg.norm(vec)
            score = float(np.dot(source_vector, vec) / denom) if denom > 0 else 0.0
            scored.append({"case_id": r["case_id"], "score": round(score, 4), "reason": "embedding similarity"})

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    # 2. SQL filter fallback
    base: dict = {}
    if case_id:
        with db.get_conn() as conn:
            row = conn.execute(
                """
                SELECT c.unit_id, c.category, u.block, u.floor, u.stack, u.contractor
                FROM cases c JOIN units u ON u.unit_id = c.unit_id
                WHERE c.case_id = ?
                """,
                (case_id,),
            ).fetchone()
        if row:
            base = dict(row)

    wheres: list[str] = []
    params: list = []
    reason_parts: list[str] = []

    exclude_id = case_id or "__none__"
    wheres.append("c.case_id != ?")
    params.append(exclude_id)

    def _add(col: str, val, label: str) -> None:
        if val:
            wheres.append(f"{col} = ?")
            params.append(val)
            reason_parts.append(label)

    _add("c.unit_id",    filters.get("unit_id")    or base.get("unit_id"),    "same unit")
    _add("c.category",   filters.get("category")   or base.get("category"),   "same category")
    _add("u.stack",      filters.get("stack")       or base.get("stack"),      "same stack")
    _add("u.contractor", filters.get("contractor")  or base.get("contractor"), "same contractor")

    floor_val = filters.get("floor") or base.get("floor")
    if floor_val:
        wheres.append("u.floor = ?")
        params.append(floor_val)
        reason_parts.append("same floor")

    if len(wheres) <= 1:
        return []

    reason = ", ".join(reason_parts) if reason_parts else "sql filter match"
    sql = f"""
        SELECT c.case_id
        FROM cases c
        JOIN units u ON u.unit_id = c.unit_id
        WHERE {" AND ".join(wheres)}
        ORDER BY c.created_at DESC
        LIMIT ?
    """
    params.append(top_k)

    with db.get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [{"case_id": r["case_id"], "score": 1.0, "reason": reason} for r in rows]


@mcp.tool()
def get_stack_cases(block: str, stack: str) -> list[dict]:
    """
    Return all cases for every unit in the given block + stack, most recent first.
    Returns [case] with: case_id, unit_id, floor, status, category, sub_category,
                         urgency, summary, reopen_count, created_at, closed_at.
    """
    with db.get_conn() as conn:
        rows = conn.execute(
            """
            SELECT c.case_id, c.unit_id, u.floor, c.status, c.category,
                   c.sub_category, c.urgency, c.summary,
                   c.reopen_count, c.created_at, c.closed_at
            FROM cases c
            JOIN units u ON u.unit_id = c.unit_id
            WHERE u.block = ? AND u.stack = ?
            ORDER BY c.created_at DESC
            """,
            (block, stack),
        ).fetchall()
    return [dict(r) for r in rows]


@mcp.tool()
def get_recurring_stats(filters: Optional[dict] = None) -> dict:
    """
    Return aggregated recurring-defect statistics for the SDP analytics dashboard.
    filters: {block, stack, category, status, from_date, to_date}
    Returns {by_category, by_block, top_recurring}.
    """
    filters = filters or {}

    wheres: list[str] = []
    params: list = []

    if filters.get("block"):
        wheres.append("u.block = ?");     params.append(filters["block"])
    if filters.get("stack"):
        wheres.append("u.stack = ?");     params.append(filters["stack"])
    if filters.get("category"):
        wheres.append("c.category = ?");  params.append(filters["category"])
    if filters.get("status"):
        wheres.append("c.status = ?");    params.append(filters["status"])
    if filters.get("from_date"):
        wheres.append("c.created_at >= ?"); params.append(filters["from_date"])
    if filters.get("to_date"):
        wheres.append("c.created_at <= ?"); params.append(filters["to_date"])

    where_sql = ("WHERE " + " AND ".join(wheres)) if wheres else ""

    with db.get_conn() as conn:
        by_category: list[dict] = [
            dict(r) for r in conn.execute(
                f"""
                SELECT c.category,
                       COUNT(*)            AS total_cases,
                       SUM(c.reopen_count) AS total_reopens,
                       AVG(CASE WHEN c.closed_at IS NOT NULL
                           THEN JULIANDAY(c.closed_at) - JULIANDAY(c.created_at)
                           END)            AS avg_days_to_close
                FROM cases c
                JOIN units u ON u.unit_id = c.unit_id
                {where_sql}
                GROUP BY c.category
                ORDER BY total_cases DESC
                """,
                params,
            ).fetchall()
        ]

        by_block: list[dict] = [
            dict(r) for r in conn.execute(
                f"""
                SELECT u.block,
                       COUNT(*)            AS total_cases,
                       SUM(c.reopen_count) AS total_reopens
                FROM cases c
                JOIN units u ON u.unit_id = c.unit_id
                {where_sql}
                GROUP BY u.block
                ORDER BY total_cases DESC
                """,
                params,
            ).fetchall()
        ]

        top_recurring: list[dict] = [
            dict(r) for r in conn.execute(
                f"""
                SELECT c.case_id, c.unit_id, c.category,
                       c.reopen_count, c.status, c.summary, c.created_at,
                       u.block, u.stack, u.floor
                FROM cases c
                JOIN units u ON u.unit_id = c.unit_id
                {where_sql}
                ORDER BY c.reopen_count DESC, c.created_at DESC
                LIMIT 10
                """,
                params,
            ).fetchall()
        ]

    return {
        "by_category": by_category,
        "by_block": by_block,
        "top_recurring": top_recurring,
    }


@mcp.tool()
def request_extra_inspection(
    case_id: str,
    reasons: list[str],
    systemic_issue_id: Optional[str] = None,
    create_systemic_issue: bool = False,
    issue_details: Optional[dict] = None,
) -> dict:
    """
    Raise an extra-inspection approval request for SDP staff.
    Sets the case status to ESCALATION_PENDING and emits inspection.requested.
    Optionally links to an existing systemic_issue_id or creates a new systemic issue record.
    Returns {approval_id, issue_id}.
    """
    approval_id = f"APR-{uuid.uuid4().hex[:8].upper()}"
    now = _now()
    linked_issue_id = systemic_issue_id

    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO approvals (approval_id, case_id, reasons, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
            """,
            (approval_id, case_id, json.dumps(reasons), now),
        )
        conn.execute(
            "UPDATE cases SET status = 'ESCALATION_PENDING' WHERE case_id = ?",
            (case_id,),
        )

        # Link or create systemic issue if requested
        if create_systemic_issue and not linked_issue_id:
            linked_issue_id = f"SI-{uuid.uuid4().hex[:6].upper()}"
            details = issue_details or {}
            category = details.get("category", "General")
            block = details.get("block")
            stack = details.get("stack")
            related = details.get("related_cases", [case_id])
            if case_id not in related:
                related.append(case_id)
            recurrence_count = details.get("recurrence_count", len(related))
            confidence = details.get("confidence", 0.85)
            action = details.get("recommended_action", "Extra inspection requested by RecurrenceAgent")

            conn.execute(
                """
                INSERT INTO systemic_issues (
                    issue_id, category, block, stack, related_cases,
                    recurrence_count, confidence, detected_at, status,
                    recommended_action, approval_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    linked_issue_id, category, block, stack,
                    json.dumps(related), recurrence_count, confidence,
                    now, action, approval_id,
                ),
            )
        elif linked_issue_id:
            # Link existing systemic issue to this approval
            conn.execute(
                "UPDATE systemic_issues SET approval_id = ? WHERE issue_id = ?",
                (approval_id, linked_issue_id),
            )

        payload = {"approval_id": approval_id, "reasons": reasons}
        if linked_issue_id:
            payload["issue_id"] = linked_issue_id

        conn.execute(
            """
            INSERT INTO case_events (case_id, type, payload, created_at)
            VALUES (?, 'inspection.requested', ?, ?)
            """,
            (case_id, json.dumps(payload), now),
        )

    res = {"approval_id": approval_id}
    if linked_issue_id:
        res["issue_id"] = linked_issue_id
    return res


@mcp.tool()
def get_approval_status(approval_id: str) -> dict:
    """
    Return the current status of an extra-inspection approval request.
    Returns {approval_id, case_id, status, decided_by, decided_at}.
    status: pending | approved | rejected.
    """
    with db.get_conn() as conn:
        row = conn.execute(
            """
            SELECT approval_id, case_id, status, decided_by, decided_at
            FROM approvals
            WHERE approval_id = ?
            """,
            (approval_id,),
        ).fetchone()

    if not row:
        return {"error": f"Approval {approval_id!r} not found"}

    return dict(row)


@mcp.tool()
def get_systemic_issues(
    status: Optional[str] = None,
    category: Optional[str] = None,
    block: Optional[str] = None,
) -> list[dict]:
    """
    Return systemic defect clusters detected by RecurrenceAgent or staff.
    Filters: status (open | under_review | resolved), category, block.
    Returns [issue] where related_cases is parsed as a list of case_ids.
    """
    wheres: list[str] = []
    params: list = []

    if status:
        wheres.append("status = ?")
        params.append(status)
    if category:
        wheres.append("category = ?")
        params.append(category)
    if block:
        wheres.append("block = ?")
        params.append(block)

    where_sql = ("WHERE " + " AND ".join(wheres)) if wheres else ""

    with db.get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT issue_id, category, block, stack, related_cases,
                   recurrence_count, confidence, detected_at, status,
                   recommended_action, approval_id
            FROM systemic_issues
            {where_sql}
            ORDER BY detected_at DESC
            """,
            params,
        ).fetchall()

    result = []
    for r in rows:
        item = dict(r)
        if item.get("related_cases"):
            try:
                item["related_cases"] = json.loads(item["related_cases"])
            except Exception:
                pass
        result.append(item)

    return result


@mcp.tool()
def attach_inspection_brief(case_id: str, brief: str) -> dict:
    """
    Save the inspection brief (markdown or JSON string) produced by InitialInspectionAgent.
    Upserts into inspection_briefs, advances case status to EXTRA_INSPECTION,
    and emits inspection.completed. Returns {ok}.
    """
    now = _now()

    with db.get_conn() as conn:
        conn.execute(
            """
            INSERT INTO inspection_briefs (case_id, brief, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(case_id) DO UPDATE
                SET brief = excluded.brief,
                    created_at = excluded.created_at
            """,
            (case_id, brief, now),
        )
        conn.execute(
            "UPDATE cases SET status = 'EXTRA_INSPECTION' WHERE case_id = ?",
            (case_id,),
        )
        conn.execute(
            """
            INSERT INTO case_events (case_id, type, payload, created_at)
            VALUES (?, 'inspection.completed', ?, ?)
            """,
            (case_id, json.dumps({"has_brief": True}), now),
        )

    return {"ok": True}


if __name__ == "__main__":
    mcp.run()
