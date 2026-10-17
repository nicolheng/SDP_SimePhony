"use client";
// Mock API. Each export maps to a backend action/tool in CONTRACTS.md; replace the bodies with
// fetch() calls to FastAPI once P3/P4 ship the endpoints. Agent work is simulated with short delays.
import {
  commsAgent, freeSlotsFor, initialInspectionAgent, intakeAgent, recurrenceAgent, similarDefectAgent, triageAgent, verificationAgent,
} from "./agents";
import { CATEGORY_LABEL, DEMO_BUYER, getTechnician, getUnit, RULES, SDP_STAFF_EMAIL } from "./constants";
import { addDays, daysBetween, fmtDateTime } from "./dates";
import { getState, resetState, update } from "./store";
import type { AgentName, Case, DemoState, EventType, Photo } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = 700;

// ---------- helpers (operate on a draft) ----------

function log(d: DemoState, caseId: string | null, type: EventType, message: string, agent?: AgentName) {
  d.events.push({ id: d.seq.event++, caseId, type, at: d.now, message, agent });
}

const step = (d: DemoState, caseId: string, agent: AgentName, message: string) => log(d, caseId, "agent.step", message, agent);

function email(d: DemoState, caseId: string | null, to: string, subject: string, body: string) {
  d.outbox.push({ id: d.outbox.length + 1, caseId, to, subject, body, status: "logged, not sent", at: d.now });
  log(d, caseId, "email.sent", `📧 Email to ${to}: ${subject}`);
}

function notifyBuyer(d: DemoState, c: Case, kind: string, extra: Record<string, string> = {}) {
  const msg = commsAgent(kind, c, extra);
  d.messages.push({ id: d.messages.length + 1, caseId: c.id, at: d.now, ...msg });
  step(d, c.id, "CommsAgent", `Drafted buyer update "${msg.title}" (passed liability guardrail)`);
  if (c.buyerId === DEMO_BUYER.id) email(d, c.id, DEMO_BUYER.email, `[${c.id}] ${msg.title}`, msg.body);
}

function book(d: DemoState, c: Case, slot: string, technicianId: string, kind: "visit" | "repair") {
  d.bookings = d.bookings.filter((b) => !(b.caseId === c.id && b.kind === kind));
  d.bookings.push({ slot, technicianId, caseId: c.id, kind });
}

const find = (d: DemoState, id: string) => d.cases.find((c) => c.id === id)!;

function photo(url: string | null, kind: Photo["kind"], at: string): Photo {
  return { url, kind, at };
}

// ---------- buyer ----------

export interface ReportInput {
  description: string;
  photoUrl: string | null;
  slot: string;
  unitId?: string;
}

export async function submitReport(input: ReportInput, onCreated?: (caseId: string) => void): Promise<{ caseId?: string; nonDefect?: string }> {
  const intake = intakeAgent(input.description, !!input.photoUrl);
  if (intake.nonDefect) return { nonDefect: intake.nonDefect };

  let caseId = "";
  update((d) => {
    caseId = `C-${String(d.seq.case++).padStart(4, "0")}`;
    d.cases.push({
      id: caseId,
      unitId: input.unitId ?? DEMO_BUYER.unitId,
      buyerId: DEMO_BUYER.id,
      status: "SUBMITTED",
      category: intake.category,
      subCategory: intake.subCategory,
      location: intake.location,
      summary: intake.summary,
      description: input.description,
      urgency: intake.urgency,
      visitSlot: input.slot,
      photos: [photo(input.photoUrl, "original", d.now)],
      reopenCount: 0,
      occurrence: 1,
      similar: [],
      missingInfo: intake.missingInfo,
      followUpQuestion: intake.followUpQuestion,
      createdAt: d.now,
    });
    log(d, caseId, "case.created", "Buyer submitted a defect report with photo");
  });
  onCreated?.(caseId);

  await sleep(STEP_MS);
  update((d) => {
    const c = find(d, caseId);
    step(d, caseId, "IntakeAgent", `Category: ${CATEGORY_LABEL[c.category]} › ${c.subCategory}; location: ${c.location || "missing"}; urgency: ${c.urgency}${intake.mentionsPreviousIssue ? "; buyer mentions a previous issue" : ""}`);
    if (c.followUpQuestion) {
      c.status = "INFO_NEEDED";
      step(d, caseId, "IntakeAgent", `Missing info (${c.missingInfo.join(", ")}): asking a follow-up question`);
      log(d, caseId, "case.info_needed", c.followUpQuestion);
      notifyBuyer(d, c, "info_needed");
    }
  });
  if (getState().cases.find((c) => c.id === caseId)!.status === "INFO_NEEDED") return { caseId };
  await continueNewCaseFlow(caseId);
  return { caseId };
}

