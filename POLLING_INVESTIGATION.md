# Polling Investigation

## Findings

- The frontend has one shared application-state poller in `frontend/src/lib/store.ts`.
- It refreshes `/api/state` every **3 seconds** while the browser tab is visible.
- It also refreshes on initial load and when the tab regains focus. An in-flight guard prevents overlapping refreshes in that tab.
- Case views read events and case data from the shared store; they do not start separate polling loops.
- Successful actions immediately adopt the state returned by their API response. AI tasks run after the request commits, so their later events need a subsequent state refresh to appear in other open tabs.
- The SDP sidebar health indicator uses a separate **30-second** check of `/health`.

## Recommendation

**Keep the 3-second state poll for the hackathon demo.** It makes background AI events visible quickly and supports updates across open roles and tabs. Changing to Server-Sent Events would add connection and reconnection behavior without a clear demo benefit. A longer interval may reduce load in production, but would make the demo's background updates feel slower.

No code change is recommended for the demo.

## Relevant implementation

- `frontend/src/lib/store.ts`: shared state refresh, visibility-aware 3-second interval, and focus refresh.
- `frontend/src/components/case-views.tsx`: case/event views consume shared state and do not add polling.
- `backend/demo_api/routes.py`: returns state for actions and schedules background agents after commit.
- `frontend/src/app/sdp/sidebar.tsx`: separate 30-second health-check interval.
