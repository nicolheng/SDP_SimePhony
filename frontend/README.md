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
| Technician | `/technician` | Mobile — shows only the signed-in technician's jobs (default Olaf; switch to Kamal Yusof in Profile) |
| SDP staff | `/sdp` | Desktop dashboard |

## Data: FastAPI + SQLite

The app needs the backend running. Start it first:

```powershell
# from the repo root, with the venv active
cd backend
python main.py
```

- All screens read `GET /api/state` from FastAPI, which reads `data/simephony.db` (refreshed every 3 s and on tab focus).
- Business rules (grace/sign-off periods, thresholds, category labels, repair plan, slot times) are read once from
  `GET /api/rules`, which serves `rules.yaml`. 
- Every action (report, accept / hand over, verdict, mark repaired, sign-off, reopen, approvals, demo controls) is a POST to
  `backend/demo_api/routes.py`; the backend runs the rules + agent stand-ins (`backend/demo_api/agents.py`, `workflow.py`),
  writes the database, and returns the fresh state.
- Photos are saved to `uploads/` and served at `http://localhost:8001/uploads/...`.
- **Reset demo** copies `data/seed.db` over `data/simephony.db`.
- Backend URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8001`).
- If the backend is down, the screens show the built-in demo data (`src/lib/seed.ts`, with the rules snapshot) read-only and the SDP sidebar says
  "Backend offline".

## Demo script (≈3 min)

Tip: open **http://localhost:3000/split** to watch the buyer and technician phones side by side.

1. **Buyer** → Submit Defect → **Take Photo** or **Upload a Photo** → pick the example "Ceiling in master bedroom seems to be
   leaking" → **Submit Defect**. The buyer never picks a time: the earliest free qualified technician is booked.
   Watch Intake → SimilarDefect → Triage run; it links 2 earlier leaks. The buyer sees "A technician will be arranged soon".
   (Optional: **Add Another Defect** before submitting; each photo becomes its own case.)
2. **Technician** (Olaf, or whoever was booked) → My Jobs → open the job → **Accept** (the buyer now sees the technician
   and the time) → findings → **Expected repair duration** → **Valid**.
3. The repair is booked automatically at the first time a qualified worker is free. **Technician / subcontractor** →
   repair job → **Accept** → repair description + photo → **Mark Repaired**.
4. **SDP** → Approvals → **Sign-Offs** (or the case page) → **Approve repair**.
5. Once SDP has approved every defect in the unit, the buyer's home **Sign Off** button turns red. **Buyer** → **Sign Off**
   (opens My Defects → Pending) → each defect → **Verify Repair** (case-specific checklist) → **Fixed — Verify**.
   When every defect is verified, **Sign Off Unit** in My Defects turns red → **Sign Off**: every defect in the unit closes.
6. **Buyer** → case → **Reopen Case** with a new photo (within 30 days). It goes through the normal flow again, so the
   unit needs verifying and signing off again.
7. RecurrenceAgent escalates (3rd occurrence + stack cluster). **SDP → Approvals** → Extra Inspections → **Approve**.
8. InitialInspectionAgent writes the brief (technician job + SDP case). **SDP → Systemic Issues** heatmap shows stack
   A-08 lit up; **Simulate rain** adds more reports.

## Where things live

```
src/app/page.tsx              redirects to /sdp
src/app/buyer/...             home, report, cases/[id] (+ verify, reopen), inbox, manual, inspection-sheet, profile
src/app/technician/...        home, jobs (+[id]), inbox, manual, inspection-sheet, profile
src/app/sdp/...               overview (analytics + ratings tabs), approvals, defects (+[id]), systemic, trace
src/app/split/                buyer and technician phones side by side
src/components/               shared UI (mobile shell, photos + camera, timeline, chat, shared access, charts, heatmap)
src/lib/                      types, constants (mirror rules.yaml), mock data/agents/api/store
```

For demos run `npm run demo` (production build, much faster than `npm run dev`).
