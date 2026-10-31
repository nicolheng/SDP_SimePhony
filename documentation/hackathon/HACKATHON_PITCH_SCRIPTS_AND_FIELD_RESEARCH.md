# SimePhony Hackathon Pitch Scripts and Field Research

Presentation scripts and an evidence-led interview plan for validating the operational and commercial assumptions behind SimePhony.

## 2-minute pitch

### 1. The Problem

“A defect report is more than a form. Someone has to understand the complaint, decide its urgency, find the right technician, coordinate a visit, verify the repair, and keep the resident informed. When those steps depend on manual handoffs and scattered records, residents wait, staff repeat work, and recurring defects can be difficult to spot.”

### 2. Our Solution

“SimePhony is an AI-agent-assisted defect workflow for residents, technicians, and SDP staff. A resident submits a description and photo; specialist agents help classify, assess recurrence, and support routing. The system keeps the operational record in a database and gives each role a view of the case journey.”

### 3. The Wow Factors

“Three things make this more than a chatbot:

1. **Responsive, asynchronous work:** the request saves first; agents run after the database transaction, so an LLM call doesn’t hold the write lock. The initial workflow result can appear before the background agent trace arrives.
2. **Governable AI:** structured outputs are validated, failures can fall back to deterministic rules, and uncertain or rule-conflicting decisions can be flagged for human review. Agent events carry model, timing, token usage when provided, confidence, fallback, and guardrail metadata.
3. **Operational readiness:** startup warms configured AI services, the health endpoint reports component status, and the weekly digest computes its figures in code before an LLM writes the narrative. Temporary browser-photo files are cleaned up after vision processing.”

### 4. Live Demo Flow

“I’ll submit a defect as a resident, then switch to the SDP Agent Trace. Watch the provisional event arrive without waiting for the model; a later event shows the agent’s result and telemetry. I’ll follow the case into technician acceptance, inspection, repair, and sign-off to show the workflow end to end. I’ll also show the health indicator and the weekly digest endpoint. Finally, I’ll show how an uncertain decision is recorded as `PENDING_REVIEW` rather than silently treated as certain.”

“SimePhony doesn’t ask AI to replace accountability. It uses AI to help move work forward, and makes uncertainty and evidence visible to the people responsible for the outcome.”

## 5-minute pitch

### 1. The Problem

“A resident reporting a defect starts a chain of work: interpret the report, decide what kind of issue it is, assess urgency, find an appropriate technician, agree a visit, record what was found, book the repair, verify the result, and keep the resident informed.

Each handoff is an opportunity for delay or lost context. A resident may not know whether anyone is acting. Staff may have to reconstruct the history from separate updates. And if the same symptom recurs across units, looking at one case at a time can hide a building-level pattern.

We are not assuming every organization handles those steps the same way. We want to validate the current Command & Contact Centre workflow and its systems with the people who operate them. SimePhony is a working prototype for testing whether an agent-assisted, auditable workflow can reduce friction without taking decisions away from staff.”

### 2. Our Solution

“SimePhony connects the resident, technician, and SDP views to one case lifecycle. A resident can send a description and photo and choose a visit time. Agents support intake, recurrence analysis, triage, repair estimation, verification guidance, and communication. Deterministic business rules remain in the application for routing and guardrails.

The important architecture choice is that an API action commits the user’s change before background agent work runs on its own database connection. The request can return promptly; the UI can show the saved case and provisional event while agent results arrive later. The UI refreshes shared state every three seconds, so open role views can pick up those later events.”

### 3. The Wow Factors

“First, **the application stays responsive while AI works**. We don’t hold a database write lock across a long model call. The event trail can show the initial rule-based action followed by a later agent completion, making the progression observable.

Second, **the system can say ‘I’m not sure.’** Structured output validation rejects malformed or out-of-range responses; retries and rule-based fallback keep the workflow from trusting invalid output. Confidence thresholds and disagreement with guardrails can route a case to `PENDING_REVIEW`. We also record model, duration, available token counts, confidence, fallback, and guardrail hits with agent events. This gives SDP a basis for reviewing decisions rather than just seeing a generated answer.

Third, **the prototype is built for operational scrutiny**. A health endpoint checks database, Ollama, embedder, and agent mode. Weekly digest metrics are calculated by Python; the language model only writes the narrative. The schema is consolidated, common query indexes are applied, and temporary image files used by the vision bridge are deleted after processing.”

### 4. Live Demo Flow

1. “I’ll start in the **Buyer** app and submit a report with a photo, description, and visit slot.”
2. “Before the AI result is ready, I’ll switch to **SDP → Agent trace**. Look for the provisional event first. Then, after a short wait or refresh interval, look for the appended agent event and its telemetry. This demonstrates that the request has returned while background work continues.”
3. “I’ll open the case and move through technician acceptance and inspection, record a verdict, book the repair, mark it repaired, then complete developer and buyer sign-off. The case history shows how evidence and status accumulate through the lifecycle.”
4. “I’ll show `/health` and the sidebar indicator. If time permits, I’ll stop Ollama briefly and show that the health endpoint still responds but reports a degraded state.”
5. “I’ll open `/api/analytics/weekly-digest` to show the management narrative produced from code-computed statistics.”
6. “For abstention, I’ll show a low-confidence or guardrail-conflict case in `PENDING_REVIEW` and its `case.review_requested` event. That demonstrates safe routing. On the SDP Approvals page the held case shows the agent's reason and confidence; staff approve it to let the case carry on, or reject it with a reason the buyer sees.”

