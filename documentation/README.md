# SimePhony documentation

**"Don't just close the ticket. Close the problem."**

SimePhony is an AI-assisted defect management system for SDP property buyers, technicians and SDP staff.
Buyers report a defect with a photo; AI agents classify it, find related past defects, book a technician,
keep the buyer updated, guide the sign-off, and escalate recurring problems to SDP staff for a
human-approved extra inspection.

| Page | What it covers |
|---|---|
| [1. Purpose](01-purpose.md) | The problem and who it is for |
| [2. Solution](02-solution.md) | What SimePhony does, the agents, and the tech stack |
| [3. Flow](03-flow.md) | How a defect moves from report to sign-off, and how recurring defects escalate |

Hackathon working documents are in [`hackathon/`](hackathon/):

| Document | What it covers |
|---|---|
| [Demo manual checklist](hackathon/DEMO_MANUAL_CHECKLIST.md) | Step-by-step checks to run before and during the demo |
| [Pitch scripts and field research](hackathon/HACKATHON_PITCH_SCRIPTS_AND_FIELD_RESEARCH.md) | What to say in the pitch, and the research behind it |
| [Web test plan](hackathon/WEB_TEST_PLAN.md) | Test cases for the web app (`scripts/web_flow_live.py` runs some of them) |
| [Rule conflict proposal](hackathon/RULE_CONFLICT_PROPOSAL.md) | Proposal to stop holding cases for SDP review when the rules only correct the urgency |

For the detailed rules, see [`CONTRACTS.md`](../CONTRACTS.md) (statuses, tools, events) and
[`rules.yaml`](../rules.yaml) (business rules). To run the project, see the main [`README.md`](../README.md).
