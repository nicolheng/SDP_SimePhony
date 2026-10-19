// Server only: read data/seed.db (built by backend/seed/seed_core.py + seed_history.py) and map it
// to the frontend's DemoState. Read-only; the browser mock still handles clicks during the demo.
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { verificationAgent } from "./agents";
import { CATEGORY_LABEL, REPAIR_PLAN } from "./constants";
import { isOpen } from "./status";
import type {
  Approval, Booking, BuyerMessage, Case, CaseEvent, CaseStatus, Category, DemoState, Email, EventType, InspectionBrief, Photo, SystemicIssue,
} from "./types";

type Row = Record<string, string | number | null>;

// Read from disk at runtime (not bundled), so tell Turbopack not to trace it.
export const SEED_DB_PATH = process.env.SEED_DB_PATH
  ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.SEED_DB_PATH)
  : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "data", "seed.db");

const str = (v: Row[string]) => (v == null ? undefined : String(v));
const json = <T>(v: Row[string], fallback: T): T => {
  if (v == null || v === "") return fallback;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};
/** "CE-0042" → 42 */
const num = (id: Row[string]) => Number(String(id).replace(/\D/g, "")) || 0;
/** "ceiling_leak" → "Ceiling leak"; "master bedroom ceiling" → "Master bedroom ceiling" */
const pretty = (v: Row[string]) => {
  const s = String(v ?? "").replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
};

const CATEGORIES = new Set(Object.keys(CATEGORY_LABEL));
const toCategory = (v: Row[string]): Category => (CATEGORIES.has(String(v)) ? (v as Category) : "other");

const PHOTO_KINDS = new Set<Photo["kind"]>(["original", "reopen", "verdict", "repair", "verification"]);

/** Readable timeline text for an event row (the DB stores details in a JSON payload). */
function eventMessage(type: string, p: Record<string, unknown>, techName: (id: unknown) => string): string {
  const s = (k: string) => (p[k] == null ? "" : String(p[k]));
  switch (type) {
    case "agent.step":
      return s("message") || "Agent step";
    case "email.sent":
      return `📧 Email to ${s("to") || "recipient"}: ${s("subject")}`;
    case "case.created":
      return `Reported: ${s("summary") || "new defect"}`;
    case "case.assigned":
      return `Assigned to ${techName(p.technician_id)}`;
    case "booking.requested":
      return `Booking requested with ${techName(p.technician_id)} (${s("slot_id")})`;
    case "booking.confirmed":
      return `Booking confirmed with ${techName(p.technician_id)} (${s("slot_id")})`;
    case "booking.rejected":
      return `Booking declined by ${techName(p.technician_id)}${s("reason") ? `: ${s("reason")}` : ""}`;
    default: {
      const detail = Object.entries(p)
        .filter(([, v]) => v != null && typeof v !== "object")
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" · ");
      return detail || type;
    }
  }
}

function toBrief(raw: Row[string], createdAt: string): InspectionBrief | undefined {
  const b = json<Record<string, unknown> | null>(raw, null);
  if (!b) return raw ? { generatedAt: createdAt, timeline: [], photoComparison: String(raw), neighbouringUnits: [], likelyComponents: [], checklist: [] } : undefined;
  const arr = <T>(k: string) => (Array.isArray(b[k]) ? (b[k] as T[]) : []);
  return {
    generatedAt: String(b.generatedAt ?? b.generated_at ?? createdAt),
    timeline: arr<{ at: string; text: string }>("timeline"),
    photoComparison: String(b.photoComparison ?? b.photo_comparison ?? ""),
    neighbouringUnits: arr<{ unitId: string; cases: number; last: string }>(b.neighbouringUnits ? "neighbouringUnits" : "neighbouring_units"),
    likelyComponents: arr<string>(b.likelyComponents ? "likelyComponents" : "likely_components"),
    checklist: arr<string>("checklist"),
  };
}

