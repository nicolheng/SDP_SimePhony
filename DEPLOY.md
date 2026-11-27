# Deploying the hosted demo (free, until about 18 Nov 2026)

| Part | Where | Cost | Notes |
|---|---|---|---|
| Backend API (`backend/`) | [Render](https://render.com) free web service | Free, no card | Sleeps after 15 min with no visitors; the first visit after that waits about 1 min |
| Web app (`frontend/`) | [Vercel](https://vercel.com) Hobby | Free, no card | Always on |
| AI model | Google Gemini free key | Free | Shared by all visitors: about 500 calls a day per model. When it runs out, the rules take over (`USE_AI_AGENTS=true`) |

## How "everyone gets their own demo" works

`DEMO_SESSIONS=true` (set in `render.yaml`) turns it on:

- The web app makes a random id the first time a browser opens it, keeps it in that browser, and sends it with
  every call as the `X-Demo-Session` header.
- The backend copies `data/seed.db` to `data/sessions/<id>/simephony.db` on that visitor's first call and uses
  it for everything they do. Photos go to `uploads/<id>/`. **Reset demo** resets only that visitor's copy.
- The buyer, technician and SDP screens in one browser share the id, so they see each other's changes,
  as in the live demo. A different browser, device or private window gets its own fresh copy.
- Copies unused for 24 hours are deleted (`SESSION_TTL_HOURS`), and at most 300 are kept (`MAX_SESSIONS`).
- Render's free disk is wiped when the service sleeps or redeploys, so every copy starts again from
  `seed.db` after that. That is fine for a demo, but don't leave something half-done overnight and expect
  it to be there.
- In this mode, emails are never sent (forced off in code), the `/docs` API pages are hidden, and one
  address may make at most 40 changes a minute (`RATE_LIMIT_WRITES_PER_MIN`), so nobody can use up the
  shared AI quota by clicking fast.

Without `DEMO_SESSIONS`, nothing changes: one shared `data/simephony.db`, as on a laptop.

## Steps

### 0. Merge to `main`

`render.yaml` deploys the `main` branch. Merge the deploy branch first, or change `branch:` in `render.yaml`.

### 1. Gemini key

Get a free key at <https://aistudio.google.com/apikey>. Keep it out of git and chat.

### 2. Backend on Render

1. Sign in to Render with GitHub. Choose **New > Blueprint** and pick the `SDP_SimePhony` repo.
2. Render reads `render.yaml` and asks for the three values marked `sync: false`:
   - `LLM_API_KEY`: the Gemini key.
   - `API_BASE_URL`: `https://simephony-api.onrender.com` (the service's URL, shown after it is made. If the
     name is taken, Render adds a suffix; fix this later under **Environment**).
   - `CORS_ORIGINS`: leave as `https://example.com` for now; you set it in step 4.
3. Deploy. When it is done, open `https://<your-service>.onrender.com/health`. `"status": "healthy"` means
   the database and key are set (`embedder` says `disabled`, which is expected).

### 3. Web app on Vercel

1. Sign in to Vercel with GitHub. **Add New > Project**, import the repo.
2. **Root Directory**: `frontend`. Framework: Next.js (found by itself).
3. **Environment Variables**: `NEXT_PUBLIC_API_URL` = the Render URL from step 2, with no `/` at the end.
4. Deploy. Note the address, for example `https://sdp-simephony.vercel.app`.

### 4. Connect them

In Render, under **Environment**, set `CORS_ORIGINS` to the Vercel address from step 3 (no `/` at the end;
several addresses can be separated by commas) and save. Render redeploys by itself.

### 5. Check it

1. Open the Vercel address. Wait up to a minute if the backend was asleep.
2. In the buyer app, submit a report with a photo. The photo should show, and the AI progress should run.
3. Open the same address in a private window. That report should **not** be there (a separate demo).
4. In the SDP console, **Reset demo** should only reset your own window.

### Optional: stop it sleeping

A free monitor such as UptimeRobot can call `https://<your-service>.onrender.com/health` every 10 minutes.
It keeps demos alive and avoids the 1 min wait, and uses about 720 of Render's 750 free hours a month.

## Taking it down after 18 Nov

- Render: the service > **Settings > Delete Web Service**.
- Vercel: the project > **Settings > Delete Project**.
- Google AI Studio: delete the key that was used.

Nothing costs money if you forget, as neither account has a card, but the key should still be deleted.