“The outcome we’re aiming for is practical: faster coordination, clearer accountability, and better visibility into repeat defects—with people retaining control wherever the AI is uncertain.”

## Field research: questions to validate before claiming operational impact

These are interview and data questions, not established facts about SDP. Do not present an estimate, current system name, or contract interpretation as verified until an owner confirms it.

### 1. Command & Contact Centre: current defect journey and systems

- **Ask:** “Walk me through the last defect report you handled, from first contact to closure. Which role touched it at each step?”
- **Ask:** “Which system is the system of record? Which tools are used for intake, dispatch, contractor communication, resident updates, evidence, and closure?”
- **Ask:** “What information must be re-entered or copied between systems? Where do photos, calls, and messages live?”
- **Verify with:** the current SOP or process map, a screen-share of the system(s), and 3–5 anonymized case records across different outcomes.
- **Record:** role, action, system, handoff, required fields, timestamp, and exception path for each stage.

### 2. Where cases get stuck

- **Ask:** “Which stage has the longest wait, the most follow-up, or the largest backlog? What does ‘stuck’ mean operationally?”
- **Ask:** “How do you distinguish time waiting for the resident, SDP, technician, contractor, parts, approval, or access?”
- **Verify with:** timestamps from a recent sample of cases, grouped by stage and outcome; compare median and 90th-percentile wait times rather than relying only on anecdotes.
- **Record:** a stage-by-stage delay breakdown, top exception reasons, and who can unblock each one.

### 3. Work volume, repeat visits, and the RM350 assumption

- **Clarify first:** “One handover phase” could mean a specific process stage, a contractor transition, or an entire defect lifecycle. Agree on the exact definition and period before calculating.
- **Ask:** “How many distinct cases and technician visits occur during that phase in a typical month? How many visits are repeat visits for the same case or underlying defect?”
- **Verify with:** case IDs and visit/job IDs from a representative period. Report separately:
  - distinct cases;
  - total visits;
  - repeat visits and repeat-visit share (state whether the denominator is visits or cases);
  - revisits caused by incomplete work, access issues, failed verification, recurrence, or a new defect.
- **Ask about RM350:** “Is RM350 an actual invoice rate, an average cost, a planning estimate, or a proposed charge? Does it include call-out, labour, transport, materials, tax, and overhead?”
- **Verify with:** contractor invoices, rate cards, purchase orders, and finance/procurement confirmation. Compare by trade, location, and job type before using one blended figure.
- **Do not claim savings** until the baseline and cost attribution are agreed with Finance and Operations.

### 4. Building-stack visibility

- **Ask:** “Do staff currently review defects by unit only, or do they also group by block, vertical stack, riser, floor, category, and time?”
- **Ask:** “Which patterns trigger an investigation today, and who decides whether nearby cases share a cause?”
- **Verify with:** an example of a known recurring issue and how it was detected, escalated, and resolved; inspect reports or dashboards used for that decision.
- **Record:** current aggregation dimensions, thresholds, false-alarm concerns, and the person accountable for confirming a suspected systemic issue.

### 5. SDP ownership, budget, and a shadow pilot

- **Ask:** “Which operational team owns defect intake and turnaround? Who owns the digital platform, AI/data governance, and contractor performance?”
- **Ask:** “Who can sponsor a pilot, approve access to data, and fund an ongoing service if it proves value?”
- **Pilot proposal to validate:** run in **shadow mode** on a narrow category or building. SimePhony recommends classifications, urgency, recurrence, and next actions; existing staff retain the actual decisions. Compare recommendations with staff outcomes without changing resident or contractor workflows.
- **Agree before starting:** pilot owner, sample size and duration, data protection/access rules, baseline metrics, review cadence, escalation process, success thresholds, and stop conditions.
- **Candidate measures:** time to first action, time waiting by stage, repeat-visit rate, rework/failed verification, staff minutes per case, recommendation acceptance/override rate, and rate of unsafe or incorrect recommendations.
- **Ask:** “What result would make you expand, revise, or stop the pilot?”

### 6. Back-charges and contractor scoring

- **Ask:** “Do current subcontract agreements explicitly allow back-charges? Under what documented conditions, notice, evidence, dispute, and appeal process?”
- **Ask:** “Are contractor scorecards already contractual, operational-only, or not used? Which measures are accepted and auditable?”
- **Verify with:** Procurement and Legal review of the applicable contract clauses and actual dispute history. Do not infer a right to back-charge from a technical defect record.
- **Ask contractors:** “What evidence would you consider fair? How should shared causes, resident access, parts delays, and disputed workmanship be handled?”
- **Pilot safely:** start with an internal, non-punitive quality dashboard. Separate factual measures (response time, revisit, verification outcome) from judgments, allow context and correction, and obtain Legal/Procurement approval before linking scores to payment, award, or back-charges.

## Suggested interview sequence

1. Command & Contact Centre supervisor or experienced case handler: map the workflow and bottlenecks.
2. SDP defect/quality operations owner: confirm decisions, escalation, recurrence practice, and pilot sponsorship.
3. Data/reporting owner: establish reliable case and visit denominators and timestamps.
4. Procurement/Finance/Legal: validate RM350 and contract mechanisms.
5. One or two subcontractors: test operational fairness, evidence expectations, and likely objections.

Close each interview by asking permission to use anonymized process facts, confirm the notes with the participant, and identify one person who can validate the next open question.
