"use client";
import {
  Bot,
  CalendarClock,
  FileText,
  History,
  Lock,
  MapPin,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  EventTimeline,
  PreviousReports,
  useCase,
  useCaseEvents,
  useCaseId,
} from "@/components/case-views";
import { DefectRecordCard } from "@/components/defect-record";
import { buyerName, recordAvailable } from "@/lib/defect-record";
import { InspectionBriefView } from "@/components/inspection-brief";
import {
  EmptyState,
  MobileHeader,
  PrimaryButton,
  primaryButtonClass,
  Section,
  UnderlineTabs,
} from "@/components/mobile";
import { PhotoInput, PhotoThumb } from "@/components/photo";
import { RepairClockBadge } from "@/components/repair-clock";
import { SimilarDefects } from "@/components/similar-defects";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { markRepaired, recordVerdict } from "@/lib/api";
import { CATEGORY_LABEL, getUnit, workerLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { TECH_TODO } from "@/lib/status";
import { useTechnicianId } from "@/lib/session";
import { useDemo, useOffline } from "@/lib/store";
import { jobSlot } from "../../use-my-jobs";
import { JobAssignment } from "./assignment";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm last:border-0">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function AgentCard({
  agent,
  children,
}: {
  agent: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-violet-50/60 p-3 ring-1 ring-violet-100">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
        <Bot className="size-3.5" /> {agent}
      </p>
      <div className="text-sm text-zinc-800">{children}</div>
    </div>
  );
}

const TECH_ACTIVITY = new Set<string>([
  "case.assigned",
  "booking.confirmed",
  "booking.rejected",
  "verdict.recorded",
  "repair.booked",
  "repair.done",
  "verification.completed",
  "signoff.completed",
  "signoff.overdue",
  "case.reopened",
  "inspection.approved",
  "case.closed",
]);

type Tab = "details" | "history" | "record";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
  { id: "record", label: "Defect record" },
];

