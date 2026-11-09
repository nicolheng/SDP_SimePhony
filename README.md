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
2. **Inspection visit:** the defect is categorised, its urgency set and the earliest free qualified technician
   booked; the buyer doesn't pick a time. The technician accepts the job or hands it over to a colleague.
3. **Verdict:** the technician confirms the defect (valid) or not (invalid). For a valid defect the repair
   time is estimated and the repair is booked at the first free time, again with no buyer action.
4. **Repair and photo check:** after the repair, the technician's photo is checked against the original
   report and a short, safe checklist is prepared for the buyer.
5. **Sign-off:** SDP staff approve every repaired defect in the unit first. The buyer then checks each defect
   (Fixed / Not Fixed) and signs off once for the whole unit, which closes all its defects.
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
python main.py
```

`python main.py` restarts the backend by itself when you save a change in `backend/`, `agents/` or
`rules.yaml`. It ignores `frontend/`, `.venv/`, `data/`, `uploads/` and `tests/`. Two things still need a
manual restart (Ctrl+C, then run it again): a change to `.env`, and a reload that happens while the AI agents
are working, since that cancels their work and the report stays at Submitted. If you'd rather start uvicorn
yourself, use `uvicorn main:app --port 8001 --reload --reload-dir ..` so the `agents/` folder is watched too.

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
| `USE_AI_AGENTS` | Turns the AI agents on. **The demo uses `only`**: every agent's answer is the one saved, and nothing falls back to the rule-based stand-ins, so what you see is the AI's own work. `true` or `all` runs every agent but lets the rules take over when a step fails (safer on a slow laptop or a busy free tier), `false` or empty uses only the rule-based stand-ins, and a list like `comms,triage` runs just those. The names are intake, similar, triage, estimate, verification, inspection and comms. A new report is saved first and its agents run straight after, on the progress screen. Buyer messages, the repair estimate, and an approved extra inspection's brief and booking are made just after a click is saved, so buttons like Accept, Valid and Approve extra inspection don't wait. Mark Repaired still waits for the photo check. A failed AI step holds a new report for SDP review, shows an error on the click, or, after a click, is noted in the case trace. |
| `LLM_BASE_URL`, `LLM_API_KEY` | The AI server. Defaults to local Ollama. |
| `MODEL_TEXT`, `MODEL_VL` | The text and vision models. Changing a model only needs this `.env` edit. |
| `LLM_TIMEOUT_TEXT`, `LLM_TIMEOUT_VISION` | Seconds to wait per attempt before trying again, then falling back to the rules (in `only` mode, showing an error). Raise these if a slow laptop falls back on normal runs. |
| `LLM_MAX_TOKENS` | Longest JSON answer a model may write, which stops runaway output. |
| `LLM_REASONING_EFFORT`, `LLM_MAX_RETRIES` | For cloud models. How hard the model thinks before answering (`low` keeps it quick), and how many times a call is tried again, for example when a free tier says "too many requests". |
| `EMAIL_ENABLED` | Off in `.env.example`, so emails only go to the `outbox` table. Set it to `true` after adding real Gmail details. |
| `EMBEDDINGS_ENABLED` | `false` skips the embedding model used to search for similar past cases. |

### Cloud model (no Ollama needed)

To run without Ollama, use Google Gemini:

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. In `.env`, swap the Ollama lines for the Gemini block in `.env.example`, and paste your key. Never commit the key.
   It uses `gemini-3.1-flash-lite` for text and `gemini-3.5-flash-lite` for photos. Each model has its own
   free limit, so two models give one key twice the calls.
3. Run `python scripts/check_llm.py`. It sends one text and one photo request and says whether both worked.
   `python scripts/check_llm.py --list` shows the model names your key can use.
4. Restart the backend.

On a cloud model, buyer names, emails, phone numbers and unit numbers never leave your laptop: they are
swapped for placeholders like `PERSON_1` and `UNIT_1` before each prompt is sent, and swapped back in the
answer (`LLM_PRIVACY_FILTER`, on by default for cloud). Photos are sent as they are, so text inside a photo
is not filtered.

The backend also skips the model warm-up, and `/health` only checks that a key is set,
so neither uses up the free quota. The free tier has a daily request limit per key, and one report uses
several requests, so if a whole team tests on one key, the limit can run out.

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
