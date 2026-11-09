// Shapes mirror CONTRACTS.md / backend/schema.sql so the mock layer can be swapped for FastAPI.

export type CaseStatus =
  | "SUBMITTED"
  | "INFO_NEEDED"
  | "PENDING_REVIEW"
  | "VISIT_SCHEDULED"
  | "VALID"
  | "INVALID"
  | "REPAIR_BOOKED"
  | "REPAIRED"
  | "PENDING_SIGNOFF"
  | "CLOSED"
  | "REOPENED"
  | "ESCALATION_PENDING"
  | "EXTRA_INSPECTION";

export type Category =
  | "water_leak"
  | "plumbing"
  | "drainage"
  | "sanitary_fittings"
  | "electrical"
  | "wall_crack"
  | "structural_crack"
  | "tiles"
  | "ceiling"
  | "door_window"
  | "paint"
  | "other";

export type Urgency = "high" | "normal" | "low";

export type AgentName =
  | "IntakeAgent"
  | "SimilarDefectAgent"
  | "TriageAgent"
  | "CommsAgent"
  | "VerificationAgent"
  | "RecurrenceAgent"
  | "InitialInspectionAgent";

export type EventType =
  | "case.created"
  | "case.info_needed"
  | "case.answered"
  | "case.assigned"
  | "booking.requested"
  | "booking.confirmed"
  | "booking.rejected"
  | "verdict.recorded"
  | "repair.booked"
  | "repair.done"
  | "repair.rejected"
  | "verification.requested"
  | "verification.completed"
  | "case.reopened"
  | "recurrence.detected"
  | "inspection.requested"
  | "inspection.approved"
  | "inspection.rejected"
  | "signoff.completed"
  | "signoff.reminder"
  | "signoff.overdue"
  | "feedback.submitted"
  | "case.closed"
  | "email.sent"
  | "case.review_requested"
  | "case.review_approved"
  | "case.review_rejected"
  | "agent.step";

export interface Unit {
  id: string; // A-12-08
  block: string;
  floor: number;
  stack: string; // "08"
  contractor: string;
  /** Vacant possession date (YYYY-MM-DD); the defect liability period runs from it. */
  vpDate?: string | null;
  /** Last day of the defect liability period (vacant possession + RULES.dlpMonths). */
  dlpExpiry?: string | null;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  skills: string[];
  blocks: string[];
  /** In-house technician (inspects + minor repairs) or subcontractor (specialised repairs under contract). */
  kind: "technician" | "subcontractor";
  company?: string;
}

export interface Photo {
  url: string | null; // data URL for uploads; null = placeholder
  kind: "original" | "reopen" | "verdict" | "repair" | "verification";
  at: string;
}

export interface SimilarRef {
  caseId: string;
  unitId: string;
  reason: string;
  at: string;
}

export interface VerificationGuide {
  intro: string;
  steps: string[];
  ifFails: string;
}

export interface InspectionBrief {
  generatedAt: string;
  timeline: { at: string; text: string }[];
  photoComparison: string;
  neighbouringUnits: { unitId: string; cases: number; last: string }[];
  likelyComponents: string[];
  checklist: string[];
}