export function loadSeedFromDb(file = SEED_DB_PATH): DemoState {
  if (!existsSync(file)) throw new Error(`seed.db not found at ${file}. Run: python backend/seed/seed_history.py`);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const all = (sql: string) => db.prepare(sql).all() as Row[];

    const techs = new Map(all("SELECT technician_id, name FROM technicians").map((t) => [String(t.technician_id), String(t.name)]));
    const techName = (id: unknown) => techs.get(String(id)) ?? String(id ?? "a technician");
    const buyerEmail = new Map(all("SELECT buyer_id, email FROM buyers").map((b) => [String(b.buyer_id), String(b.email)]));

    // Per-case lookups
    const group = <T>(rows: Row[], key: string, map: (r: Row) => T) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const k = String(r[key]);
        m.set(k, [...(m.get(k) ?? []), map(r)]);
      }
      return m;
    };
    const photos = group(all("SELECT * FROM case_photos ORDER BY created_at"), "case_id", (r): Photo => ({
      url: null, // image files are not in uploads/ yet; the UI shows a placeholder
      kind: PHOTO_KINDS.has(r.kind as Photo["kind"]) ? (r.kind as Photo["kind"]) : "original",
      at: String(r.created_at),
    }));
    const slots = group(all("SELECT * FROM slots WHERE case_id IS NOT NULL ORDER BY start_at"), "case_id", (r) => r);
    const verifs = group(all("SELECT * FROM verifications ORDER BY created_at"), "case_id", (r) => r);
    const briefs = new Map(all("SELECT * FROM inspection_briefs").map((r) => [String(r.case_id), r]));
    const unitOf = new Map(all("SELECT case_id, unit_id FROM cases").map((r) => [String(r.case_id), String(r.unit_id)]));
    const links = group(all("SELECT * FROM case_links ORDER BY created_at"), "case_id", (r) => ({
      caseId: String(r.related_case_id),
      unitId: unitOf.get(String(r.related_case_id)) ?? "",
      reason: String(r.reason),
      at: String(r.created_at),
    }));

    const cases: Case[] = all("SELECT * FROM cases ORDER BY created_at").map((r) => {
      const id = String(r.case_id);
      const caseSlots = slots.get(id) ?? [];
      const slotOf = (kind: string) => str(caseSlots.filter((s) => s.kind === kind).at(-1)?.start_at ?? null);
      const v = (verifs.get(id) ?? []).at(-1);
      const outcome = str(r.inspection_outcome);
      const verdictOutcome = outcome === "VALID_DEFECT" ? "VALID" : outcome === "NOT_A_DEFECT" || r.status === "INVALID" ? "INVALID" : outcome ? "VALID" : undefined;
      const c: Case = {
        id,
        unitId: String(r.unit_id),
        buyerId: String(r.buyer_id),
        status: String(r.status) as CaseStatus,
        category: toCategory(r.category),
        subCategory: pretty(r.sub_category) || CATEGORY_LABEL[toCategory(r.category)],
        location: pretty(r.location_in_unit),
        summary: String(r.summary ?? ""),
        description: String(r.description ?? ""),
        urgency: r.urgency === "high" || r.urgency === "low" ? r.urgency : "normal",
        technicianId: str(r.technician_id),
        inspectorId: r.verdict_at ? str(r.technician_id) : undefined,
        visitSlot: slotOf("visit"),
        repairSlot: slotOf("repair"),
        repairHours: slotOf("repair") ? REPAIR_PLAN[toCategory(r.category)].hours : undefined,
        photos: photos.get(id) ?? [],
        reopenCount: Number(r.reopen_count ?? 0),
        occurrence: Number(r.occurrence_count ?? 1),
        similar: links.get(id) ?? [],
        missingInfo: json<string[]>(r.missing_info, []),
        followUpQuestion: str(r.follow_up_question),
        verdict: verdictOutcome && r.verdict_at ? { outcome: verdictOutcome, note: String(r.verdict_note ?? ""), at: String(r.verdict_at) } : undefined,
        repairNote: str(r.repair_note),
        repairedAt: str(r.repaired_at),
        verification:
          v && v.outcome && v.completed_at
            ? { result: v.outcome as "FIXED" | "NOT_FIXED" | "CANNOT_VERIFY", note: String(v.evidence_notes ?? ""), at: String(v.completed_at) }
            : undefined,
        signoff:
          r.buyer_signed_at || r.developer_signed_at
            ? {
                buyer: r.buyer_signed_at ? { at: String(r.buyer_signed_at), note: String(r.buyer_signoff_note ?? "") } : undefined,
                developer: r.developer_signed_at ? { at: String(r.developer_signed_at), by: String(r.developer_signed_by ?? "SDP") } : undefined,
              }
            : undefined,
        inspectionBrief: briefs.has(id) ? toBrief(briefs.get(id)!.brief, String(briefs.get(id)!.created_at)) : undefined,
        triageReason: str(r.triage_reason),
        createdAt: String(r.created_at),
        closedAt: str(r.closed_at),
        // Past seeded cases; open H- cases (e.g. still awaiting sign-off) stay in the active lists.
        historical: id.startsWith("H-") && !isOpen(String(r.status) as CaseStatus),
      };
      // The DB stores only the protocol name; the case-specific steps come from the VerificationAgent stand-in.
      if (v || c.status === "PENDING_SIGNOFF") {
        const guide = verificationAgent(c);
        c.verificationGuide = { ...guide, intro: v?.protocol ? `${v.protocol}. ${guide.intro}` : guide.intro };
      }
      return c;
    });

    const events: CaseEvent[] = all("SELECT * FROM case_events ORDER BY created_at, event_id").map((r) => {
      const p = json<Record<string, unknown>>(r.payload, {});
      const type = String(r.type) as EventType;
      return {
        id: num(r.event_id),
        caseId: str(r.case_id) ?? null,
        type,
        at: String(r.created_at),
        agent: type === "agent.step" && p.agent ? (String(p.agent) as CaseEvent["agent"]) : undefined,
        message: eventMessage(type, p, techName),
      };
    });

    const messages: BuyerMessage[] = all("SELECT * FROM buyer_messages ORDER BY created_at").map((r) => ({
      id: num(r.message_id),
      caseId: String(r.case_id),
      at: String(r.created_at),
      title: String(r.title),
      body: String(r.body),
    }));

    const outbox: Email[] = all("SELECT * FROM outbox ORDER BY created_at").map((r) => {
      // Some rows address buyers as "<buyer_id>@example.com"; resolve to the buyer's real email.
      const to = String(r.to_addr);
      const buyerId = to.match(/^(B-\d+)@/)?.[1];
      return {
        id: num(r.email_id),
        caseId: str(r.case_id) ?? null,
        to: (buyerId && buyerEmail.get(buyerId)) || to,
        subject: String(r.subject),
        body: String(r.body),
        status: r.status === "sent" ? "sent" : "logged, not sent",
        at: String(r.created_at),
      };
    });

    const issueRows = all("SELECT * FROM systemic_issues ORDER BY detected_at");
    const approvalRows = all("SELECT * FROM approvals ORDER BY created_at");
    const approvalStatus = new Map(approvalRows.map((a) => [String(a.approval_id), String(a.status)]));
    const issueForApproval = new Map(issueRows.filter((i) => i.approval_id).map((i) => [String(i.approval_id), String(i.issue_id)]));

    const approvals: Approval[] = approvalRows.map((a) => ({
      id: String(a.approval_id),
      caseId: String(a.case_id),
      systemicIssueId: issueForApproval.get(String(a.approval_id)) ?? "",
      reasons: json<string[]>(a.reasons, []),
      status: (["pending", "approved", "rejected"].includes(String(a.status)) ? a.status : "pending") as Approval["status"],
      createdAt: String(a.created_at),
      decidedAt: str(a.decided_at),
    }));

    const systemicIssues: SystemicIssue[] = issueRows.map((i) => ({
      id: String(i.issue_id),
      title: String(i.title),
      category: toCategory(i.category),
      block: String(i.block ?? ""),
      stack: String(i.stack ?? ""),
      relatedCases: json<string[]>(i.related_cases, []),
      recurrenceCount: Number(i.recurrence_count ?? 0),
      reopenedCount: Number(i.reopened_count ?? 0),
      confidence: Number(i.confidence ?? 0),
      detectedAt: String(i.detected_at),
      status: (["open", "under_inspection", "monitoring", "resolved"].includes(String(i.status)) ? i.status : "open") as SystemicIssue["status"],
      approvalStatus: (i.approval_id ? (approvalStatus.get(String(i.approval_id)) ?? "pending") : "pending") as SystemicIssue["approvalStatus"],
      recommendedAction: String(i.recommended_action ?? ""),
    }));

    const bookings: Booking[] = all("SELECT * FROM slots WHERE case_id IS NOT NULL").map((s) => ({
      slot: String(s.start_at),
      technicianId: String(s.technician_id),
      caseId: String(s.case_id),
      kind: s.kind === "repair" ? "repair" : "visit",
    }));

    // Demo clock: when the newest case was reported (some seeded events are scheduled later than that).
    const now = cases.map((c) => c.createdAt).sort().at(-1) ?? new Date().toISOString();
    const maxNum = (ids: string[], prefix: string) => Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map(num));

    return {
      version: 4,
      source: "seed.db",
      now,
      cases,
      events,
      messages,
      outbox,
      approvals,
      systemicIssues,
      bookings,
      seq: {
        case: maxNum(cases.map((c) => c.id), "C-") + 1,
        event: Math.max(0, ...events.map((e) => e.id), messages.length, outbox.length) + 1,
        si: maxNum(systemicIssues.map((s) => s.id), "SI-") + 1,
      },
    };
  } finally {
    db.close();
  }
}