export async function answerFollowUp(caseId: string, answer: string) {
  update((d) => {
    const c = find(d, caseId);
    c.description = `${c.description}\n${answer}`;
    const intake = intakeAgent(c.description, c.photos.length > 0);
    Object.assign(c, {
      category: intake.category, subCategory: intake.subCategory, location: intake.location, summary: intake.summary,
      urgency: intake.urgency, missingInfo: intake.missingInfo, followUpQuestion: intake.followUpQuestion,
    });
    step(d, caseId, "IntakeAgent", intake.followUpQuestion ? "Still missing information" : `Follow-up answered: location ${c.location}`);
    if (intake.followUpQuestion) notifyBuyer(d, c, "info_needed");
    else c.status = "SUBMITTED";
  });
  if (find(getState(), caseId).status === "SUBMITTED") await continueNewCaseFlow(caseId);
}

async function continueNewCaseFlow(caseId: string) {
  await sleep(STEP_MS);
  update((d) => {
    const c = find(d, caseId);
    const sim = similarDefectAgent(d, c);
    c.similar = sim.refs;
    c.occurrence = sim.occurrence;
    step(d, caseId, "SimilarDefectAgent",
      sim.refs.length
        ? `Found ${sim.refs.length} related case(s); recurrence_count=${sim.occurrence} in this unit; ${sim.stackUnits.length} other unit(s) in the stack`
        : "No related cases: treated as a new defect");
  });
  await sleep(STEP_MS);
  update((d) => {
    const c = find(d, caseId);
    const t = triageAgent(d, c, c.visitSlot!);
    c.technicianId = t.technicianId;
    c.visitSlot = t.slot;
    c.triageReason = t.reason;
    c.status = "ASSIGNED";
    log(d, caseId, "case.assigned", `Assigned to ${getTechnician(t.technicianId)!.name}`);
    step(d, caseId, "TriageAgent", t.reason);
    book(d, c, t.slot, t.technicianId, "visit");
    c.status = "VISIT_SCHEDULED";
    notifyBuyer(d, c, "received", { slot: fmtDateTime(t.slot) });
  });
}

export async function bookRepair(caseId: string, slot: string) {
  update((d) => {
    const c = find(d, caseId);
    c.repairSlot = slot;
    c.status = "REPAIR_BOOKED";
    book(d, c, slot, c.technicianId!, "repair");
    log(d, caseId, "repair.booked", `Repair booked for ${fmtDateTime(slot)}`);
    notifyBuyer(d, c, "repair_booked", { slot: fmtDateTime(slot) });
  });
}

export async function submitVerification(caseId: string, result: "FIXED" | "NOT_FIXED" | "CANNOT_VERIFY", note: string, photoUrl: string | null) {
  update((d) => {
    const c = find(d, caseId);
    c.verification = { result, note, at: d.now };
    if (photoUrl) c.photos.push(photo(photoUrl, result === "NOT_FIXED" ? "reopen" : "verification", d.now));
    log(d, caseId, "verification.completed", `Buyer verification: ${result.replace("_", " ").toLowerCase()}${note ? ` — "${note}"` : ""}`);
    step(d, caseId, "VerificationAgent", `Recorded result ${result}${photoUrl ? " with photo evidence" : ""}`);
    if (result === "FIXED") {
      c.status = "CLOSED";
      c.closedAt = d.now;
      log(d, caseId, "case.closed", "VERIFIED: case closed");
      notifyBuyer(d, c, "closed");
    }
  });
  if (result === "NOT_FIXED") await reopen(caseId, note || "Buyer verification failed: still not fixed", null);
}

export function canReopen(c: Case, now: string) {
  return c.status === "CLOSED" && !c.historical && !!c.closedAt && daysBetween(c.closedAt, now) <= RULES.gracePeriodDays;
}

export async function reopenCase(caseId: string, description: string, photoUrl: string) {
  await reopen(caseId, description, photoUrl);
}