export interface Case {
  id: string;
  unitId: string;
  buyerId: string;
  status: CaseStatus;
  category: Category;
  subCategory: string;
  location: string;
  summary: string;
  description: string;
  urgency: Urgency;
  /** Who the job is with now: the inspecting technician, then whoever was allocated the repair. */
  technicianId?: string;
  /** Technician who did the inspection visit (kept after the repair is reassigned). */
  inspectorId?: string;
  /** Subcontractor joining an approved extra inspection. */
  supportId?: string;
  /** Whether the assigned worker has accepted their current job (visit or repair); missing = accepted. */
  bookingStatus?: "pending" | "confirmed";
  /** The previous worker couldn't make it and handed the current job over. */
  handover?: { fromId: string; reason: string; at: string; previousSlot?: string };
  /** Estimated repair duration, set when the repair is booked. */
  repairHours?: number;
  /** Why repairHours was set; TECHNICIAN_ESTIMATE when the technician chose it at the inspection. */
  repairEstimateReason?: string | null;
  visitSlot?: string; // ISO start
  /** The inspection time the buyer picked when reporting (the booked visit can differ). */
  preferredVisitAt?: string;
  /** Every accept and every decline / hand-over (assignment_history). */
  assignments?: { technicianId: string; outcome: "ACCEPTED" | "REJECTED"; reason: string | null; at: string; job: string }[];
  repairSlot?: string;
  photos: Photo[];
  reopenCount: number;
  occurrence: number;
  similar: SimilarRef[];
  missingInfo: string[];
  followUpQuestion?: string;
  verdict?: { outcome: "VALID" | "INVALID"; note: string; at: string };
  repairNote?: string;
  /** VerificationAgent's check of the repair photo, for SDP's developer sign-off (null when the AI did not run). */
  photoCheck?: PhotoCheck | null;
  verificationGuide?: VerificationGuide;
  /** "verified" once the buyer checked it Fixed. It stays PENDING_SIGNOFF until the whole unit is signed off. */
  verificationStatus?: "pending" | "verified" | "not_verified" | null;
  verification?: { result: "FIXED" | "NOT_FIXED" | "CANNOT_VERIFY"; note: string; at: string };
  signoff?: { buyer?: { at: string; note: string }; developer?: { at: string; by: string } };
  /** Why an AI agent held the case for a person to check (PENDING_REVIEW only). */
  review?: { agent: string; reason: string; confidence: number | null; previousStatus: string; at: string | null };
  /** The 30-day repair clock: from the buyer's notice (report or latest reopen) to the repair. */
  repairClock?: { noticeAt: string; dueAt: string; doneAt: string | null };
  /** Buyer's satisfaction rating (1-5), asked after they sign off. */
  rating?: { stars: number; comment: string; at: string } | null;
  /** When the buyer must sign off by (pending sign-off only; computed by the backend). */
  signoffDeadline?: string;
  /** In-app sign-off reminder sent (3 days before the deadline). */
  signoffReminderAt?: string;
  /** Closed automatically because the buyer didn't sign off in time. */
  autoClosedAt?: string;
  /** High-urgency case past the sign-off deadline: flagged to SDP instead of auto-closing. */
  signoffOverdueAt?: string;
  repairedAt?: string;
  inspectionBrief?: InspectionBrief;
  triageReason?: string;
  createdAt: string;
  closedAt?: string;
  historical?: boolean;
}

export interface CaseEvent {
  id: number;
  caseId: string | null;
  type: EventType;
  at: string;
  agent?: AgentName;
  message: string;
  fallbackUsed?: boolean;
  fallbackStep?: string;
  fallbackReason?: string;
  telemetry?: {
    model: string | null;
    timing_ms: number;
    tokens: { input: number | null; output: number | null } | null;
    confidence_score: number | null;
    fallback_used: boolean;
    fallback_reason: string | null;
    guardrail_hits: string[];
    reasoning?: {
      matched_rule?: string | null;
      evidence?: string | null;
      related_cases?: { case_id: string; score: number | null; reason: string }[];
      cluster_reason?: string | null;
    } | null;
  };
}

export interface BuyerMessage {
  id: number;
  caseId: string;
  at: string;
  title: string;
  body: string;
}

export interface Email {
  id: number;
  caseId: string | null;
  to: string;
  subject: string;
  body: string;
  status: "sent" | "queued" | "logged, not sent";
  at: string;
}

export interface Approval {
  id: string;
  caseId: string;
  systemicIssueId: string;
  reasons: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string | null;
}

export interface SystemicIssue {
  id: string;
  title: string;
  category: Category;
  block: string;
  stack: string;
  relatedCases: string[];
  recurrenceCount: number;
  reopenedCount: number;
  confidence: number;
  detectedAt: string;
  status: "open" | "under_inspection" | "monitoring" | "resolved";
  approvalStatus: "pending" | "approved" | "rejected";
  recommendedAction: string;
}

export interface Booking {
  slot: string; // ISO start
  technicianId: string;
  caseId: string;
  kind: "visit" | "repair";
}

/** Buyer sign-off for one unit (#71): SDP approves every defect, the buyer checks each, then signs off once. */
export interface UnitSignoff {
  unitId: string;
  /** Every open defect is approved by SDP, so the buyer can tap Fixed / Not Fixed. */
  canVerify: boolean;
  /** Every open defect is approved and checked Fixed: the Sign off button can turn on. */
  ready: boolean;
  /** Case ids still blocking sign-off (waitingForDeveloper + waitingForBuyer). */
  waitingFor: string[];
  /** Waiting for SDP to approve the repair (or still being repaired). */
  waitingForDeveloper: string[];
  /** Approved, waiting for the buyer to check: the "Pending" tab. */
  waitingForBuyer: string[];
  /** Every open defect in the unit; the unit sign-off closes them together. */
  caseIds: string[];
  /** Sign off by this time (14 days from SDP's last approval), once canVerify; else null. */
  deadline: string | null;
}

export interface DemoState {
  version: number;
  /** Where the starting data came from. */
  source: "database" | "built-in";
  /** Technicians and subcontractors from the technicians table (database only). */
  workers?: (Technician & { company?: string | null })[];
  now: string; // demo clock
  cases: Case[];
  /** Keyed by unit id; only units with at least one defect. */
  unitSignoff?: Record<string, UnitSignoff>;
  events: CaseEvent[];
  messages: BuyerMessage[];
  outbox: Email[];
  approvals: Approval[];
  systemicIssues: SystemicIssue[];
  bookings: Booking[];
  seq: { case: number; event: number; si: number };
  /** Lookup data from the database (units, buyers) and rules.yaml / backend config. Absent in the offline fallback. */
  reference?: Reference;
  /** SDP console figures computed by the backend (backend/demo_api/analytics.py). Absent in the offline fallback. */
  analytics?: Analytics;
}

