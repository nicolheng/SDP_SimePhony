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
  PENDING_VERIFICATION: { label: "Pending verification", buyer: "Please verify", tone: "amber" },
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
  "PENDING_VERIFICATION", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION",
];

export const isOpen = (s: CaseStatus) => OPEN_STATUSES.includes(s);

/** Buyer-facing progress steps (like the "Construction Progress" list in the SDP app). */
export const BUYER_STEPS = ["Reported", "Inspection", "Repair booked", "Repaired", "Verified"] as const;

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
    case "PENDING_VERIFICATION":
      return 4;
    case "CLOSED":
      return 5;
  }
}