export function JobDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const me = useTechnicianId();
  const events = useCaseEvents(id);
  // Only what matters for the job: assignments, bookings, results, sign-offs, and the briefs/checklists agents produced for it.
  const agentEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          TECH_ACTIVITY.has(e.type) ||
          (e.type === "agent.step" &&
            (e.agent === "InitialInspectionAgent" ||
              e.agent === "VerificationAgent")),
      ),
    [events],
  );
  const [tab, setTab] = useState<Tab>("details");
  const cases = useDemo((st) => st.cases);
  const hasPrevious = useMemo(
    () =>
      !!c &&
      cases.some(
        (x) =>
          x.id !== c.id &&
          x.unitId === c.unitId &&
          x.category === c.category &&
          x.createdAt < c.createdAt,
      ),
    [cases, c],
  );
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const now = useDemo((st) => st.now);

  if (!c) return <MobileHeader title="Job Not Found" back="/technician/jobs" />;
  if (c.technicianId !== me && c.supportId !== me)
    return (
      <div>
        <MobileHeader title={c.id} back="/technician/jobs" />
        <div className="p-6 text-center">
          <Lock className="mx-auto size-10 text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-600">
            This job is assigned to another technician.
          </p>
          <Link
            href="/technician/jobs"
            className={`${primaryButtonClass} mt-5`}
          >
            Back to My Jobs
          </Link>
        </div>
      </div>
    );

  const unit = getUnit(c.unitId);
  // On a joint extra inspection the in-house technician leads and records the result; the subcontractor attends.
  const attending = c.supportId === me && c.technicianId !== me;
  // The assigned worker accepts (or hands over) the job before working on it.
  const myJob = c.technicianId === me && TECH_TODO.includes(c.status);
  const accepted = c.bookingStatus !== "pending";
  const inspecting =
    (c.status === "VISIT_SCHEDULED" || c.status === "EXTRA_INSPECTION") &&
    !attending &&
    accepted;
  const repairing = c.status === "REPAIR_BOOKED" && accepted;
  const reported = c.photos.filter(
    (p) => p.kind === "original" || p.kind === "reopen",
  );
  const evidence = c.photos.filter(
    (p) => p.kind !== "original" && p.kind !== "reopen",
  );
  const sameStack = c.similar.some((s) => s.unitId !== c.unitId);

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    try {
      await fn();
      setNote("");
      setPhoto(null);
      toast.success(msg);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <MobileHeader title={c.id} back="/technician/jobs" />
      <div className="sticky top-[72px] z-10 bg-white px-4 pt-2">
        <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} center />
      </div>
      <div className="space-y-4 p-4">
        {tab === "details" && (
          <>
            {/* Summary */}
            <Section>
              {c.photos[0] && (
                <PhotoThumb
                  photo={c.photos[0]}
                  className="mb-3 aspect-[16/9] w-full"
                />
              )}
              <div className="flex items-center gap-1.5">
                <StatusBadge status={c.status} />
                <UrgencyBadge urgency={c.urgency} />
              </div>
              <h2 className="text-lg font-semibold leading-snug">
                {c.summary}
              </h2>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li className="flex items-center gap-2">
                  <UserRound className="size-4 text-zinc-400" /> {buyerName(c)}
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 text-zinc-400" /> {c.unitId} · Block{" "}
                  {unit.block}, level {unit.floor} ·{" "}
                  {c.location || "location not given"}
                </li>
                <li className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-zinc-400" />{" "}
                  {fmtDateTime(jobSlot(c))}
                </li>
                {c.repairClock && !c.repairClock.doneAt && (
                  <li className="pt-1.5">
                    <RepairClockBadge c={c} now={now} />
                  </li>
                )}
              </ul>
            </Section>

            {/* Actions */}
            {myJob && <JobAssignment c={c} me={me} />}
            {attending && c.status === "EXTRA_INSPECTION" && (
              <p className="rounded-2xl bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-200">
                Joint extra inspection led by{" "}
                <span className="font-semibold">
                  {workerLabel(c.technicianId)}
                </span>
                , who records the result. Review the brief below; if the repair
                needs your trade, it will be allocated to you when the buyer
                books it.
              </p>
            )}
            {inspecting && (
              <Section
                title={
                  c.status === "EXTRA_INSPECTION"
                    ? "Detailed Inspection Findings"
                    : "Inspection Findings"
                }
              >
                <p className="mb-1.5 text-xs font-medium text-zinc-500">
                  1. Photo
                </p>
                <PhotoInput value={photo} onChange={setPhoto} />
                <p className="mb-1.5 mt-4 text-xs font-medium text-zinc-500">
                  2. Findings *
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Tell us what is found."
                  className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
                />
                <p className="-mt-1 text-right text-xs text-zinc-400">
                  {note.length} / 500
                </p>
                <p className="mb-1.5 mt-2 text-xs font-medium text-zinc-500">
                  3. Defect validity *
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!note.trim() || busy || offline}
                    onClick={() =>
                      run(
                        () => recordVerdict(c.id, "VALID", note.trim(), photo),
                        "Marked valid: buyer asked to book a repair",
                      )
                    }
                    className="h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
                  >
                    Valid
                  </button>
                  <button
                    type="button"
                    disabled={!note.trim() || busy || offline}
                    onClick={() =>
                      run(
                        () =>
                          recordVerdict(c.id, "INVALID", note.trim(), photo),
                        "Marked invalid: case closed",
                      )
                    }
                    className="h-12 rounded-xl border-2 border-zinc-800 text-sm font-semibold text-zinc-800 disabled:border-zinc-200 disabled:text-zinc-400"
                  >
                    Invalid
                  </button>
                </div>
              </Section>
            )}

            {repairing && (
              <Section title="Repair Completion">
                <p className="mb-1.5 text-xs font-medium text-zinc-500">
                  1. Photo
                </p>
                <PhotoInput value={photo} onChange={setPhoto} />
                <p className="mb-1.5 mt-4 text-xs font-medium text-zinc-500">
                  2. Description of repair works *
                </p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Describe the repair works carried out."
                  className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
                />
                <p className="-mt-1 text-right text-xs text-zinc-400">
                  {note.length} / 500
                </p>
                <p className="mb-1.5 mt-2 text-xs font-medium text-zinc-500">
                  3. Confirmation
                </p>
                <PrimaryButton
                  disabled={!note.trim() || busy}
                  onClick={() =>
                    run(
                      () => markRepaired(c.id, note.trim(), photo),
                      "Marked repaired: buyer asked to sign off",
                    )
                  }
                >
                  Mark Repaired
                </PrimaryButton>
              </Section>
            )}

            {/* Buyer's report */}
            <Section title="Defect Report">
              <ul className="space-y-2">
                {c.description
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <li
                      key={i}
                      className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800"
                    >
                      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        {i === 0 ? "Initial report" : "Additional detail"}
                      </p>
                      {line}
                    </li>
                  ))}
              </ul>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {reported.map((p, i) => (
                  <PhotoThumb key={i} photo={p} className="aspect-square" />
                ))}
              </div>
            </Section>

            {/* Intake Agent's assessment: same layout as the buyer's Defect Assessment */}
            <Section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Bot className="size-4 text-violet-600" /> Defect Assessment
              </h2>
              <dl>
                <Row label="Category">{CATEGORY_LABEL[c.category]}</Row>
                <Row label="Defect type">{c.subCategory}</Row>
                <Row label="Location">{c.location || "—"}</Row>
                <Row label="Priority">
                  <UrgencyBadge urgency={c.urgency} />
                </Row>
              </dl>
            </Section>

            {/* What the other agents worked out for this job */}
            {(c.inspectionBrief || sameStack) && (
              <Section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-violet-600" /> AI Assistance
                </h2>
                <div className="space-y-3">
                  {c.inspectionBrief && (
                    <AgentCard agent="Inspection Brief">
                      <InspectionBriefView c={c} interactive={inspecting} />
                    </AgentCard>
                  )}
                  {sameStack && (
                    <AgentCard agent="Similar Defects in the Same Stack">
                      <SimilarDefects c={c} />
                    </AgentCard>
                  )}
                </div>
              </Section>
            )}

            {/* Inspection, repair and sign-off record */}
            {(c.verdict || c.repairNote) && (
              <Section title="Your Record">
                <dl>
                  {c.verdict && (
                    <Row label="Verdict">
                      {c.verdict.outcome === "VALID"
                        ? `Valid · ${fmtDate(c.verdict.at)}`
                        : `Invalid · ${fmtDate(c.verdict.at)}`}
                    </Row>
                  )}
                  {c.repairedAt && (
                    <Row label="Repaired">{fmtDate(c.repairedAt)}</Row>
                  )}
                  {c.reopenCount > 0 && (
                    <Row label="Reopened">{c.reopenCount}×</Row>
                  )}
                </dl>
                {c.verdict?.note && (
                  <p className="mt-2 text-sm text-zinc-700">
                    Inspection: {c.verdict.note}
                  </p>
                )}
                {c.repairNote && (
                  <p className="mt-1 text-sm text-zinc-700">
                    Repair: {c.repairNote}
                  </p>
                )}
                {evidence.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {evidence.map((p, i) => (
                      <PhotoThumb key={i} photo={p} className="aspect-square" />
                    ))}
                  </div>
                )}
              </Section>
            )}

            {c.status === "ESCALATION_PENDING" && (
              <p className="flex gap-2 rounded-2xl bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-200">
                <ShieldAlert className="size-4 shrink-0" /> SDP staff are
                reviewing an extra inspection for this recurring defect.
              </p>
            )}
          </>
        )}

        {tab === "history" && (
          <>
            {agentEvents.length > 0 && (
              <Section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <History className="size-4 text-zinc-500" /> Progress
                </h2>
                <EventTimeline events={agentEvents} compact />
              </Section>
            )}
            <PreviousReports c={c} />
            {!agentEvents.length && !hasPrevious && (
              <EmptyState
                icon={<History className="size-16" strokeWidth={1.5} />}
                text="No activity on this job yet."
              />
            )}
          </>
        )}

        {tab === "record" &&
          (recordAvailable(c) ? (
            <DefectRecordCard
              c={c}
              viewer={`${me.startsWith("SC-") ? "Subcontractor" : "Technician"} (${workerLabel(me)})`}
            />
          ) : (
            <EmptyState
              icon={<FileText className="size-16" strokeWidth={1.5} />}
              text="The digital defect record is ready once the defect has been repaired."
            />
          ))}
      </div>
    </div>
  );
}
