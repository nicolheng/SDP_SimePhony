# SDP_SimePhony

AI-assisted defect management for SDP property buyers, technicians and SDP staff.
**"Don't just close the ticket. Close the problem."**

Buyers report defects with a photo; AI agents (Google ADK + Gemini Flash) handle intake,
find similar/recurring defects, assign technicians, write buyer updates, and escalate
recurring problems to SDP staff for a human-approved extra inspection.

See [CONTRACTS.md](CONTRACTS.md) for statuses, tools, events and DB rules, and
[rules.yaml](rules.yaml) for business rules.

## Stack

Google ADK · Gemini Flash · FastMCP · FastAPI · SQLite (WAL) · Next.js · shadcn/ui · Recharts · Gmail SMTP

## Layout

```
agents/simephony/   ADK agents (P1, P2) — currently on stub tools
backend/            FastAPI app, FastMCP tool server, db.py, schema.sql, seed scripts (P3, P4)
frontend/           Next.js buyer / technician / SDP apps (P3, P4)
data/               seed.db (committed) and simephony.db (live, gitignored)
uploads/            photo uploads (gitignored)
rules.yaml          shared business rules
CONTRACTS.md        shared contracts
```

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then fill in your own Gemini key + team Gmail app password
```

Run:

```bash
# API (http://localhost:8001)
cd backend && uvicorn main:app --reload --port 8001

# MCP tool server
python backend/mcp_server.py

# Agents dev UI (run from agents/, pick "simephony")
cd agents && adk web
```

## Team

| Role | Owns |
|---|---|
| P1 – AI Engineer A | IntakeAgent, SimilarDefectAgent, InitialInspectionAgent, analytics insight |
| P2 – AI Engineer B | TriageAgent, CommsAgent, VerificationAgent, RecurrenceAgent, sign-off logic, guardrails |
| P3 – Full-stack (buyer/technician) | Buyer + technician apps, db.py, booking/scheduling/email tools |
| P4 – Full-stack (SDP) | SDP console, analytics, approvals, history/analytics tools |

## Workflow

- Never commit `.env`.
- Branch per feature (`p1/intake-agent`, `p3/report-defect`…), open a PR into `main`.
- Changes to `CONTRACTS.md`, `rules.yaml` or `schema.sql` need sign-off from affected owners.
- Final demo build is tagged `v1-demo`.
