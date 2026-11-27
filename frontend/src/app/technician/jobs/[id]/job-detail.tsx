"use client";
import {
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
import { CaseChat } from "@/components/case-chat";
import { DefectRecordCard } from "@/components/defect-record";
import { CasePinMap } from "@/components/floor-plan";
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
import { PhotoInput, PhotoRounds, PhotoThumb } from "@/components/photo";
import { REPORT_PHOTO_KINDS, WORK_PHOTO_KINDS } from "@/lib/photos";
import { RepairClockBadge } from "@/components/repair-clock";
import { SimilarDefects } from "@/components/similar-defects";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { SwipePager } from "@/components/swipe-pager";
import { markRepaired, recordVerdict } from "@/lib/api";
import { CATEGORY_LABEL, getUnit, workerLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtRepairHours, REPAIR_DURATIONS, TECH_TODO } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useTechnicianId } from "@/lib/session";
import { useDemo, useOffline } from "@/lib/store";
import { jobSlot } from "../../use-my-jobs";
import { JobAssignment } from "./assignment";
import { SuggestedRepair, SuggestedVerify, SuggestedVerifyMethod } from "@/components/suggested-repair";
import {
  INVALID_REASON_CHOICES,
  INVALID_REASON_LABEL,
  methodFor,
  useKb,
} from "@/lib/kb";

const OTHER_REASON = "OTHER";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm last:border-0">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{children}</dd>
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
  "repair.rejected",
  "verification.completed",
  "signoff.completed",
  "signoff.overdue",
  "case.reopened",
  "inspection.approved",
  "case.closed",
]);