async function reopen(caseId: string, description: string, photoUrl: string | null) {
  update((d) => {
    const c = find(d, caseId);
    c.reopenCount += 1;
    c.status = "REOPENED";
    c.closedAt = undefined;
    if (photoUrl) c.photos.push(photo(photoUrl, "reopen", d.now));
    log(d, caseId, "case.reopened", `Reopened (#${c.reopenCount}): ${description}`);
    notifyBuyer(d, c, "reopened");
  });
  await sleep(STEP_MS);
  update((d) => {
    const c = find(d, caseId);
    const r = recurrenceAgent(d, c);
    c.occurrence = r.occurrence;
    step(d, caseId, "RecurrenceAgent", `Occurrences in unit: ${r.occurrence}; stack units affected: ${r.stackUnits.length + 1}`);
    if (r.escalate) {
      const unit = getUnit(c.unitId);
      const siId = `SI-${String(d.seq.si++).padStart(3, "0")}`;
      const related = d.cases.filter((x) => {
        const u = getUnit(x.unitId);
        return x.category === c.category && u.block === unit.block && u.stack === unit.stack && x.status !== "INVALID";
      });
      d.systemicIssues.push({
        id: siId,
        title: `${c.subCategory}`,
        category: c.category,
        block: unit.block,
        stack: unit.stack,
        relatedCases: related.map((x) => x.id),
        recurrenceCount: related.length,
        reopenedCount: related.filter((x) => x.reopenCount > 0).length,
        confidence: Math.min(0.95, 0.55 + related.length * 0.06),
        detectedAt: d.now,
        status: "open",
        approvalStatus: "pending",
        recommendedAction: `Extra inspection of ${c.unitId} and the unit above; check the shared riser for stack ${unit.block}-${unit.stack}.`,
      });
      d.approvals.push({ id: `AP-${d.approvals.length + 1}`, caseId, systemicIssueId: siId, reasons: r.reasons, status: "pending", createdAt: d.now });
      c.status = "ESCALATION_PENDING";
      log(d, caseId, "recurrence.detected", r.reasons.join(" "), "RecurrenceAgent");
      log(d, caseId, "inspection.requested", `Extra inspection requested (${siId}); waiting for SDP approval`, "RecurrenceAgent");
      email(d, caseId, SDP_STAFF_EMAIL, `[Approval needed] Extra inspection for ${c.id} (${siId})`, `${r.reasons.join("\n")}\n\nApprove or reject: /sdp/approvals`);
      notifyBuyer(d, c, "escalated");
    } else {
      const t = triageAgent(d, c, freeSlotsFor(d, c.category, blockOf(c))[0]);
      c.technicianId = t.technicianId;
      c.visitSlot = t.slot;
      c.verdict = undefined;
      c.status = "VISIT_SCHEDULED";
      book(d, c, t.slot, t.technicianId, "visit");
      step(d, caseId, "TriageAgent", `Below escalation threshold; revisit: ${t.reason}`);
      notifyBuyer(d, c, "revisit", { slot: fmtDateTime(t.slot) });
    }
  });
}

const blockOf = (c: Case) => getUnit(c.unitId).block;

// ---------- technician ----------

export async function recordVerdict(caseId: string, outcome: "VALID" | "INVALID", note: string, photoUrl: string | null) {
  update((d) => {
    const c = find(d, caseId);
    c.verdict = { outcome, note, at: d.now };
    if (photoUrl) c.photos.push(photo(photoUrl, "verdict", d.now));
    d.bookings = d.bookings.filter((b) => !(b.caseId === c.id && b.kind === "visit"));
    log(d, caseId, "verdict.recorded", `Technician marked ${outcome}: "${note}"`);
    if (outcome === "VALID") {
      c.status = "VALID";
      notifyBuyer(d, c, "valid", { note });
    } else {
      c.status = "INVALID";
      c.closedAt = d.now;
      notifyBuyer(d, c, "invalid", { note });
    }
  });
}

export async function markRepaired(caseId: string, note: string, photoUrl: string | null) {
  update((d) => {
    const c = find(d, caseId);
    c.status = "REPAIRED";
    c.repairNote = note;
    if (photoUrl) c.photos.push(photo(photoUrl, "repair", d.now));
    d.bookings = d.bookings.filter((b) => !(b.caseId === c.id && b.kind === "repair"));
    log(d, caseId, "repair.done", `Technician marked repaired: "${note}"`);
  });
  await sleep(STEP_MS);
  update((d) => {
    const c = find(d, caseId);
    c.verificationGuide = verificationAgent(c);
    c.status = "PENDING_VERIFICATION";
    step(d, caseId, "VerificationAgent", `Retrieved ${CATEGORY_LABEL[c.category].toLowerCase()} protocol; ${c.verificationGuide.steps.length} case-specific checks for the buyer`);
    log(d, caseId, "verification.requested", "Buyer asked to verify the repair");
    notifyBuyer(d, c, "verify");
  });
}

