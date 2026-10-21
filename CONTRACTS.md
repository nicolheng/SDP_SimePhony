# CONTRACTS

## 1. Case statuses

```
SUBMITTED → INFO_NEEDED → VISIT_SCHEDULED → VALID / INVALID
→ REPAIR_BOOKED → REPAIRED → PENDING_SIGNOFF → CLOSED → REOPENED
→ ESCALATION_PENDING → EXTRA_INSPECTION
```

| Status | Meaning |
|---|---|
| `SUBMITTED` | Buyer sent photo, description and preferred visit time |
| `INFO_NEEDED` | IntakeAgent asked the buyer for more detail |
| `VISIT_SCHEDULED` | Inspection visit booked with a technician |
| `VALID` / `INVALID` | Technician's verdict. `INVALID` is terminal |
| `REPAIR_BOOKED` | Buyer booked the repair |
| `REPAIRED` | Repair done; VerificationAgent sends the buyer's check guide |
| `PENDING_SIGNOFF` | Developer signs first, then the buyer (14 days, else auto-close) |
| `CLOSED` | Both signed. Can be reopened within 30 days with a new photo |
| `REOPENED` | Buyer reopened, or the buyer's check failed |
| `ESCALATION_PENDING` | Waiting for SDP to approve an extra inspection |
| `EXTRA_INSPECTION` | Approved; brief attached, joint inspection booked |

`ASSIGNED` is no longer used. Each booked job (visit, extra inspection, repair) also has a
`booking_status`: `PENDING` until the worker accepts, then `CONFIRMED`; `REJECTED` if they hand it over;
`NEEDS_STAFF` if nobody is available. Verdicts and repairs are only recorded on accepted jobs.

## 2. Tools (`backend/tools.py`) and the MCP server

`tools.py` holds the business rules and is the only code that changes a case. Inputs and outputs are in
each function's docstring. It uses the web app's demo clock and booking model (`demo_api/config.py`).

- **Web app:** `routes.py` → `workflow.py` → `tools.py`, one transaction per request (`tools.use_connection`).
- **Agents (P1/P2):** add `backend/` to `sys.path`, `import tools`, call functions directly.
- **MCP clients:** `python backend/mcp_server.py` (stdio) or `--http` (port 8002). Exposes the read and agent
  tools only, never human decisions. No MCP client is wired up yet (only the tests use one).

Write tools return `{ok: false, error}` instead of raising when a rule blocks the action.

| Group | Tools |
|---|---|
| Read (MCP) | `get_case`, `get_unit`, `get_case_history`, `get_clock`, `get_available_slots`, `get_booking_options`, `get_verification_protocol`, `find_similar_cases`, `check_escalation`, `get_stack_cases`, `get_recurring_stats`, `get_systemic_issues`, `get_approval_status` |
| IntakeAgent (MCP) | `save_intake_result` |
| SimilarDefectAgent (MCP) | `save_similar_cases` |
| TriageAgent | `assign_technician`, `escalate_booking` (MCP); `get_reassignment_options`, `reassign_job` (direct only) |
| VerificationAgent (MCP) | `start_verification` |
| RecurrenceAgent (MCP) | `request_extra_inspection` (reuses the open systemic issue for the stack) |
| InitialInspectionAgent (MCP) | `attach_inspection_brief` |
| CommsAgent / any (MCP) | `notify_buyer`, `notify_technician`, `send_email`, `log_agent_step` |
| Human actions (web app only) | `create_case`, `answer_follow_up`, `add_photo`, `respond_to_assignment` (accept / hand over), `book_repair`, `record_verdict`, `mark_repaired`, `record_signoff`, `record_verification`, `reopen_case`, `decide_approval` |
| Time rules (system) | `sweep_signoffs` (sign-off reminder / auto-close, run on every request) |

## 3. Events

Every event is a row in `case_events`, written by `tools.py`, with a `message` the timeline and SDP trace
pages show. The web app reads them through `GET /api/state`. Main types: `case.created`, `case.info_needed`,
`case.assigned`, `booking.confirmed` / `rejected` / `escalated`, `verdict.recorded`, `repair.booked`,
`repair.done`, `verification.requested` / `completed`, `signoff.completed`, `case.closed`, `case.reopened`,
`recurrence.detected`, `inspection.requested` / `approved` / `rejected`, `email.sent`, `agent.step`.

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

## 7. Agents

