import type { CaseStatus } from "./types";

type Tone = "gray" | "blue" | "amber" | "green" | "red" | "purple";

export const STATUS_META: Record<CaseStatus, { label: string; buyer: string; tone: Tone }> = {
  SUBMITTED: { label: "Submitted", buyer: "Received", tone: "gray" },
  INFO_NEEDED: { label: "Info needed", buyer: "Action needed", tone: "amber" },
  ASSIGNED: { label: "Assigned", buyer: "Technician assigned", tone: "blue" },
  VISIT_SCHEDULED: { label: "Visit scheduled", buyer: "Inspection booked", tone: "blue" },
  VALID: { label: "Valid", buyer: "Book your repair", tone: "amber" },
  INVALID: { label: "Invalid", buyer: "Not a defect", tone: "gray" },
  REPAIR_BOOKED: { label: "Repair booked", buyer: "Repair booked", tone: "blue" },
  REPAIRED: { label: "Repaired", buyer: "Repaired", tone: "blue" },
  PENDING_SIGNOFF: { label: "Pending sign-off", buyer: "Check & sign off", tone: "amber" },
  CLOSED: { label: "Closed", buyer: "Closed", tone: "green" },
  REOPENED: { label: "Reopened", buyer: "Reopened", tone: "red" },
  ESCALATION_PENDING: { label: "Escalation pending", buyer: "Under review", tone: "purple" },
  EXTRA_INSPECTION: { label: "Extra inspection", buyer: "Detailed inspection", tone: "purple" },
};

export const TONE_CLASS: Record<Tone, string> = {
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
};

export const OPEN_STATUSES: CaseStatus[] = [
  "SUBMITTED", "INFO_NEEDED", "ASSIGNED", "VISIT_SCHEDULED", "VALID", "REPAIR_BOOKED", "REPAIRED",
  "PENDING_SIGNOFF", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION",
];

export const isOpen = (s: CaseStatus) => OPEN_STATUSES.includes(s);

/** Buyer-facing progress steps (like the "Construction Progress" list in the SDP app). */
export const BUYER_STEPS = ["Reported", "Inspection", "Repair booked", "Repaired", "Signed off"] as const;

export function buyerStepIndex(s: CaseStatus): number {
  switch (s) {
    case "SUBMITTED":
    case "INFO_NEEDED":
      return 0;
    case "ASSIGNED":
    case "VISIT_SCHEDULED":
    case "REOPENED":
    case "ESCALATION_PENDING":
    case "EXTRA_INSPECTION":
      return 1;
    case "VALID":
    case "INVALID":
      return 2;
    case "REPAIR_BOOKED":
      return 3;
    case "REPAIRED":
    case "PENDING_SIGNOFF":
      return 4;
    case "CLOSED":
      return 5;
  }
}

/** Plain-language explanation of each status for the buyer. */
export const BUYER_EXPLAIN: Record<CaseStatus, string> = {
  SUBMITTED: "We've received your report and our assistant is reviewing it.",
  INFO_NEEDED: "We need a little more information before we can assign a technician.",
  ASSIGNED: "A technician with the right skills has been assigned to your case.",
  VISIT_SCHEDULED: "A technician will visit to inspect the defect at the booked time.",
  VALID: "The technician confirmed the defect. Please book a repair slot.",
  INVALID: "The technician assessed this as not a defect. This case is closed; submit a new report if the problem changes.",
  REPAIR_BOOKED: "Your repair is booked. The technician will fix the defect at the booked time.",
  REPAIRED: "The technician has marked the repair as done. Your sign-off checklist is being prepared.",
  PENDING_SIGNOFF: "Please check the repair using the checklist and sign off. The developer also signs off; the case closes when both have signed.",
  CLOSED: "You and the developer have both signed off. You can reopen within the grace period if the problem returns.",
  REOPENED: "You reopened this case with a new photo. We're deciding the next step.",
  ESCALATION_PENDING: "This problem has come back, so our team is reviewing whether a more detailed inspection is needed.",
  EXTRA_INSPECTION: "A detailed inspection has been approved and scheduled to find the root cause.",
};

/** Buyer "My Defects" tabs. */
export const BUYER_TABS = [
  { id: "all", label: "All", statuses: null },
  { id: "open", label: "Open", statuses: ["SUBMITTED", "INFO_NEEDED", "ASSIGNED", "VISIT_SCHEDULED"] },
  { id: "ongoing", label: "Ongoing", statuses: ["VALID", "REPAIR_BOOKED", "REPAIRED", "PENDING_SIGNOFF", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION"] },
  { id: "closed", label: "Closed", statuses: ["CLOSED", "INVALID"] },
  { id: "previous", label: "Previous", statuses: null },
] as const satisfies readonly { id: string; label: string; statuses: readonly CaseStatus[] | null }[];

/** Statuses where the buyer has something to do. */
export const BUYER_ACTION: CaseStatus[] = ["INFO_NEEDED", "VALID", "PENDING_SIGNOFF"];

/** True when the buyer has a step to take (answer, book, or sign off). */
export const buyerNeedsAction = (c: { status: CaseStatus; signoff?: { buyer?: unknown } }) =>
  BUYER_ACTION.includes(c.status) && !(c.status === "PENDING_SIGNOFF" && c.signoff?.buyer);

/** What each status means for the assigned technician. */
export const TECH_EXPLAIN: Record<CaseStatus, string> = {
  SUBMITTED: "New report; the AI agents are still processing it.",
  INFO_NEEDED: "Waiting for the buyer to answer a follow-up question.",
  ASSIGNED: "Assigned to you; the visit is being scheduled.",
  VISIT_SCHEDULED: "Inspect on site, then mark the defect Valid or Invalid.",
  VALID: "You confirmed the defect. Waiting for the buyer to book a repair slot.",
  INVALID: "You marked this as not a defect. The case is closed.",
  REPAIR_BOOKED: "Repair booked. Fix the defect, then Mark Repaired with a note and photo.",
  REPAIRED: "Repair recorded. The VerificationAgent is preparing the buyer's checklist.",
  PENDING_SIGNOFF: "Waiting for the buyer and the developer to sign off your repair.",
  CLOSED: "Both parties signed off. The case is closed.",
  REOPENED: "The buyer reported the problem again. The RecurrenceAgent is checking the history.",
  ESCALATION_PENDING: "The problem keeps coming back. SDP staff are deciding on an extra inspection.",
  EXTRA_INSPECTION: "Detailed inspection approved. Use the AI inspection brief and checklist on site.",
};

/** Technician "My Jobs" tabs. */
export const TECH_TABS = [
  { id: "todo", label: "To do", statuses: ["VISIT_SCHEDULED", "EXTRA_INSPECTION", "REPAIR_BOOKED"] },
  { id: "inspection", label: "Inspection", statuses: ["VISIT_SCHEDULED", "EXTRA_INSPECTION"] },
  { id: "repair", label: "Repair", statuses: ["REPAIR_BOOKED"] },
  { id: "waiting", label: "Waiting", statuses: ["ASSIGNED", "VALID", "REPAIRED", "PENDING_SIGNOFF", "REOPENED", "ESCALATION_PENDING"] },
  { id: "completed", label: "Completed", statuses: ["CLOSED", "INVALID"] },
  { id: "history", label: "History", statuses: null },
] as const satisfies readonly { id: string; label: string; statuses: readonly CaseStatus[] | null }[];

/** Statuses where the technician has to act. */
export const TECH_TODO: CaseStatus[] = ["VISIT_SCHEDULED", "EXTRA_INSPECTION", "REPAIR_BOOKED"];
