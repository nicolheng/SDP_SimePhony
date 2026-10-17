// Shapes mirror CONTRACTS.md / backend/schema.sql so the mock layer can be swapped for FastAPI.

export type CaseStatus =
  | "SUBMITTED"
  | "INFO_NEEDED"
  | "ASSIGNED"
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
  | "case.assigned"
  | "verdict.recorded"
  | "repair.booked"
  | "repair.done"
  | "verification.requested"
  | "verification.completed"
  | "case.reopened"
  | "recurrence.detected"
  | "inspection.requested"
  | "inspection.approved"
  | "inspection.rejected"
  | "signoff.completed"
  | "case.closed"
  | "email.sent"
  | "agent.step";

export interface Unit {
  id: string; // A-12-08
  block: string;
  floor: number;
  stack: string; // "08"
  contractor: string;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  skills: string[];
  blocks: string[];
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
  technicianId?: string;
  visitSlot?: string; // ISO start
  repairSlot?: string;
  photos: Photo[];
  reopenCount: number;
  occurrence: number;
  similar: SimilarRef[];
  missingInfo: string[];
  followUpQuestion?: string;
  verdict?: { outcome: "VALID" | "INVALID"; note: string; at: string };
  repairNote?: string;
  verificationGuide?: VerificationGuide;
  verification?: { result: "FIXED" | "NOT_FIXED" | "CANNOT_VERIFY"; note: string; at: string };
  signoff?: { buyer?: { at: string; note: string }; developer?: { at: string; by: string } };
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
  status: "sent" | "logged, not sent";
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

export interface DemoState {
  version: number;
  now: string; // demo clock
  cases: Case[];
  events: CaseEvent[];
  messages: BuyerMessage[];
  outbox: Email[];
  approvals: Approval[];
  systemicIssues: SystemicIssue[];
  bookings: Booking[];
  seq: { case: number; event: number; si: number };
}