type Tab = "details" | "history" | "chat" | "record";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
  { id: "chat", label: "Chat" },
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
  const [hours, setHours] = useState<2 | 4 | 8 | null>(null);
  // Answering Invalid: pick a reason (or Other with a short note) before confirming.
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [otherNote, setOtherNote] = useState("");
  const kb = useKb();
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
            {c.status === "PENDING_REVIEW"
              ? "This booking was cancelled while SDP staff review the case. You'll be notified if it is booked with you again."
              : "This job is assigned to another technician."}
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
  const sameStack = c.similar.some((s) => s.unitId !== c.unitId);
  // Inspection visit: how to verify the defect (its limit rules). After Valid, until the repair is done: the suggested repair.
  const atInspection = c.status === "VISIT_SCHEDULED" || c.status === "EXTRA_INSPECTION";
  const verifyRules = kb && atInspection ? kb.rules.filter((r) => r.category === c.category) : [];
  // A defect type with no limit rule has a verify method instead.
  const verifyMethod =
    kb && atInspection && !verifyRules.length ? kb.verifyMethods?.find((v) => v.category === c.category) : undefined;
  const repairMethod =
    kb && (c.status === "VALID" || c.status === "REPAIR_BOOKED") ? methodFor(kb, c.category) : undefined;
  const suggested = verifyRules.length
    ? { title: "Suggested Verify Method", content: <SuggestedVerify rules={verifyRules} /> }
    : verifyMethod
      ? { title: "Suggested Verify Method", content: <SuggestedVerifyMethod method={verifyMethod} /> }
      : repairMethod
      ? { title: "Suggested Repair", content: <SuggestedRepair method={repairMethod} /> }
      : undefined;

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    try {
      await fn();
      setNote("");
      setPhoto(null);
      setRejecting(false);
      setReason(null);
      setOtherNote("");
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
                  2. Findings <span className="text-brand">*</span>
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
                  3. Expected Repair Duration <span className="text-brand">*</span>
                </p>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {REPAIR_DURATIONS.map((d) => (
                    <button
                      key={d.hours}
                      type="button"
                      onClick={() => setHours(d.hours)}
                      className={cn(
                        "h-11 rounded-xl px-1 text-xs font-semibold ring-1 transition",
                        hours === d.hours ? "bg-brand text-white ring-brand" : "bg-white text-zinc-700 ring-zinc-200 hover:ring-brand",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="mb-1.5 mt-2 text-xs font-medium text-zinc-500">
                  4. Defect Validity <span className="text-brand">*</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!note.trim() || !hours || busy || offline}
                    onClick={() =>
                      run(
                        () => recordVerdict(c.id, "VALID", note.trim(), photo, hours ?? undefined),
                        "Marked valid: the repair is being booked",
                      )
                    }
                    className="h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
                  >
                    Valid
                  </button>
                  <button
                    type="button"
                    disabled={busy || offline}
                    aria-pressed={rejecting}
                    onClick={() => setRejecting(!rejecting)}
                    className={cn(
                      "h-12 rounded-xl border-2 border-zinc-800 text-sm font-semibold disabled:border-zinc-200 disabled:text-zinc-400",
                      rejecting ? "bg-zinc-100 text-zinc-800" : "text-zinc-800",
                    )}
                  >
                    Invalid
                  </button>
                </div>
                {/* Invalid always records a reason: tap one, or Other with a short note. */}
                {rejecting && (
                  <div className="mt-3 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                    <p className="mb-2 text-sm font-semibold text-zinc-900">
                      Why is it not a defect? <span className="text-brand">*</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[...INVALID_REASON_CHOICES, OTHER_REASON].map((code) => (
                        <button
                          key={code}
                          type="button"
                          aria-pressed={reason === code}
                          onClick={() => setReason(code)}
                          className={cn(
                            "min-h-12 rounded-xl px-2 text-sm ring-1 transition",
                            reason === code
                              ? "bg-red-50 text-brand ring-2 ring-brand"
                              : "bg-white text-zinc-800 ring-zinc-300 hover:ring-zinc-500",
                          )}
                        >
                          {code === OTHER_REASON ? "Other" : INVALID_REASON_LABEL[code]}
                        </button>
                      ))}
                    </div>
                    {reason === OTHER_REASON && (
                      <input
                        value={otherNote}
                        onChange={(e) => setOtherNote(e.target.value)}
                        maxLength={120}
                        placeholder="Short reason"
                        className="mt-2 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-brand"
                      />
                    )}
                    <button
                      type="button"
                      disabled={
                        !reason ||
                        (reason === OTHER_REASON && !otherNote.trim()) ||
                        busy ||
                        offline
                      }
                      onClick={() => {
                        const why =
                          reason === OTHER_REASON
                            ? otherNote.trim()
                            : INVALID_REASON_LABEL[reason!];
                        run(
                          () =>
                            recordVerdict(
                              c.id,
                              "INVALID",
                              [why, note.trim()].filter(Boolean).join(". ").slice(0, 500),
                              photo,
                              undefined,
                              { reasonCode: reason === OTHER_REASON ? undefined : reason! },
                            ),
                          "Marked invalid: sent to SDP to review",
                        );
                      }}
                      className="mt-3 h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
                    >
                      Confirm Invalid
                    </button>
                  </div>
                )}
              </Section>
            )}

            {repairing && (
              <Section title="Repair Completion">
                <p className="mb-1.5 text-xs font-medium text-zinc-500">
                  1. Photo
                </p>
                <PhotoInput value={photo} onChange={setPhoto} />
                <p className="mb-1.5 mt-4 text-xs font-medium text-zinc-500">
                  2. Description of Repair Works <span className="text-brand">*</span>
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

            {/* Your record (after the visit), the buyer's report and the Intake Agent's assessment: swipe or tap the arrows. */}
            <Section>
              <SwipePager
                fit
                pages={[
                  // The technician's own record comes first once there is one (after the inspection visit).
                  ...(c.verdict || c.repairNote
                    ? [
                        {
                          title: "Your Record",
                          content: (
                            <>
                            <dl>
                              {c.verdict && (
                                <Row label="Verdict">
                                  {c.verdict.outcome === "VALID"
                                    ? `Valid · ${fmtDate(c.verdict.at)}`
                                    : `Invalid · ${fmtDate(c.verdict.at)}`}
                                </Row>
                              )}
                              {c.verdict?.outcome === "INVALID" && c.verdict.reasonCode && (
                    <Row label="Reason">
                      {INVALID_REASON_LABEL[c.verdict.reasonCode] ?? c.verdict.reasonCode}
                    </Row>
                  )}
                  {c.verdict?.outcome === "VALID" && !!c.repairHours && (
                                <Row label="Expected repair">{fmtRepairHours(c.repairHours)}</Row>
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
                            <PhotoRounds photos={c.photos} kinds={WORK_PHOTO_KINDS} className="mt-3" gridClass="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2" thumbClass="aspect-[4/3] w-full" />
              
                            </>
                          ),
                        },
                      ]
                    : []),
                  {
                    title: "Defect Report",
                    content: (
                      <>
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
                                <p className="mb-0.5 text-xs font-medium text-zinc-400">
                                  {i === 0 ? "Initial Report" : "Additional Detail"}
                                </p>
                                {line}
                              </li>
                            ))}
                        </ul>
                        <PhotoRounds photos={c.photos} kinds={REPORT_PHOTO_KINDS} className="mt-3" gridClass="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2" thumbClass="aspect-[4/3] w-full" />
                      </>
                    ),
                  },
                  {
                    title: "Defect Assessment",
                    content: (
                      <>
                        <dl>
                          <Row label="Category">{CATEGORY_LABEL[c.category]}</Row>
                          <Row label="Defect type">{c.subCategory}</Row>
                          <Row label="Location">{c.location || "—"}</Row>
                          <Row label="Priority">
                            <UrgencyBadge urgency={c.urgency} />
                          </Row>
                        </dl>
                        <CasePinMap unitId={c.unitId} pin={c.pin} className="mt-3" />
                      </>
                    ),
                  },
                ]}
              />
            </Section>

            {/* What the other agents worked out for this job: one swipe card (brief views, then same-stack defects). */}
            {(c.inspectionBrief || sameStack || suggested) && (
              <Section>
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-violet-600" /> AI Assistance
                </h2>
                <InspectionBriefView
                  c={c}
                  interactive={inspecting}
                  paged
                  nearby={sameStack ? <SimilarDefects c={c} /> : undefined}
                  suggested={suggested}
                />
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

        {tab === "chat" && <CaseChat c={c} viewer="technician" onClose={() => setTab("details")} />}

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