// ---------- SDP ----------

export async function decideApproval(approvalId: string, approve: boolean) {
  update((d) => {
    const a = d.approvals.find((x) => x.id === approvalId)!;
    const c = find(d, a.caseId);
    const si = d.systemicIssues.find((x) => x.id === a.systemicIssueId);
    a.status = approve ? "approved" : "rejected";
    a.decidedAt = d.now;
    if (si) {
      si.approvalStatus = a.status;
      si.status = approve ? "under_inspection" : "monitoring";
    }
    if (approve) {
      log(d, c.id, "inspection.approved", `SDP approved extra inspection (${a.systemicIssueId})`);
    } else {
      log(d, c.id, "inspection.rejected", "SDP rejected extra inspection: normal repair booking");
      c.status = "VALID";
      notifyBuyer(d, c, "valid", { note: "Our team will repair this as a normal case" });
    }
  });
  if (!approve) return;
  await sleep(STEP_MS);
  update((d) => {
    const a = d.approvals.find((x) => x.id === approvalId)!;
    const c = find(d, a.caseId);
    c.inspectionBrief = initialInspectionAgent(d, c);
    const t = triageAgent(d, c, freeSlotsFor(d, c.category, blockOf(c))[0]);
    c.technicianId = t.technicianId;
    c.visitSlot = t.slot;
    c.verdict = undefined;
    c.status = "EXTRA_INSPECTION";
    book(d, c, t.slot, t.technicianId, "visit");
    step(d, c.id, "InitialInspectionAgent",
      `Brief ready: ${c.inspectionBrief.timeline.length} timeline entries, ${c.inspectionBrief.neighbouringUnits.length} neighbouring units, ${c.inspectionBrief.checklist.length}-point checklist`);
    const tech = getTechnician(t.technicianId)!;
    email(d, c.id, tech.email, `[${c.id}] Inspection brief`, c.inspectionBrief.checklist.map((x, i) => `${i + 1}. ${x}`).join("\n"));
    notifyBuyer(d, c, "extra_inspection", { slot: fmtDateTime(t.slot) });
  });
}

// ---------- demo controls ----------

export function skipDays(days: number) {
  update((d) => {
    d.now = addDays(d.now, days);
    log(d, null, "agent.step", `Demo clock moved forward ${days} days`);
  });
}

export function simulateRain() {
  update((d) => {
    for (const unitId of ["A-13-08", "A-11-08"]) {
      const open = d.cases.some((c) => c.unitId === unitId && !c.historical && !["CLOSED", "INVALID"].includes(c.status));
      if (open) continue;
      const id = `C-${String(d.seq.case++).padStart(4, "0")}`;
      const intake = intakeAgent("Heavy rain last night, ceiling in master bedroom leaking again", true);
      const c: Case = {
        id, unitId, buyerId: `B-${unitId}`, status: "SUBMITTED", category: intake.category, subCategory: intake.subCategory,
        location: intake.location, summary: intake.summary, description: "Heavy rain last night, ceiling in master bedroom leaking again",
        urgency: intake.urgency, photos: [photo(null, "original", d.now)], reopenCount: 0, occurrence: 1, similar: [], missingInfo: [], createdAt: d.now,
      };
      d.cases.push(c);
      log(d, id, "case.created", `Rain: new report from ${unitId}`);
      const sim = similarDefectAgent(d, c);
      c.similar = sim.refs;
      c.occurrence = sim.occurrence;
      step(d, id, "SimilarDefectAgent", `Linked to ${sim.refs.length} related case(s) in stack A-08`);
      const t = triageAgent(d, c, freeSlotsFor(d, c.category, "A")[0]);
      c.technicianId = t.technicianId;
      c.visitSlot = t.slot;
      c.status = "VISIT_SCHEDULED";
      book(d, c, t.slot, t.technicianId, "visit");
      step(d, id, "TriageAgent", t.reason);
    }
  });
}

export function resetDemo() {
  resetState();
}
