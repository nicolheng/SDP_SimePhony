# Frontend

Next.js + shadcn/ui + Recharts. Not scaffolded yet — P3/P4 initialise on Day 1:

```bash
cd frontend
npx create-next-app@latest . --ts --tailwind --app --eslint --src-dir
npx shadcn@latest init
npm install recharts
```

Planned routes:

- `/buyer` — Report Defect, case tracker, repair booking, sign-off, reopen, outbox (P3)
- `/technician` — today's jobs, case detail, Valid/Invalid, Mark Fixed, inspection brief (P3)
- `/sdp` — KPI cards, defect list, analytics + stack heatmap, approval card, agent trace, demo controls (P4)

API base URL: `http://localhost:8000` (FastAPI).