| Agent | What it does | Triggered by | Owner |
|---|---|---|---|
| IntakeAgent | Reads photo + description; category, location, summary; asks for missing info | `case.created` (new-case flow) | P1 |
| SimilarDefectAgent | Finds related past cases (unit, floor, stack, category, contractor); `recurrence_count` | new-case flow | P1 |
| TriageAgent | Urgency, category → skill, picks technician + slot, offers alternatives | new-case flow | P2 |
| CommsAgent | Buyer updates in app + Gmail, within guardrails | status changes | P2 |
| VerificationAgent | Case-specific guide for the buyer to check the repair before signing off | `repair.done` | P2 |
| RecurrenceAgent | Reopen logic, `reopen_count`, raises "extra inspection?" to SDP | `case.reopened` | P2 |
| InitialInspectionAgent | Inspection brief for the technician after SDP approval | `inspection.approved` | P1 |

New-case flow: `SequentialAgent(IntakeAgent → SimilarDefectAgent → TriageAgent)`. The others are event-driven.

### VerificationAgent rules

Runs when the case reaches `REPAIRED`. Its guide is shown on the buyer's sign-off screen
(and sent by CommsAgent) so the buyer can confirm the fix before signing.

- **Specific to this case only.** Every check must come from this case's category,
  sub-category, location in the unit, the buyer's original description and photos, and the
  technician's repair note. E.g. for a master-bedroom ceiling leak: "Run the shower in the
  unit above for 10 minutes, then check the repaired patch above the wardrobe for damp or
  staining."
- **No general guidance.** No generic maintenance tips, no checks for other rooms or other
  defect types, no home-care advice. If the case lacks the detail needed for specific checks,
  it says so and asks the technician for the repair note rather than filling in generic steps.
- **Safe checks only.** Look, touch the surface, run water, use the switch or door as normal.
  Never ask the buyer to open panels, touch wiring, climb, or use tools.
- **Same liability guardrail** as CommsAgent: no promises that the defect won't come back,
  no admission of liability.
- Ends with what to do if a check fails: don't sign off; reopen within the grace period
  with a new photo (hands over to RecurrenceAgent).

### RecurrenceAgent rules

- Reopen only a `CLOSED` case, within the grace period, with a mandatory new photo; `reopen_count` goes up.
- On the 3rd occurrence or a stack cluster → `request_extra_inspection` → pause at `ESCALATION_PENDING`.
- Approved → trigger InitialInspectionAgent. Rejected → normal repair booking.

## AI Intake JSON Contract
The IntakeAgent outputs this exact JSON. P3 must map these fields to the `cases` table. P4 must display these fields on the frontend.

{
  "category": "string (must match rules.yaml categories)",
  "sub_category": "string",
  "location_in_unit": "string",
  "summary": "string",
  "urgency": "high" | "normal" | "low",
  "mentions_previous_issue": boolean,
  "mentioned_recurrence_count": integer | null,
  "missing_info": ["string"],
  "follow_up_question": "string (Polite question to buyer if missing_info is not empty. Empty string if none)",
  "preliminary_outcome": "VALID_DEFECT" | "NOT_A_DEFECT" | "INSUFFICIENT_INFORMATION",
  "mismatch_detected": boolean
}

### Database Mapping (For P3 - Backend)
| AI JSON Key | Database Column (`cases` table) | Notes |
| :--- | :--- | :--- |
| `category` | `category` | Direct match. Must match `rules.yaml`. |
| `sub_category` | `sub_category` | Direct match. |
| `location_in_unit` | `location_in_unit` | Direct match. |
| `summary` | `summary` | Direct match. (Raw text goes to `description`). |
| `urgency` | `urgency` | Must be lowercase: `high`, `normal`, or `low`. |
| `missing_info` | `missing_info` | Stored as JSON text array. |
| `follow_up_question` | `follow_up_question` | Direct match. Drives `INFO_NEEDED` status. |
| `preliminary_outcome` | `inspection_outcome` | Maps to DB enum (`VALID_DEFECT`, etc.). |
| `mentioned_recurrence_count`| `occurrence_count` | P3 saves this to track recurrences. |

### UI/Event Mapping (For P4 - Frontend)
| AI JSON Key | Frontend Action |
| :--- | :--- |
| `urgency` | Color-code the case card (Red=high, Yellow=normal, Green=low). |
| `follow_up_question` | If not empty, show a popup/modal asking the buyer this question. |
| `mismatch_detected` | If `true`, show a warning banner: "Photo and description don't match. Please verify." |
| `preliminary_outcome` | If `INSUFFICIENT_INFORMATION`, prompt user to retake photo. |