export interface DetectedIssue {
  key: string;
  block: string;
  stack: string;
  category: Category;
  caseIds: string[];
  units: string[];
  reopened: number;
  openCases: number;
  confidence: number;
  headline: string;
  /** The escalated systemic issue record, once the RecurrenceAgent has raised one. */
  recordId: string | null;
}

export interface Analytics {
  kpis: { total: number; open: number; closed: number; reopened: number; reopenRate: number; avgDaysToClose: number; highOpen: number };
  byCategory: { key: Category; name: string; count: number }[];
  byBlock: { name: string; open: number; total: number }[];
  monthly: { month: string; count: number }[];
  topRecurring: { unitId: string; category: Category; count: number; reopens: number; open: boolean; score: number }[];
  detected: DetectedIssue[];
  /** Clusters below this confidence go on the watchlist instead of being called systemic. */
  systemicConfidence: number;
  insight: string;
  /** Per unit and category (count includes reopens), for the stack heatmap. */
  unitStats: { unitId: string; category: Category; count: number; open: boolean }[];
  /** Buyer ratings given after sign-off. */
  satisfaction?: Satisfaction;
  /** Defect liability period per block and the 30-day repair clocks. */
  statutory?: Statutory;
}

export interface Statutory {
  dlpMonths: number;
  repairDays: number;
  /** Per block, from its units: earliest/latest VP and DLP end, days left for the earliest, and units in each state. */
  dlp: {
    block: string;
    vpDate: string | null;
    vpDateLast: string | null;
    dlpExpiry: string | null;
    dlpExpiryLast: string | null;
    daysLeft: number | null;
    state: "active" | "expiring" | "expired" | "unknown";
    units: number;
    openCases: number;
    active: number;
    expiring: number;
    expired: number;
    unknown: number;
  }[];
  overdue: { caseId: string; unitId: string; summary: string; status: CaseStatus; dueAt: string; daysOverdue: number }[];
  /** Open cases due within 7 days. */
  dueSoon: number;
  /** Repairs done within the repair period ÷ all repairs done. */
  onTimeRate: number;
  repaired: number;
}

export interface Satisfaction {
  count: number;
  /** Mean stars (0 when nothing is rated yet). */
  average: number;
  /** Rated cases ÷ cases the buyer signed off. */
  responseRate: number;
  /** Ratings of 1 or 2 stars. */
  low: number;
  distribution: { stars: number; count: number }[];
  /** Lowest average first. */
  byCategory: { key: Category; name: string; average: number; count: number }[];
  recent: { caseId: string; unitId: string; technicianId: string | null; stars: number; comment: string; at: string }[];
}

export interface Buyer {
  id: string;
  name: string;
  email: string;
  unitId: string;
}

export interface RepairPlan {
  trade: string;
  by: Technician["kind"];
  skills: string[];
  hours: number;
}

export interface Reference {
  project: string;
  units: Unit[];
  buyers: Buyer[];
  sdpStaff: { name: string; title: string; email: string };
}

export interface Rules {
  gracePeriodDays: number;
  dlpMonths: number;
  repairDaysFromNotice: number;
  dlpExpiringDays: number;
  signoffPeriodDays: number;
  signoffReminderDaysBefore: number;
  occurrenceThreshold: number;
  stackClusterThreshold: number;
  highUrgencyAutoClose: boolean;
  categoryToSkill: Partial<Record<Category, string[]>> & Record<string, string[]>;
  categoryLabel: Record<Category, string>;
  repairPlan: Record<Category, RepairPlan>;
  slotTimes: string[];
  slotHours: number;
  bookingWindowDays: number;
  urgency: { default: string; high: string[]; low: string[] };
  verificationProtocols: Record<string, string[]>;
}

/** What the VerificationAgent saw in the technician's repair photo. flagged: it could not confirm the repair
 *  (unsure, not resolved, or the same photo as the original), so SDP should look closely before signing off. */
export interface PhotoCheck {
  assessment: "looks_resolved" | "unclear" | "not_resolved";
  observations: string;
  confidence: number | null;
  flagged: boolean;
  /** "ai": the vision model judged the photo. "rule": a code check (the repair photo is the original file). */
  source: "ai" | "rule";
  model: string | null;
  /** The repair photo looks almost the same as the original (a picture-fingerprint check, not AI). */
  similarToOriginal: boolean;
  at: string | null;
}
