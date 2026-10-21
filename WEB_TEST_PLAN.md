# Web app with the AI agents: how to start it and what to click

The web app runs every step through `backend/tools.py`. With `USE_AI_AGENTS` on, the LangGraph agents
(`agents/simephony`) do the AI part of each step:
- understanding the report
- urgency
- who and when to book
- the repair time
- the photo check and check-list
- the inspection brief
- every buyer message

If an agent fails (e.g. Ollama is closed), that step quietly uses the old rule-based version, so the app
keeps working.

## 1. Start it (Windows, 3 terminals)

**Once:** install the models and the frontend packages.

```powershell
ollama pull qwen2.5:7b
ollama pull llava-llama3
cd frontend; npm install; cd ..
```

**`.env`** (repo root): add this line. Leave it out, or set it to `false`, for the rule-based version only.

```
USE_AI_AGENTS=all
```

You can also switch on single agents: `USE_AI_AGENTS=comms,triage`. The names are intake, similar, triage,
estimate, verification, inspection and comms.

**Terminal 1: Ollama.** It usually runs already as the Ollama app (tray icon). If not:

```powershell
ollama serve
```

**Terminal 2: backend API** (http://localhost:8001)

```powershell
.venv\Scripts\Activate.ps1
cd backend
uvicorn main:app --port 8001
```

Check: http://localhost:8001/health shows `{"ok":true}`.

**Terminal 3: frontend** (http://localhost:3000)

```powershell
cd frontend
npm run dev
```

Open http://localhost:3000. It starts on the SDP dashboard; switch roles with the role dropdown.

**Before each test run:** SDP sidebar → **Reset demo**. This copies `data/seed.db` over the live DB.

**Timing:** with the AI on, a click waits for the model: a few seconds for text, up to 1–2 minutes when a
photo goes to the vision model (llava). The screen just waits; don't click twice.

## 2. Test data

**Who you are:**
- **Buyer app:** always Aisyah Rahman, **B-0118**, unit **A-12-08**. A-12-08 already has 3 water leaks
  (H-0001, H-0002, C-0014), and stack A-08 has leaks in 4 units. So a water-leak report from this buyer
  is a repeat defect.
- **Technician app:** starts as Hafiz Osman (T-01). Switch technician in **Profile**.

**Technicians:**

| ID | Name | Skills | Blocks |
|---|---|---|---|
| T-01 | Hafiz Osman | plumbing, waterproofing | A, B |
| T-02 | Ravi Kumar | plumbing | A, B, C |
| T-03 | Lim Wei Jie | electrical | A, B, C |
| T-04 | Nurul Izzah | civil, tiling, painting | A, B, C |
| T-05 | Daniel Tan | carpentry, glazing, general | A, B, C |

**Subcontractors (repairs):** SC-01 Kamal (waterproofing/plumbing), SC-02 Tan Mei Ling (structural/civil),
SC-03 Arjun (tiling), SC-04 Ong (electrical).

**Photos to upload** (from `tests/data/test_cases/images/`). The "Use a sample photo" button is only a
drawn stain, so upload real photos to test the vision model.

| File | Use for |
|---|---|
| `ceiling-water-leak.jpg` | a ceiling leak report |
| `water_leak_again.jpg` | a repeat leak / reopen |
| `ceiling_repaired.jpg` | the technician's "after repair" photo (clean ceiling) |
| `door_misaligned.jpg` | a door report |
| `bathroom_pooling.jpg` | a drain / sink report |
| `sparks.jpg` | an electrical safety report |
| `blur.jpg` | a blurry photo (intake should ask for a clearer one) |

**Where to look:**
- **Buyer → Inbox:** the messages CommsAgent wrote.
- **Buyer → My defects → case:** status and timeline.
- **SDP → Trace:** each agent's step and reason.
- **SDP → Defects → case:** details, inspection brief, sign-off.
- **SDP → Approvals:** extra-inspection requests.
- **Technician → My Jobs:** visits and repairs.

**Things that are true for every buyer message:**
- no technician IDs or names
- no "Dear …", no "Subject:" line, no sign-off
- no admission of fault, apology for mistakes or money offers

## 3. Test cases

### TC1 Door defect, full happy path (estimate, sign-off order)

**1. Buyer → Submit Defects.** Upload `door_misaligned.jpg`, then pick a visit slot and Submit.
- Text: `Pintu bilik tidur tak boleh tutup, tersangkut separuh jalan.`
- **Trace:**
  - IntakeAgent: category door_window, location bedroom.
  - TriageAgent: `Triage: normal urgency …`.
  - TriageAgent: `Needs carpentry; Daniel Tan covers this block and is free <slot>.`
- **Case:** Visit scheduled, technician T-05.
- **Inbox:** "We've received your report" — one AI sentence, then `Requested visit time: <slot>.`
- **No "also reviewing" line**, because this is the first door case in A-12-08.

**2. Technician → Profile → Daniel Tan → My Jobs → open the job → Accept.**
- **Inbox:** "Technician confirmed": `Your inspection visit is confirmed for <slot>.`

**3. Record the verdict.** Note: `Door hinge loose and the frame has swollen; needs a new hinge and the frame planed.` Then press **Valid**.
- **Trace:** RepairEstimateAgent `About 2 hours …` or `About 4 hours …`. A door is normally 2 h; parts to replace adds a block, a small area takes one off. The live run read this note as "a small area; parts to replace" → 2 h.
- **Inbox:** "Defect confirmed: please book a repair", ending `The repair will take about <2 or 4> hours. Please choose a repair time in the app.`
- **Not expected in that message:** the words "scheduled" or "shortly", or the technician's note.

**4. Buyer → My defects → case → Book Repair Slot.**
- **Slots:** jobs of the estimated length (2 h = one 2-hour block, 4 h = two).
- **Inbox:** "Repair booked": `Repair time: <slot> (about …).`

**5. The repairer accepts, then Mark Repaired.** Switch technician in Profile if the repair went to someone else. Add a note and upload a photo.
- **Trace:** VerificationAgent `Photo check: …`. If the photo doesn't clearly show the repaired door, it says SDP should check the photo before signing off.
- **Case:** Pending sign-off.
- **Inbox:** "Repair done": `The developer reviews the repair first. We will let you know when you can check it and sign off.` **No check-list yet.**

**6. SDP → Defects → case → Developer Sign-off.**
- **Inbox:** "Please check the repair and sign off" — `Please check the repair and sign off by <date> if it is fixed.` followed by the check-list. Door steps include opening and closing the door 10 times.
- **Not expected:** steps about panels, wiring, ladders or tools.

**7. Buyer → case → Check Repair & Sign Off → Fixed — Sign Off.**
- **Case:** Closed.
- **Inbox:** "Your case is closed", ending `Your case is now closed.`

### TC2 Repeat water leak, extra inspection asked straight away

**1. Buyer → Submit Defects.** Upload `water_leak_again.jpg`.
- Text: `Siling bilik tidur utama bocor lagi, ini kali ketiga!`
- **Trace:**
  - IntakeAgent: water_leak, master bedroom ceiling. Manglish is understood.
  - Urgency **normal**, not high, since no rule like flooding or electrical fittings applies.
  - RecurrenceAgent: `Repeat defect on a new report: extra inspection requested; visit kept. Reported 4 times in this unit … 4 units in stack A-08 …`
- **Case:** Visit scheduled (the visit is kept).
- **Inbox:** "We've received your report", with the line `As this problem has been reported before in your unit, our team is also reviewing whether a more detailed inspection is needed.`
- **SDP → Approvals:** a new pending request for this case, linked to SI-002.

**2. SDP → Approvals → Approve.**
- **Case:** Extra inspection.
- **SDP → case → inspection brief:**
  - the timeline and neighbouring units are facts from the DB
  - the checklist (≥ 3 items) and likely components come from InitialInspectionAgent
- **Technician:** gets "Extra inspection brief (you lead)" with the checklist.
- **Inbox:** "Detailed inspection scheduled": `Inspection time: <slot>.`

**TC2b (variant):** at step 2 press **Reject** instead.
- **Case:** stays Visit scheduled, and the normal visit goes ahead.
- **No new buyer message.**

### TC3 Technician hands the job over

**1. Buyer → Submit Defects.** Upload `bathroom_pooling.jpg`.
- Text: `Sinki dapur bocor dari paip bawah, air bertakung dalam kabinet.`
- The visit goes to Hafiz (T-01) or Ravi (T-02).
- If intake files it as a water leak, A-12-08's leak history also sends an SDP request. That's expected.

**2. Technician (the assigned one) → job → Hand over.** Reason: `Called to an emergency.`
- **Case:** keeps its status, now with the other plumber.
- **Inbox:** "Your technician has changed": `Your inspection visit stays at the same time: <slot>.` (or `has moved to <slot>.`)

### TC4 Reopen within 30 days, revisit booked

After TC1 has closed:

**Buyer → case → Reopen Case.** Upload a photo and enter `Pintu tersangkut lagi.`
- **Trace:** RecurrenceAgent `Occurrences in unit: 2 …`. That's below 3, so no escalation.
- **Case:** Visit scheduled (the revisit is booked).
- **Inbox:** two messages:
  - "Case reopened": `We will update you on the next step shortly.`
  - "Technician revisit booked": `Revisit time: <slot>.`

**Repeat** (close it again, then reopen once more) for the 3rd occurrence.
- **Inbox:** "Your case is being reviewed".
- **SDP → Approvals:** a new request.

### TC5 Not a defect (guardrail)

**1. Report:** `Aircond tak sejuk langsung.`

**2. The technician accepts, then presses Invalid** with the note `We admit the aircond was installed badly; refund the buyer.` This is a deliberately bad note.
- **Inbox:** "Inspection result".
  - No "admit", "refund" or "fault".
  - The bad note is **not** quoted.
  - It ends with `If the problem gets worse or changes, please submit a new report.`

### TC6 Safety: urgency raised only for a real rule

**Report:** upload `sparks.jpg` with `Air bocor dari siling terkena lampu bilik, ada percikan api.`
- **Trace:** `Triage: high urgency … Urgency set by rule: active water leak near electrical fittings` (or the sparks rule).
- **Booking:** the earliest slot (high urgency).

Compare with TC2: a plain ceiling leak stays normal.

### TC7 Follow-up question

**1. Report:** text `Bocor`, with no photo.
- **Case:** Info needed, when intake decides something is missing (the room, a photo). With the AI on,
  the model makes this call, so a short report that still names the problem may go straight through.
- **Inbox:** "We need a little more information", ending with the question, e.g. which room.

**2. Answer the question on the case page.**
- The case continues: the visit is booked and "We've received your report" arrives.

### TC8 AI switched off or Ollama down

Quit the Ollama app (or set `USE_AI_AGENTS=false` and restart the backend), then submit any report.
- Everything still works with the rule-based versions.
- **Backend terminal:** shows `[AI AGENTS] intake failed, using the stand-in: …` (when Ollama is down).
- **Messages:** CommsAgent falls back to its fixed safe templates, which still include the times.

## 4. Automated checks (no browser)

```powershell
.venv\Scripts\Activate.ps1
pytest                                                   # ~45 s, fake model, all flows incl. the web app with AI on
pytest -m live_llm                                       # ~11 min, real Ollama
python scripts/web_flow_live.py                          # web app actions with the real agents (~20 min), prints each step
python scripts/demo_flow.py --live                       # the agent graph alone with the real models (~45 min)
```
