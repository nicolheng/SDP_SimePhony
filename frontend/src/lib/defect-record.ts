// Digital defect record: one approval history with role-based sign-off, shared by the on-screen card and the PDF.
import { fmtHours } from "./agents";
import { CATEGORY_LABEL, DEMO_BUYER, getUnit, PROJECT_NAME, REPAIR_PLAN, RULES, SDP_STAFF, TZ, workerLabel } from "./constants";
import { fmtDateTime } from "./dates";
import { STATUS_META } from "./status";
import type { Approval, Case } from "./types";

export type StepState = "done" | "pending" | "attention" | "skipped";

export interface RecordStep {
  title: string;
  desc: string;
  state: StepState;
  badge: string;
  who?: string;
  at?: string;
  detail?: string;
}

export interface DefectRecord {
  defectId: string;
  caseId: string;
  defect: string;
  category: string;
  trade: string;
  assignedTo: string;
  unit: string;
  buyer: string;
  reported: string;
  status: string;
  steps: RecordStep[];
}

const yearOf = (iso: string) => new Intl.DateTimeFormat("en-MY", { timeZone: TZ, year: "numeric" }).format(new Date(iso));

/** DF-2026-00014 for live cases; DF-2025-H0001 for seeded history. */
export function defectId(c: Pick<Case, "id" | "createdAt">) {
  const n = c.id.replace(/\D/g, "");
  return `DF-${yearOf(c.createdAt)}-${c.id.startsWith("H-") ? `H${n.padStart(4, "0")}` : n.padStart(5, "0")}`;
}

export const buyerName = (c: Pick<Case, "buyerId" | "unitId">) => (c.buyerId === DEMO_BUYER.id ? DEMO_BUYER.name : `Owner of ${c.unitId}`);

/** The record (with its approval history) is shown once the case reaches the sign-off stage. */
export const recordAvailable = (c: Case) => c.status === "PENDING_SIGNOFF" || !!c.signoff || !!c.autoClosedAt;

export function buildDefectRecord(c: Case, approvals: Approval[]): DefectRecord {
  const plan = REPAIR_PLAN[c.category];
  const invalid = c.verdict?.outcome === "INVALID" || c.status === "INVALID";
  const approval = approvals.filter((a) => a.caseId === c.id).at(-1);
  const steps: RecordStep[] = [];

  steps.push({
    title: "Buyer submission",
    desc: "Submitted with photos and description",
    state: "done",
    badge: "Recorded",
    who: buyerName(c),
    at: c.createdAt,
    detail: `${c.photos.filter((p) => p.kind === "original").length || 1} photo(s) · "${c.description.split("\n")[0]}"`,
  });

  steps.push(
    c.verdict
      ? {
          title: "Technician inspection",
          desc: "Inspection visit and verdict",
          state: "done",
          badge: c.verdict.outcome === "VALID" ? "Defect confirmed" : "Not a defect",
          who: workerLabel(c.inspectorId ?? c.technicianId),
          at: c.verdict.at,
          detail: c.verdict.note,
        }
      : {
          title: "Technician inspection",
          desc: "Inspection visit and verdict",
          state: "pending",
          badge: "Pending",
          who: c.technicianId ? workerLabel(c.technicianId) : undefined,
          detail: c.visitSlot ? `Inspection visit ${fmtDateTime(c.visitSlot)}` : undefined,
        },
  );

  if (approval) {
    steps.push({
      title: "Extra inspection approval",
      desc: "SDP decision on a recurring or clustered defect",
      state: approval.status === "pending" ? "pending" : "done",
      badge: approval.status === "approved" ? "Approved" : approval.status === "rejected" ? "Rejected" : "Pending",
      who: approval.status === "pending" ? undefined : `${SDP_STAFF.name}, ${SDP_STAFF.title}`,
      at: approval.decidedAt,
      detail: [approval.reasons.join(" "), c.supportId ? `Joint inspection with ${workerLabel(c.supportId)}` : ""].filter(Boolean).join(" · "),
    });
  }

  if (invalid) {
    for (const title of ["Repair completion", "Developer verification", "Buyer acceptance"])
      steps.push({ title, desc: "Not required: assessed as not a defect", state: "skipped", badge: "Not required" });
  } else {
    steps.push(
      c.repairedAt
        ? {
            title: "Repair completion",
            desc: "Repair notes, photos and completion timestamp",
            state: "done",
            badge: "Completed",
            who: workerLabel(c.technicianId),
            at: c.repairedAt,
            detail: c.repairNote,
          }
        : {
            title: "Repair completion",
            desc: "Repair notes, photos and completion timestamp",
            state: "pending",
            badge: "Pending",
            who: c.repairSlot ? workerLabel(c.technicianId) : undefined,
            detail: c.repairSlot ? `Booked ${fmtDateTime(c.repairSlot)} · ${fmtHours(c.repairHours ?? plan.hours)}` : `${plan.trade} · ${fmtHours(plan.hours)}`,
          },
    );

    const dev = c.signoff?.developer;
    steps.push(
      dev
        ? { title: "Developer verification", desc: "Developer inspector approves the repair", state: "done", badge: "Approved", who: dev.by, at: dev.at }
        : { title: "Developer verification", desc: "Developer inspector approves the repair", state: "pending", badge: "Pending" },
    );

    const buyer = c.signoff?.buyer;
    steps.push(
      buyer
        ? { title: "Buyer acceptance", desc: "Confirm satisfactory repair or report unresolved issue", state: "done", badge: "Accepted", who: buyerName(c), at: buyer.at, detail: buyer.note || undefined }
        : c.autoClosedAt
          ? {
              title: "Buyer acceptance",
              desc: "Confirm satisfactory repair or report unresolved issue",
              state: "attention",
              badge: "Auto-closed",
              at: c.autoClosedAt,
              detail: `No buyer sign-off within ${RULES.signoffPeriodDays} days`,
            }
          : c.verification?.result === "NOT_FIXED"
            ? { title: "Buyer acceptance", desc: "Confirm satisfactory repair or report unresolved issue", state: "attention", badge: "Unresolved", who: buyerName(c), at: c.verification.at, detail: c.verification.note || "Buyer reported the problem is not fixed" }
            : { title: "Buyer acceptance", desc: "Confirm satisfactory repair or report unresolved issue", state: "pending", badge: "Pending" },
    );
  }

  const unit = getUnit(c.unitId);
  return {
    defectId: defectId(c),
    caseId: c.id,
    defect: c.summary,
    category: `${CATEGORY_LABEL[c.category]} › ${c.subCategory}`,
    trade: plan.trade,
    assignedTo: workerLabel(c.technicianId),
    unit: `${PROJECT_NAME} · ${unit.id} (Block ${unit.block}, level ${unit.floor})`,
    buyer: buyerName(c),
    reported: c.createdAt,
    status: STATUS_META[c.status].label,
    steps,
  };
}

