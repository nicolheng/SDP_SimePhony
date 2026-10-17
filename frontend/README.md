# Frontend

Next.js 16 (App Router) + Tailwind v4 + shadcn/ui (Base UI) + Recharts. Styled after the Sime Darby Property app (red / dark headers).

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

Open `/` and pick a role. No sign-in.

| Role | Route | Layout |
|---|---|---|
| Buyer | `/buyer` | Mobile (phone frame on desktop) |
| Technician | `/technician` | Mobile |
| SDP staff | `/sdp` | Desktop dashboard |

## Data: mock for now

There is no backend yet, so everything runs on a **mock layer** in the browser:

- `src/lib/seed.ts`: 18 months of noisy history + the planted A-12-08 / stack A-08 leak story.
- `src/lib/agents.ts`: rule-based stand-ins for the ADK agents (Intake, SimilarDefect, Triage, Comms, Verification, Recurrence, InitialInspection).
- `src/lib/api.ts`: one function per action (`submitReport`, `recordVerdict`, `bookRepair`, `markRepaired`, `submitVerification`, `reopenCase`, `decideApproval`, demo controls). **Swap these bodies for `fetch()` calls to FastAPI** when P3/P4 ship endpoints; the pages don't need to change.
- `src/lib/store.ts`: state in `localStorage`, synced across tabs. Open the buyer view and the SDP console in two tabs to watch them update live.

Reset any time with **Reset demo** (home page footer or the SDP sidebar).

## Demo script (≈3 min)

1. **Buyer** → Submit Defects → *Use a sample photo* → pick the BM example "Siling bilik utama bocor lagi…" → pick a slot → Submit. Watch Intake → SimilarDefect → Triage run; it links 2 earlier leaks.
2. **Technician** → open the job → *Fill example note* → **Valid**.
3. **Buyer** → My defects → case → **Book Repair Slot**.
4. **Technician** → repair job → note + sample photo → **Mark Repaired**.
5. **Buyer** → **Verify Repair** (case-specific checklist) → **Fixed** → case closes.
6. **SDP** sidebar → **Skip 2 weeks**. **Buyer** → case → **Reopen Case** with a new photo.
7. RecurrenceAgent escalates (3rd occurrence + stack cluster). **SDP → Approvals** → **Approve**.
8. InitialInspectionAgent writes the brief (technician job + SDP case). **SDP → Analytics** heatmap shows stack A-08 lit up; **Simulate rain** adds more reports.

## Where things live

```
src/app/page.tsx              role picker
src/app/buyer/...             home, report, cases/[id] (+ book, verify, reopen), inbox
src/app/technician/...        jobs, done, jobs/[id]
src/app/sdp/...               overview, defects (+[id]), analytics, approvals, systemic, trace
src/components/               shared UI (mobile shell, slot picker, photos, timeline, charts, heatmap)
src/lib/                      types, constants (mirror rules.yaml), mock data/agents/api/store
```

Note: with `cacheComponents` on, client components that read the URL (`useParams`, `usePathname`) must sit inside `<Suspense>` — see the `[id]/page.tsx` wrappers.
