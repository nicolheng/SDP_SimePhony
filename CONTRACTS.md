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
| `ASSIGNED` | Technician picked and visit time held; waiting for the technician to accept | TriageAgent |
| `VISIT_SCHEDULED` | Technician accepted the visit (booking confirmed) | technician app |
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

## 2. Tools (`backend/tools.py`) and the MCP server

`backend/tools.py` holds the business rules and is the one place that changes a case. It follows the
web app's model (`backend/demo_api`): the **demo clock** (`app_meta.now`, moved by "skip days"),
visits/repairs on fixed **Malaysia-time 2-hour blocks** (09:00, 11:00, 14:00, 16:00; no Sundays;
14-day window), bookings stored as rows in `slots`, visits by **in-house technicians**, repairs per
`demo_api/config.py` `REPAIR_PLAN` (duration, and subcontractors for specialist trades).

- **Agents (P1/P2):** `sys.path` add `backend/`, then `import tools` and call the functions directly.
  The first call sets up the DB (schema + web-app migrations), so FastAPI doesn't need to be running.
- **MCP clients:** `python backend/mcp_server.py` (stdio) or `--http` (port `MCP_PORT`, default 8002).
  Exposes the read and agent tools below plus the resource `simephony://rules`. Human decisions are
  **not** exposed: an AI client must not record verdicts, sign off or approve escalations.
- **Web app:** `demo_api/workflow.py` still has its own copies of these rules; it should call
  `tools.py` later so there is one source of truth.

Write tools return `{ok: false, error}` (never raise) when a rule blocks the action. Every event
written has a `message` (shown on the timeline and SDP trace page). Times are UTC `...000Z`.

### Read tools (MCP + direct)

| Tool | Inputs | Output |
|---|---|---|
| `get_clock` | – | `{now, now_local}` demo time; use it instead of the real date |
| `get_case` | case_id | full case + unit, buyer, technician / inspector / support, photos, bookings, verification (guide), related_cases, inspection_brief, approvals, repair_plan |
| `get_unit` | unit_id | `{unit_id, block, floor, stack, contractor, buyer}` |
| `get_case_history` | case_id or unit_id | `[event]` |
| `get_available_slots` | block, skill? (str or list), from_date?, to_date? (YYYY-MM-DD, Malaysia), include_subcontractors?, limit? | `[{start, start_local, technician_id, technician_name, kind}]` free blocks |
| `get_booking_options` | case_id, kind (`visit`/`repair`), limit=3 | visit: `{skills, preferred_at, preferred: {start, technicians} \| null, alternatives: [{start, technicians}], excluded_technicians, no_availability}` (technicians who rejected this visit are left out); repair: `{plan, preferred_worker, options: [{start, slots, workers}], no_availability}` |
| `get_verification_protocol` | category | `{steps}` safe checks from rules.yaml `verification_protocols` |
| `find_similar_cases` | case_id or text, filters?, top_k | `[{case_id, score, reason, unit_id, status, counts_toward_escalation}]`: same unit, same stack, next door, same contractor, blended with embedding similarity |
| `check_escalation` | case_id | `{occurrence_count, stack_units, stack_unit_count, repeated_defect, stack_cluster, should_escalate, reasons, existing_systemic_issue, pending_approval_id}` (rules in §4) |
| `get_stack_cases` | block, stack | `[case]` |
| `get_recurring_stats` | filters | `{by_category, by_block, top_recurring}` |
| `get_systemic_issues` | status?, category?, block? | `[systemic_issue]` |
| `get_approval_status` | approval_id | `{status: pending/approved/rejected}` |

### Agent write tools (MCP + direct)

| Tool | Inputs | Effect | Agent |
|---|---|---|---|
| `save_intake_result` | case_id, intake (AI Intake JSON) | → `INFO_NEEDED` if follow_up_question, else `SUBMITTED` | IntakeAgent |
| `save_similar_cases` | case_id, links `[{related_case_id, reason, score?}]`, occurrence_count? | `case_links` shown on the case page | SimilarDefectAgent |
| `assign_technician` | case_id, technician_id, start, reason, urgency?, support_id? | requests the visit and holds the time, booking `PENDING`: `SUBMITTED`/`REOPENED` → `ASSIGNED`; `EXTRA_INSPECTION` stays, optional subcontractor joins. Refuses technicians who rejected this visit | TriageAgent |
| `escalate_booking` | case_id, reason | nobody free or all rejected: booking `NEEDS_STAFF`, email SDP | TriageAgent |
| `start_verification` | case_id, guide `{intro, steps, ifFails}` or list of steps | `REPAIRED` → `PENDING_SIGNOFF` | VerificationAgent |
| `request_extra_inspection` | case_id, reasons[], recommended_action?, title? | → `ESCALATION_PENDING`, approval, email SDP; **reuses the open systemic issue** for the stack (e.g. SI-002) or creates one | RecurrenceAgent |
| `attach_inspection_brief` | case_id, brief `{timeline, photoComparison, neighbouringUnits, likelyComponents, checklist}` | needs an approved request; → `EXTRA_INSPECTION` | InitialInspectionAgent |
| `notify_buyer` | case_id, title, body, email=true | in-app message + email | CommsAgent |
| `notify_technician` | case_id, subject, body, technician_id? | email to the worker | CommsAgent |
| `send_email` | to, subject, body, case_id? | Gmail SMTP (`EMAIL_ENABLED`, `EMAIL_REDIRECT_TO`); always in outbox | any |
| `log_agent_step` | case_id, agent, message, data? | `agent.step` on the trace page | any |

### Human actions (direct only, for the web app; not on MCP)

| Function | Who | Effect |
|---|---|---|
| `create_case(unit_id, buyer_id, description, preferred_slot, photo?)` | buyer | → `SUBMITTED`; keeps `preferred_visit_at` |
| `answer_follow_up(case_id, answer, photo?)` | buyer | appends to description; intake runs again |
| `add_photo(case_id, photo, kind)` | any | photo = data URL or file path |
| `respond_to_assignment(case_id, accept, reason?)` | technician | accept → booking `CONFIRMED`, `ASSIGNED` → `VISIT_SCHEDULED`; reject (reason required) → time freed, technician cleared, back to `SUBMITTED` (`REOPENED` for a revisit; `EXTRA_INSPECTION` stays), `booking.rejected` → TriageAgent reassigns |
| `record_verdict(case_id, verdict, note, photo?)` | technician | visit must be confirmed; `VALID` / `INVALID` (terminal) |
| `book_repair(case_id, start, technician_id?)` | buyer | `VALID` → `REPAIR_BOOKED` (repair plan hours, any qualified worker) |
| `mark_repaired(case_id, repair_note, photo?)` | technician | → `REPAIRED` (VerificationAgent next) |
| `record_verification(case_id, outcome, note, photo?)` | buyer | FIXED → buyer sign-off (closes if developer signed); NOT_FIXED (photo required) → `REOPENED`; CANNOT_VERIFY → no change |
| `record_signoff(case_id, party, signed_by?)` | SDP / buyer | both signed → `CLOSED` |
| `reopen_case(case_id, description, photo)` | buyer | `CLOSED` within `grace_period_days` of closing (demo clock), photo required → `REOPENED` |
| `decide_approval(approval_id, approve, decided_by?)` | SDP | approved → `inspection.approved`; rejected → case `VALID` |

Not in `tools.py` yet (still only in `demo_api`): the 14-day sign-off reminder / auto-close sweep and
the demo controls (skip days, simulate rain).

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