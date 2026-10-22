# 3. Flow

## Normal case: report to sign-off

```mermaid
flowchart TD
    A[Buyer reports defect<br/>photo + description + visit time] --> B[Intake Agent<br/>category, location, urgency]
    B -->|details missing| B2[Follow-up question to buyer] --> B
    B --> C[Similar Defect Agent<br/>links related past cases]
    C --> D[Triage Agent<br/>books a qualified technician]
    D --> E[Technician accepts visit<br/>or hands over to a colleague]
    E --> F{Inspection result}
    F -->|Invalid| X[Case ends<br/>buyer told why]
    F -->|Valid| G[Buyer books repair time]
    G --> H[Technician / subcontractor repairs<br/>and adds a photo + note]
    H --> I[Verification Agent<br/>sign-off checklist for the buyer]
    I --> J[SDP signs off the repair]
    J --> K[Buyer checks and signs off]
    K --> L[Closed]
```

Every step writes an event to the case timeline, and the **Comms Agent** sends the buyer an update in the app
and by email.

| Step | Status |
|---|---|
| Report submitted / details missing | `SUBMITTED` / `INFO_NEEDED` |
| Technician picked, then accepted | `ASSIGNED` → `VISIT_SCHEDULED` |
| Inspection result | `VALID` or `INVALID` (final) |
| Repair booked, then done | `REPAIR_BOOKED` → `REPAIRED` |
| Waiting for sign-off, then closed | `PENDING_SIGNOFF` → `CLOSED` |

**Sign-off rules:** SDP signs first, then the buyer has 14 days, with a reminder 3 days before the deadline.
If the buyer doesn't respond, the case closes automatically (high-urgency cases are flagged to SDP instead).

## Recurring defect: reopen and escalation

```mermaid
flowchart TD
    A[Problem comes back] --> B[Buyer reopens within 30 days<br/>with a new photo]
    B --> C[Recurrence Agent<br/>checks unit + stack history]
    C -->|below threshold| D[Triage Agent books a revisit]
    C -->|3rd occurrence or<br/>3+ units in the stack| E[Extra inspection request to SDP]
    E --> F{SDP staff decide}
    F -->|Reject| R[Repaired as a normal case]
    F -->|Approve| G[Initial Inspection Agent<br/>inspection brief]
    G --> H[Joint inspection<br/>in-house technician + specialist]
    H --> I[Root cause found and fixed<br/>same repair and sign-off steps]
```

| Step | Status |
|---|---|
| Buyer reopens | `REOPENED` |
| Waiting for SDP approval | `ESCALATION_PENDING` |
| Approved, brief attached | `EXTRA_INSPECTION` |

The escalation request is a recommendation: **SDP staff always make the decision.**
