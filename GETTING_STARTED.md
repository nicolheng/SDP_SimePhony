# Getting Started

What exists today, how to run it, and what you should see.

## What's ready

| Area | Status | Notes |
|---|---|---|
| Repo structure, `.gitignore`, `.env.example` | ✅ Ready | `.env`, live DB and uploads are never committed |
| `CONTRACTS.md` | 📝 Draft | Finalise together in the Day 1 session |
| `rules.yaml` | 📝 Draft | Category → skill, urgency, 30-day grace, escalation thresholds |
| `backend/schema.sql` | ✅ Draft, loads | 11 tables incl. `outbox`, `approvals`, `case_embeddings` |
| `backend/db.py` | ✅ Works | WAL on; restores `seed.db` if live DB missing; `reset_db()` |
| `backend/main.py` (FastAPI) | ✅ Runs | `/health`, `/demo/reset`, `/uploads/*`. No case endpoints yet |
| `agents/simephony` (ADK) | ✅ Runs on stubs | Intake → SimilarDefect → Triage, fake data for A-12-08 |
| `backend/mcp_server.py` (FastMCP) | 🟡 Skeleton | Loads, but tools raise `NotImplementedError` |
| Seed scripts (`seed.db`) | ⬜ Not started | P3 core data, P4 18-month history |
| Comms / Verification / Recurrence / InitialInspection agents | ⬜ Not started | Event-driven, Day 2–3 |
| Guardrail callback | ⬜ Not started | P2, Day 1 |
| Frontend (Next.js) | ⬜ Not started | See `frontend/README.md` for init commands |

## One-time setup

Needs Python 3.12+ and Node 20+.

```powershell
# from the repo root
python -m venv .venv
.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt     # sentence-transformers is large; P4 needs it, others can skip it
copy .env.example .env              # macOS/Linux: cp .env.example .env
```

Put your own Gemini key in `.env` → `GOOGLE_API_KEY=` (free at https://aistudio.google.com/apikey).

Activate the venv in every new terminal before running anything below.

## What to run

### 1. API server

```powershell
cd backend
uvicorn main:app --reload --port 8001
```

**Expect:**
- Terminal shows `Application startup complete.`
- http://localhost:8001/health → `{"ok":true}`
- http://localhost:8001/docs → Swagger UI with `/health` and `/demo/reset`
- `data/simephony.db` is created on first start (empty schema until `seed.db` exists)

### 2. Agents dev UI (`adk web`)

Needs `GOOGLE_API_KEY` set.

```powershell
cd agents
adk web
```

**Expect:**
- Open http://localhost:8000, choose **simephony** in the top-left dropdown
- Send: `Ceiling bocor again in master bedroom, unit A-12-08`
- Three agents run in order: **IntakeAgent** (category/location/summary JSON) → **SimilarDefectAgent** (finds 2 past leaks in A-12-08 + 1 in A-11-08, all fake) → **TriageAgent** (urgency + picks technician `T-PLUMB-1`)
- The Events/Trace tab shows each tool call

If ADK says the API key is missing, also copy `.env` into `agents\simephony\`.

### 3. MCP tool server

```powershell
python backend/mcp_server.py
```

**Expect:** it starts and waits on stdio. Nothing useful yet. Calling any tool returns `NotImplementedError` until P3/P4 implement them.

## Ports

| Service | Port |
|---|---|
| `adk web` | 8000 |
| FastAPI | 8001 (use `--port 8001` to avoid clashing with `adk web`) |
| Next.js (later) | 3000 |

## Next steps by role (Day 1)

- **Everyone:** finish `CONTRACTS.md` + `rules.yaml` together, then branch off `main`.
- **P1:** improve `IntakeAgent` prompt + output schema; build 10 photo/description test pairs.
- **P2:** make `TriageAgent` read `rules.yaml`; draft the guardrail `after_model_callback`.
- **P3:** finalise `schema.sql` with P4; write `backend/seed/seed_core.py`; init the frontend; Report Defect screen.
- **P4:** write `backend/seed/seed_history.py` + embeddings; SDP console skeleton (KPI cards, defect list).

## Troubleshooting

| Problem | Fix |
|---|---|
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `adk` / `uvicorn` not found | Venv not activated |
| Port already in use | Another server is running; change `--port` |
| `unable to open database file` | Run from the repo or `backend/` folder; `DB_PATH` is relative to repo root |
| Gemini `429` | Free-tier rate limit; wait a minute or use a backup key |
