# Manual Demo Checklist

Browser checklist for verifying the recent P0/P1 features before the hackathon presentation.

## Before the demo

- [ ] Start the backend on port `8001` and the frontend on port `3000`.
- [ ] Set `USE_AI_AGENTS=all` and confirm Ollama is running with the configured models.
- [ ] Open the Buyer app and SDP app in separate browser tabs. Keep DevTools' **Network** panel open if you want to inspect API responses.

## 1. Health indicator

- [ ] In the SDP sidebar, find **System health**. With the database, Ollama, and embedder available, expect a green dot.
- [ ] Stop the Ollama server and open `http://localhost:8001/health`. Expect HTTP 200, `"status": "degraded"`, and an Ollama check reporting that Ollama is not reachable.
- [ ] Return to the SDP sidebar and wait up to **30 seconds** for the next check. Expect a yellow dot. Hover over it to see which check failed.
- [ ] Restart Ollama and wait for the dot to return to green.

## 2. Telemetry and confidence

- [ ] With AI agents enabled and Ollama available, submit a report with a photo, description, and visit slot.
- [ ] Open `http://localhost:8001/api/state` and find an event for your case with `"type": "agent.step"`. Check its `telemetry` object for:
  - [ ] `model`: a non-empty model name
  - [ ] `timing_ms`: a positive number
  - [ ] `confidence_score`: a number from 0 to 1
  - [ ] `tokens`: an object with `input` and `output` counts, when the LLM response provides usage metadata
- [ ] Alternatively, inspect the `case_events` table in the configured SQLite database. Telemetry is stored in `payload.data`:

  ```sql
  SELECT case_id,
         json_extract(payload, '$.agent') AS agent,
         json_extract(payload, '$.data.model') AS model,
         json_extract(payload, '$.data.timing_ms') AS timing_ms,
         json_extract(payload, '$.data.tokens') AS tokens,
         json_extract(payload, '$.data.confidence_score') AS confidence_score
  FROM case_events
  WHERE type = 'agent.step'
  ORDER BY created_at DESC
  LIMIT 10;
  ```

- [ ] In the SDP app, open **Agent trace** and choose **Agent steps** to view the same activity.
- [ ] If `tokens` is `null`, the LLM response did not supply usage metadata. Model, timing, and confidence should still be populated.

## 3. Low-confidence human review

- [ ] Submit a deliberately ambiguous report with an unclear photo and vague description, such as “There's a mark here; I'm not sure what caused it.” Confidence is model-dependent; try another ambiguous example if necessary.
- [ ] Check `GET http://localhost:8001/api/state` for the case's `PENDING_REVIEW` status and a `case.review_requested` event containing the review reason and confidence.
- [ ] **Frontend limitation:** the current frontend does not provide an approval queue/action for confidence-review cases. The SDP **Approvals** page and `POST /api/approvals/{approval_id}/decision` are for extra-inspection requests, not low-confidence reviews.
- [ ] To demonstrate the implemented simulated review-and-continue flow, run `python scripts/web_flow_live.py`. It records the simulated SDP approval and continues routing. Do not use the extra-inspection approval button to represent confidence-review approval.

## 4. Background processing and responsiveness

- [ ] With Ollama running, open the Buyer report form and SDP **Agent trace** side by side.
- [ ] Submit a report. Confirm the browser returns to the submitted/processing view without waiting for the full LLM run.
- [ ] In **Agent trace**, look for the provisional rule-based `agent.step` first, followed by the background agent's completion event with model/timing telemetry. Allow one or two polling intervals for the later event.
- [ ] Confirm the case eventually reaches its routed status, such as `VISIT_SCHEDULED` or `PENDING_REVIEW`, and that the browser remains responsive while the agent is processing. The frontend polls state every **3 seconds**.
