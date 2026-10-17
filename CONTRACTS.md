# CONTRACTS

## 1. Case statuses

```
SUBMITTED → INFO_NEEDED → ASSIGNED → VISIT_SCHEDULED → VALID / INVALID
→ REPAIR_BOOKED → REPAIRED → PENDING_SIGNOFF → CLOSED → REOPENED
→ ESCALATION_PENDING → EXTRA_INSPECTION
```

| Status | Meaning | Set by |
|---|---|---|
| `SUBMITTED` | Buyer submitted photo + description + visit slot | buyer app |
| `INFO_NEEDED` | IntakeAgent needs more info (missing room, blurry photo…) | IntakeAgent |
| `ASSIGNED` | Technician picked | TriageAgent |
| `VISIT_SCHEDULED` | Inspection slot booked | TriageAgent |
| `VALID` | Technician confirmed the defect | technician app |
| `INVALID` | Technician rejected the defect. **Terminal** — the case ends here | technician app |
| `REPAIR_BOOKED` | Buyer booked a repair slot | buyer app / CommsAgent |
| `REPAIRED` | Technician marked fixed | technician app |
| `PENDING_SIGNOFF` | Waiting for developer + buyer sign-off | system |
| `CLOSED` | Both signed | system |
| `REOPENED` | Buyer reopened within grace period, with new photo | RecurrenceAgent |
| `ESCALATION_PENDING` | Waiting for SDP staff to approve extra inspection | RecurrenceAgent |
| `EXTRA_INSPECTION` | Approved; InitialInspectionAgent brief attached | InitialInspectionAgent |

**Terminal statuses:** `INVALID` and `CLOSED`. Only `CLOSED` can be reopened.

**`INVALID` rules:**
- No transition out of `INVALID`. `reopen_case` rejects `INVALID` cases.
- The CommsAgent's invalid update gives the technician's reason and says: if the problem
  gets worse or changes, submit a new report. It does not offer a dispute.
- A new report for the same problem is a new case. SimilarDefectAgent still links it to the
  earlier `INVALID` case and shows it in the history.
- `INVALID` cases do not count toward the escalation threshold (3rd occurrence / stack cluster).

## 2. MCP tools

Inputs/outputs are drafts — fill in exact types on Day 1. Stubs live in
`agents/simephony/stub_tools.py`; real tools in `backend/mcp_server.py`.

| Tool | Inputs | Output | Built by | Used by |
|---|---|---|---|---|
| `create_case` | unit_id, buyer_id, description, preferred_slot_id | `{case_id, status}` | P3 | P1 |
| `add_photo` | case_id, photo_path, kind (`original`/`reopen`/`verdict`) | `{photo_id, url}` | P3 | P1 |
| `get_unit` | unit_id | `{unit_id, block, floor, stack, contractor, buyer}` | P3 | P1 |
| `get_available_slots` | skill, block, from_date, to_date | `[{slot_id, technician_id, start, end}]` | P3 | P2 |
| `assign_technician` | case_id, technician_id, slot_id, reason | `{ok}` | P3 | P2 |
| `book_slot` | case_id, slot_id, kind (`visit`/`repair`) | `{ok, booking_id}` | P3 | P2 |
| `record_verdict` | case_id, verdict (`VALID`/`INVALID`), note, photo_path? | `{ok}` | P3 | P2 |
| `record_signoff` | case_id, party (`developer`/`buyer`) | `{ok, both_signed}` | P3 | P2 |
| `reopen_case` | case_id, photo_path, description | `{ok, reopen_count}` or error if outside grace or case is `INVALID` | P3 | P2 |
| `send_email` | to, subject, body, case_id | `{status: "sent" \| "logged, not sent"}` | P3 | P1, P2 |
| `get_case_history` | case_id or unit_id | `[event]` | P4 | P1, P2 |
| `find_similar_cases` | case_id or text, filters (unit/floor/stack/category/contractor), top_k | `[{case_id, score, reason}]` | P4 | P1, P2 |
| `get_stack_cases` | block, stack | `[case]` | P4 | P1, P2 |
| `get_recurring_stats` | filters | `{by_category, by_block, top_recurring}` | P4 | P1 |
| `request_extra_inspection` | case_id, reasons[] | `{approval_id}` | P4 | P2 |
| `get_approval_status` | approval_id | `{status: pending/approved/rejected}` | P4 | P2 |
| `attach_inspection_brief` | case_id, brief (markdown/JSON) | `{ok}` | P4 | P1 |

## 3. Events

Every event is a row in `case_events` and is pushed over SSE.

`case.created`, `verdict.recorded`, `repair.done`, `signoff.completed`,
`case.reopened`, `inspection.approved`, `email.sent`, `agent.step`

Envelope:

```json
{ "type": "case.created", "case_id": "C-0001", "ts": "2026-10-17T10:00:00+08:00", "payload": {} }
```

## 4. Business rules

All in [`rules.yaml`](rules.yaml): category → skill, urgency rules, grace period
(30 days), escalation threshold (3rd occurrence, or 3+ similar cases in a stack).

## 5. Database (SQLite)

- One schema: [`backend/schema.sql`](backend/schema.sql) — P3 + P4 write it together, includes `outbox`.
- One connection module: [`backend/db.py`](backend/db.py) — owned by P3, turns on WAL. Nobody writes their own connection code.
- `data/simephony.db` = live DB (gitignored). `data/seed.db` = clean copy for resets (committed).
- Photos saved in `uploads/` and served by FastAPI at `/uploads/...`.

## 6. Email

- Team Gmail account + app password in `.env` (never committed).
- `send_email` uses `smtplib`, always writes to `outbox`, emits `email.sent`.
  On failure it still logs and returns `"logged, not sent"`.