/** Build and download the record as a PDF. */
export async function downloadDefectRecordPdf(r: DefectRecord, viewer: string, photoUrl?: string | null) {
  (await buildDefectRecordPdf(r, viewer, photoUrl)).save(`${r.defectId}.pdf`);
}

/** Lay out the record as a PDF document (jsPDF is loaded only when needed). */
export async function buildDefectRecordPdf(r: DefectRecord, viewer: string, photoUrl?: string | null) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  let y = 0;

  doc.setFillColor(215, 25, 32);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Digital Defect Record", M, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Sime Darby Property · SimePhony · ${r.defectId}`, M, 20);
  y = 36;

  const row = (label: string, value: string) => {
    doc.setTextColor(113, 113, 122);
    doc.setFontSize(9);
    doc.text(label, M, y);
    doc.setTextColor(24, 24, 27);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(value, 120);
    doc.text(lines, W - M, y, { align: "right" });
    y += Math.max(6, lines.length * 5);
  };
  row("Defect ID", r.defectId);
  row("Case", r.caseId);
  row("Defect", r.defect);
  row("Category", r.category);
  row("Assigned trade", r.trade);
  row("Assigned to", r.assignedTo);
  row("Unit", r.unit);
  row("Buyer", r.buyer);
  row("Reported", fmtDateTime(r.reported));
  row("Status", r.status);

  if (photoUrl?.startsWith("data:image")) {
    y += 2;
    try {
      doc.addImage(photoUrl, "JPEG", M, y, 60, 45);
      y += 50;
    } catch {
      // Unsupported image: skip it.
    }
  }

  y += 2;
  doc.setDrawColor(228, 228, 231);
  doc.line(M, y, W - M, y);
  y += 8;
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Approval history", M, y);
  y += 7;

  const colour: Record<StepState, [number, number, number]> = { done: [5, 150, 105], pending: [161, 161, 170], attention: [234, 88, 12], skipped: [161, 161, 170] };
  for (const s of r.steps) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...colour[s.state]);
    doc.circle(M + 1.5, y - 1.2, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    doc.text(s.title, M + 6, y);
    doc.setTextColor(...colour[s.state]);
    doc.text(s.badge, W - M, y, { align: "right" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(82, 82, 91);
    const meta = [s.desc, s.who && `By: ${s.who}`, s.at && `At: ${fmtDateTime(s.at)}`, s.detail].filter(Boolean) as string[];
    for (const m of meta) {
      const lines = doc.splitTextToSize(m, W - 2 * M - 6);
      doc.text(lines, M + 6, y);
      y += lines.length * 4.5;
    }
    y += 4;
  }

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`Downloaded by ${viewer} on ${fmtDateTime(new Date().toISOString())} · demo record, not a legal document`, M, 290);
  return doc;
}
