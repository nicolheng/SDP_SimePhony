"use client";
// Actions call the FastAPI backend (backend/demo_api/routes.py), which runs the workflow and writes data/simephony.db.
// Each call returns the fresh state from the database. Only small display helpers are computed here.
import { RULES } from "./constants";
import { addDays, daysBetween } from "./dates";
import { apiAction, apiFetch } from "./store";
import type { Case } from "./types";

// ---------- buyer ----------

export interface ReportInput {
  description: string;
  photoUrl: string | null;
  /** Optional: with no time the backend books the earliest free qualified technician. The buyer app sends none. */
  slot?: string | null;
  unitId: string;
  buyerId: string;
}

export async function submitReport(input: ReportInput, onCreated?: (caseId: string) => void): Promise<{ caseId?: string; nonDefect?: string }> {
  const r = await apiAction<{ caseId?: string; nonDefect?: string }>("/api/cases", {
    unit_id: input.unitId,
    buyer_id: input.buyerId,
    description: input.description,
    photo: input.photoUrl,
    slot: input.slot ?? null,
  });
  if (r.caseId) onCreated?.(r.caseId);
  return { caseId: r.caseId, nonDefect: r.nonDefect };
}

export async function answerFollowUp(caseId: string, answer: string, photoUrl: string | null = null) {
  await apiAction(`/api/cases/${caseId}/follow-up`, { answer, photo: photoUrl });
}

export async function bookRepair(caseId: string, start: string) {
  await apiAction(`/api/cases/${caseId}/repair-booking`, { start });
}

export async function submitVerification(caseId: string, result: "FIXED" | "NOT_FIXED" | "CANNOT_VERIFY", note: string, photoUrl: string | null) {
  await apiAction(`/api/cases/${caseId}/verification`, { result, note, photo: photoUrl });
}

/** Buyer signs off the whole unit once state.unitSignoff[unitId].ready is true; every defect in it closes. */
export async function signOffUnit(unitId: string, note = "") {
  await apiAction(`/api/units/${unitId}/signoff`, { note });
}

/** Satisfaction rating (1-5 stars) once the buyer has signed off. */
export async function rateRepair(caseId: string, stars: number, comment: string) {
  await apiAction(`/api/cases/${caseId}/rating`, { rating: stars, comment });
}

/** One rating for the buyer's latest unit sign-off (saved on every defect it closed). */
export async function rateUnit(unitId: string, stars: number, comment: string) {
  await apiAction(`/api/units/${unitId}/rating`, { rating: stars, comment });
}

export async function reopenCase(caseId: string, description: string, photoUrl: string) {
  await apiAction(`/api/cases/${caseId}/reopen`, { description, photo: photoUrl });
}

// ---------- technician / subcontractor ----------

/** repairHours (VALID only): the technician's expected repair duration, 2, 4 or 8. */
export async function recordVerdict(caseId: string, outcome: "VALID" | "INVALID", note: string, photoUrl: string | null, repairHours?: 2 | 4 | 8) {
  await apiAction(`/api/cases/${caseId}/verdict`, { outcome, note, photo: photoUrl, ...(outcome === "VALID" && repairHours ? { repair_hours: repairHours } : {}) });
}

export async function markRepaired(caseId: string, note: string, photoUrl: string | null) {
  await apiAction(`/api/cases/${caseId}/repaired`, { note, photo: photoUrl });
}

export async function acceptJob(caseId: string, technicianId: string) {
  await apiAction(`/api/cases/${caseId}/accept`, { technician_id: technicianId });
}

/** Decline the job, or give it up after accepting (emergency). The TriageAgent assigns the next available colleague;
 * `sameTime` says whether the buyer keeps their booking time. */
export async function handOverJob(caseId: string, technicianId: string, reason: string) {
  return apiAction<{ technicianId: string; sameTime: boolean; start: string }>(`/api/cases/${caseId}/handover`, { technician_id: technicianId, reason });
}

// ---------- SDP ----------

export async function developerSignOff(caseId: string) {
  await apiAction(`/api/cases/${caseId}/developer-signoff`);
}

/** SDP won't sign off the repair: it needs more work and the buyer books a new repair. note is shown to both. */
export async function rejectRepair(caseId: string, note: string) {
  await apiAction(`/api/cases/${caseId}/reject-repair`, { note });
}

/** Approve or reject a case an AI agent held for a person to check (PENDING_REVIEW). */
export async function decideReview(caseId: string, approve: boolean, note: string) {
  await apiAction(`/api/cases/${caseId}/review-decision`, { approve, note });
}

export async function decideApproval(approvalId: string, approve: boolean) {
  await apiAction(`/api/approvals/${approvalId}/decision`, { approve });
}

/** Write the inspection brief and book the joint inspection again, after they failed following an approval. */
export async function retryInspectionBrief(approvalId: string) {
  await apiAction(`/api/approvals/${approvalId}/retry-brief`);
}

// ---------- availability (read from the backend) ----------

export async function fetchVisitSlots(): Promise<string[]> {
  return (await apiFetch<{ slots: string[] }>("/api/slots/visit")).slots;
}

export interface RepairOption {
  start: string;
  slots: string[];
  workerIds: string[];
}

export async function fetchRepairOptions(caseId: string): Promise<RepairOption[]> {
  return (await apiFetch<{ options: RepairOption[] }>(`/api/cases/${caseId}/repair-options`)).options;
}

// ---------- demo controls ----------

export async function skipDays(days: number) {
  await apiAction("/api/demo/skip-days", { days });
}

export async function simulateRain() {
  await apiAction("/api/demo/rain");
}

/** Copy seed.db over simephony.db on the server. */
export async function resetDemo() {
  await apiAction("/api/demo/reset");
}

// ---------- display helpers (same rules the backend applies) ----------

export function canReopen(c: Case, now: string) {
  return c.status === "CLOSED" && !c.historical && !!c.closedAt && daysBetween(c.closedAt, now) <= RULES.gracePeriodDays;
}

/** When the buyer must sign off by: the developer's sign-off (the buyer signs after them) + the sign-off period. */
export function signoffDeadline(c: Case) {
  if (c.signoffDeadline) return c.signoffDeadline;
  const start = c.signoff?.developer?.at ?? c.repairedAt ?? c.verdict?.at ?? c.createdAt;
  return addDays(start, RULES.signoffPeriodDays);
}
