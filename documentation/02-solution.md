# 2. Solution

SimePhony has three apps on one shared backend, with AI agents doing the routine work at each step.

## The three apps

| App | Main screens |
|---|---|
| **Buyer** (mobile) | Report a defect (photo, description, preferred visit time), case progress, book repair, sign-off checklist, reopen |
| **Technician** (mobile) | My jobs, accept / hand over, inspection result (valid / invalid), mark repaired, related defects, inspection brief |
| **SDP console** (desktop) | Defect list and case detail, approvals, analytics, agent trace (live log of every agent step) |

## The agents

| Agent | What it does |
|---|---|
| **Intake Agent** | Reads the photo and description; sets category, location, summary and urgency; asks a follow-up question if something is missing |
| **Similar Defect Agent** | Finds related past cases in the same unit, the same stack, next door and by the same contractor |
| **Triage Agent** | Maps the category to a trade, picks a free qualified technician and books the visit (or the next colleague if one hands over) |
| **Comms Agent** | Writes buyer updates in the app and by email, passing a guardrail that blocks liability or unsafe wording |
| **Verification Agent** | Builds a short, case-specific checklist for the buyer to check the repair before signing off |
| **Recurrence Agent** | On a reopen, checks the history and raises an extra inspection to SDP on the 3rd occurrence or a stack cluster |
| **Initial Inspection Agent** | After SDP approves, prepares an inspection brief: timeline, likely causes, neighbouring units, checklist |

## What makes it different

- **Recurrence detection.** The 3rd occurrence in a unit, or 3+ units in the same stack, triggers escalation.
- **Root-cause focus.** Escalated cases get a joint inspection (in-house technician plus specialist subcontractor)
  with a brief that points to the source, not the patch.
- **Human in the loop.** AI never records a verdict, signs off or approves an escalation. People make those calls.
- **Guardrails.** Buyer messages are checked for liability language, promises and unsafe advice before sending.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, shadcn/ui, Recharts |
| Backend | FastAPI (`backend/main.py`), business rules in `backend/tools.py` |
| Agent tools for AI clients | FastMCP server (`backend/mcp_server.py`) exposing read and agent tools, not human decisions |
| Agents | LangGraph agents in `agents/simephony/` (local Qwen via Ollama, cloud fallback); the web app uses rule-based stand-ins in `backend/demo_api/agents.py` |
| Data | SQLite with WAL (`data/simephony.db` live, `data/seed.db` clean copy for resets) |
| Email | Gmail SMTP, with every email also logged to the `outbox` table |

Shared business rules (category → trade, urgency, 30-day grace period, escalation thresholds) live in
[`rules.yaml`](../rules.yaml).
