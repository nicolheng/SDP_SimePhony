# Frontend

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui (Base UI) + Recharts. Styled after the Sime Darby Property app (red / dark headers).

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000 (editing)
npm run demo     # build + start, fast (demos)
```

It opens on the SDP dashboard. Switch roles with the **role dropdown** (SDP sidebar, or above the phone frame). No sign-in.

| Role | Route | Layout |
|---|---|---|
| Buyer | `/buyer` | Mobile (phone frame on desktop) |
| Technician | `/technician` | Mobile — shows only the signed-in technician's jobs (default Hafiz Osman; change in Profile) |
| SDP staff | `/sdp` | Desktop dashboard |

## Data: FastAPI + SQLite

The app needs the backend running. Start it first:

```powershell
# from the repo root, with the venv active
cd backend
uvicorn main:app --port 8001
```

- All screens read `GET /api/state` from FastAPI, which reads `data/simephony.db` (refreshed every 3 s and on tab focus).
- Every action (report, verdict, repair booking, mark repaired, sign-off, reopen, approvals, demo controls) is a POST to
  `backend/demo_api/routes.py`; the backend runs the rules + agent stand-ins (`backend/demo_api/agents.py`, `workflow.py`),
  writes the database, and returns the fresh state.
- Photos are saved to `uploads/` and served at `http://localhost:8001/uploads/...`.
- **Reset demo** copies `data/seed.db` over `data/simephony.db`.
- Backend URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8001`).
- If the backend is down, the screens show the built-in demo data (`src/lib/seed.ts`) read-only and the SDP sidebar says
  "Backend offline".

## Demo script (≈3 min)

1. **Buyer** → Submit Defects → *Use a sample photo* → pick the BM example "Siling bilik utama bocor lagi…" → pick a slot → Submit. Watch Intake → SimilarDefect → Triage run; it links 2 earlier leaks.
2. **Technician** (Hafiz) → My Jobs → open the job → *Fill example note* → **Valid**.
3. **Buyer** → My defects → case → **Book Repair Slot**.
4. **Technician** → repair job → note + sample photo → **Mark Repaired**.
5. **Buyer** → **Check Repair & Sign Off** (case-specific checklist) → **Fixed — Sign Off**. **SDP** → case → **Developer Sign-off** → case closes.
6. **SDP** sidebar → **Skip 2 weeks**. **Buyer** → case → **Reopen Case** with a new photo.
7. RecurrenceAgent escalates (3rd occurrence + stack cluster). **SDP → Approvals** → **Approve**.
8. InitialInspectionAgent writes the brief (technician job + SDP case). **SDP → Analytics** heatmap shows stack A-08 lit up; **Simulate rain** adds more reports.

## Where things live

```
src/app/page.tsx              redirects to /sdp
src/app/buyer/...             home, report, cases/[id] (+ book, verify, reopen), inbox
src/app/technician/...        home, jobs (+[id]), inbox, profile
src/app/sdp/...               overview, defects (+[id]), analytics, approvals, systemic, trace
src/components/               shared UI (mobile shell, slot picker, photos, timeline, charts, heatmap)
src/lib/                      types, constants (mirror rules.yaml), mock data/agents/api/store
```

For demos run `npm run demo` (production build, much faster than `npm run dev`).
