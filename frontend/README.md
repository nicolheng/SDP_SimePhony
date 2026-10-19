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

## Data: mock for now

**Starting data comes from `data/seed.db`** (built by `backend/seed/seed_core.py` + `seed_history.py`). The route `src/app/api/seed/route.ts` reads it read-only with Node's built-in SQLite (`src/lib/seed-db.ts` maps it to the frontend types). If `seed.db` is missing, the app falls back to the built-in `src/lib/seed.ts`; the SDP sidebar shows which one is in use. After regenerating `seed.db`, press **Reset demo**.

Clicks during the demo still run in a **mock layer** in the browser (not written back to the database):

- `src/lib/seed.ts`: 18 months of noisy history + the planted A-12-08 / stack A-08 leak story.
- `src/lib/agents.ts`: rule-based stand-ins for the ADK agents (Intake, SimilarDefect, Triage, Comms, Verification, Recurrence, InitialInspection).
- `src/lib/api.ts`: one function per action (`submitReport`, `recordVerdict`, `bookRepair`, `markRepaired`, `submitVerification`, `reopenCase`, `decideApproval`, demo controls). **Swap these bodies for `fetch()` calls to FastAPI** when P3/P4 ship endpoints; the pages don't need to change.
- `src/lib/store.ts`: state in `localStorage`, synced across tabs. Open the buyer view and the SDP console in two tabs to watch them update live.

Reset any time with **Reset demo** in the SDP sidebar.

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
