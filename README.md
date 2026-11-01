# Simephony

**Don't just close the defect. Prove it's resolved.**

Simephony aims to solve a gap in how property defects are handled: a defect is marked closed without
anyone confirming the repair worked, and when it comes back it is logged as a new ticket, so recurring
problems in a unit or across a building stack go unnoticed. It solves this with AI agents that read the
buyer's report and photo, set the urgency, book a qualified technician, check the technician's repair photo
and give the buyer a short, safe checklist. A case closes only after the developer and the buyer both sign
off, and a defect that returns a third time in a unit, or appears in three or more units of the same stack,
is escalated to SDP staff for a detailed inspection. The impact is a trusted record of every repair, fewer
repeat repairs and disputes, and root causes found and fixed earlier.

## How a defect moves through Simephony

1. **Report:** the buyer describes the defect (English or Malay) and adds a photo.
2. **Inspection visit:** the defect is categorised, its urgency set and a qualified technician booked.
   The technician accepts the job or hands it over to a colleague.
3. **Verdict:** the technician confirms the defect (valid) or not (invalid). For a valid defect the repair
   time is estimated and the buyer books a repair slot.
4. **Repair and photo check:** after the repair, the technician's photo is checked against the original
   report and a short, safe checklist is prepared for the buyer.
5. **Sign-off:** SDP staff sign off first, then the buyer checks the repair and signs off. The case closes.
6. **Recurrence:** if the buyer reopens within 30 days, the case is revisited, or escalated to SDP for a
   detailed inspection on the 3rd occurrence or when 3+ units in the stack have the same defect.

AI agents recommend; people decide. Agents cannot record verdicts, sign off or approve escalations, and
buyer messages never admit liability or give unsafe repair steps.

## Repo layout

```
agents/simephony/   LangGraph agents: intake, similar defects, triage, booking, repair estimate,
                    verification, recurrence, initial inspection, comms (+ guardrails)
backend/            FastAPI web API (demo_api/), tools.py (all business rules + DB writes),
                    FastMCP tool server, db.py, schema.sql, seed scripts
frontend/           Next.js apps: buyer and technician (mobile), SDP console (desktop)
data/               seed.db (committed demo data); simephony.db (live, gitignored)
tests/              unit, integration and functional tests (pytest)
scripts/            demo_flow.py: watch the agents run through scenarios end to end
rules.yaml          business rules: categories, urgency, grace period, escalation thresholds
CONTRACTS.md        statuses, events, tools and DB rules shared by the team
```

## Run it locally

Needs Python 3.12+, Node 24.22.1+ and [Ollama](https://ollama.com) with two models:

```bash
ollama pull qwen2.5:7b
ollama pull llava-llama3
```

One-time setup, from the repo root:

```bash
python -m venv .venv
.venv\Scripts\activate              # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env              # macOS/Linux: cp .env.example .env
cd frontend && npm install
```

Then run each in its own terminal (Ollama keeps running in the background):

```bash
# Backend API: http://localhost:8001 (health check: /health)
cd backend
uvicorn main:app --port 8001
```

```bash
# Web app: http://localhost:3000 (role picker: buyer, technician, SDP staff)
cd frontend
npm run dev
```

In the SDP console, **Reset demo** restores the demo data from `data/seed.db`. The buyer app is signed in
as the demo buyer of unit A-12-08. See [frontend/README.md](frontend/README.md) for a 3-minute demo script.

### Settings

All settings live in `.env`, and [.env.example](.env.example) has the full list. These matter most:

| Setting | What it does |
|---|---|
| `USE_AI_AGENTS` | Turns the AI agents on. `true` or `all` runs every agent, `false` or empty uses only the rule-based stand-ins, and a list like `comms,triage` runs just those. The names are intake, similar, triage, estimate, verification, inspection and comms. |
| `LLM_BASE_URL`, `LLM_API_KEY` | The AI server. Defaults to local Ollama. |
| `MODEL_TEXT`, `MODEL_VL` | The text and vision models. Changing a model only needs this `.env` edit. |
| `LLM_TIMEOUT_TEXT`, `LLM_TIMEOUT_VISION` | Seconds to wait per attempt before retrying once, then falling back to the rules. Raise these if a slow laptop falls back on normal runs. |
| `LLM_MAX_TOKENS` | Longest JSON answer a model may write, which stops runaway output. |
| `EMAIL_ENABLED` | Off in `.env.example`, so emails only go to the `outbox` table. Set it to `true` after adding real Gmail details. |
| `EMBEDDINGS_ENABLED` | `false` skips the embedding model used to search for similar past cases. |

Restart the backend after changing `.env`.

## Tests

```bash
pytest                          # all tests with a stand-in model; the live DB is never written
pytest -m live_llm              # the same checks against the real Ollama models (slow)
python scripts/demo_flow.py     # scenarios printed step by step; add --live for the real models
```

## Team

| Role | Owns |
|---|---|
| Tan Syn Yee – AI Engineer A | IntakeAgent, SimilarDefectAgent, InitialInspectionAgent, analytics insight |
| Nicol Heng Si Yi – AI Engineer B | TriageAgent, BookingAgent, CommsAgent, VerificationAgent, RecurrenceAgent, RepairEstimateAgent, guardrails |
| Phoebe Angelina Surin – Full-stack (buyer/technician) | Buyer + technician apps, db.py, booking/scheduling/email tools |
| Lim Xiao Wen – Full-stack (SDP) | SDP console, analytics, approvals, history/analytics tools |

## Workflow

- Never commit `.env`.
- Branch per feature, open a PR into `main`.
- Changes to `CONTRACTS.md`, `rules.yaml` or `schema.sql` need sign-off from affected owners.
