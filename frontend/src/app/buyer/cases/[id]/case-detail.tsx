"use client";
import { ArrowRightLeft, Bot, CalendarClock, CheckCircle2, Clock, FileText, Loader2, MessageSquare, ShieldAlert, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CaseProgress, PreviousReports, useCase, useCaseId } from "@/components/case-views";
import { DefectRecordCard } from "@/components/defect-record";
import { recordAvailable } from "@/lib/defect-record";
import { EmptyState, MobileHeader, PrimaryButton, primaryButtonClass, Section, UnderlineTabs } from "@/components/mobile";
import { PhotoThumb } from "@/components/photo";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { fmtHours } from "@/lib/agents";
import { answerFollowUp, canReopen, signoffDeadline } from "@/lib/api";
import { CATEGORY_LABEL, DEMO_BUYER, REPAIR_PLAN, RULES, workerName } from "@/lib/constants";
import { addDays, daysBetween, fmtDate, fmtDateTime } from "@/lib/dates";
import { BUYER_EXPLAIN } from "@/lib/status";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm last:border-0">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

const JOB_NAME: Partial<Record<Case["status"], string>> = {
  VISIT_SCHEDULED: "Inspection visit",
  EXTRA_INSPECTION: "Detailed inspection",
  REPAIR_BOOKED: "Repair",
};

/** Who is coming and when, including a hand-over to a different technician. */
function YourTechnician({ c }: { c: Case }) {
  const job = JOB_NAME[c.status];
  const slot = c.status === "REPAIR_BOOKED" ? c.repairSlot : c.visitSlot;
  if (!job || !c.technicianId) return null;
  const confirmed = c.bookingStatus !== "pending";
  const h = c.handover;
  const moved = h?.previousSlot && slot && h.previousSlot !== slot;
  return (
    <Section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{job}</h2>
        <span
          className={
            confirmed
              ? "inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200"
              : "inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200"
          }
        >
          {confirmed ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />} {confirmed ? "Confirmed" : "Awaiting confirmation"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-50 text-brand">
          <UserRound className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{workerName(c.technicianId)}</p>
          <p className="flex items-center gap-1 text-xs text-zinc-600">
            <CalendarClock className="size-3.5" /> {slot ? fmtDateTime(slot) : "Time to be confirmed"}
          </p>
        </div>
      </div>
      {c.supportId && c.status === "EXTRA_INSPECTION" && <p className="mt-2 text-xs text-zinc-600">With subcontractor {workerName(c.supportId)}</p>}
      {h && (
        <p className="mt-3 flex gap-2 rounded-xl bg-sky-50 p-2.5 text-xs text-sky-900 ring-1 ring-sky-200">
          <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Changed from {workerName(h.fromId)}, who is no longer available.{" "}
            {moved ? (
              <>
                New time: <span className="font-semibold">{fmtDateTime(slot!)}</span> (was {fmtDateTime(h.previousSlot!)}).
              </>
            ) : (
              "Your booking time stays the same."
            )}
          </span>
        </p>
      )}
    </Section>
  );
}

type Tab = "details" | "history" | "record";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
  { id: "record", label: "Defect record" },
];

export function CaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const now = useDemo((s) => s.now);
  const allMessages = useDemo((s) => s.messages);
  const messages = useMemo(() => allMessages.filter((m) => m.caseId === id).reverse(), [allMessages, id]);
  const [tab, setTab] = useState<Tab>("details");
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);

  if (!c) return <MobileHeader title="Case not found" back="/buyer/cases" />;
  const reopenable = canReopen(c, now);
  const graceEnd = c.closedAt ? addDays(c.closedAt, RULES.gracePeriodDays) : null;
  const daysLeft = c.closedAt ? Math.max(0, Math.ceil(RULES.gracePeriodDays - daysBetween(c.closedAt, now))) : 0;
  const reported = c.photos.filter((p) => p.kind === "original" || p.kind === "reopen");
  const evidence = c.photos.filter((p) => p.kind !== "original" && p.kind !== "reopen");
  const deadline = signoffDeadline(c);
  const signoffDaysLeft = Math.max(0, Math.ceil(daysBetween(now, deadline)));

  return (
    <div>
      <MobileHeader title={c.id} back="/buyer/cases" />
      <div className="sticky top-[72px] z-10 bg-white px-4 pt-2">
        <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} center />
      </div>
      <div className="space-y-4 p-4">
        {tab === "details" && (
          <>
            {/* Summary */}
            <Section>
              <PhotoThumb photo={c.photos[0]} className="aspect-[16/9] w-full" />
              <div className="mt-3 flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold leading-snug">{c.summary}</h2>
                <UrgencyBadge urgency={c.urgency} />
              </div>
              <p className="text-xs text-zinc-500">
                {c.unitId} · Reported {fmtDate(c.createdAt)}
                {c.reopenCount > 0 && <span className="font-medium text-red-700"> · Reopened {c.reopenCount}×</span>}
              </p>
              <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                <StatusBadge status={c.status} buyer />
                <p className="mt-1.5 text-sm text-zinc-700">{BUYER_EXPLAIN[c.status]}</p>
              </div>
            </Section>

            <YourTechnician c={c} />

            {/* Next step for the buyer */}
            {c.status === "INFO_NEEDED" && (
              <Section title="We need a little more information">
                <p className="text-sm text-zinc-700">{c.followUpQuestion}</p>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={2}
                  placeholder="e.g. Master bedroom, ceiling above the wardrobe"
                  className="mt-3 w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
                />
                <PrimaryButton
                  className="mt-3"
                  disabled={!answer.trim() || sending}
                  onClick={async () => {
                    setSending(true);
                    try {
                      await answerFollowUp(c.id, answer.trim());
                      setAnswer("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
                </PrimaryButton>
              </Section>
            )}
            {c.status === "VALID" && (
              <Link href={`/buyer/cases/${c.id}/book`} className={primaryButtonClass}>
                Book Repair Slot
              </Link>
            )}
            {c.status === "PENDING_SIGNOFF" && !c.signoff?.buyer && !c.signoff?.developer && (
              <p className="flex gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
                <Clock className="size-4 shrink-0" /> The repair is done. The developer is reviewing it first; we&apos;ll let you know when you can check it and sign off.
              </p>
            )}
            {c.status === "PENDING_SIGNOFF" && !c.signoff?.buyer && c.signoff?.developer && (
              <div className="space-y-2">
                <p
                  className={
                    c.signoffOverdueAt
                      ? "flex gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200"
                      : "flex gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200"
                  }
                >
                  <Clock className="size-4 shrink-0" />
                  {c.signoffOverdueAt
                    ? "The sign-off period has passed. Our team will contact you; you can still sign off below."
                    : `Please sign off by ${fmtDateTime(deadline)} (${signoffDaysLeft} day(s) left). ${
                        c.urgency === "high" ? "After that our team will follow up." : "After that the case closes automatically."
                      }`}
                </p>
                <Link href={`/buyer/cases/${c.id}/verify`} className={primaryButtonClass}>
                  Check Repair &amp; Sign Off
                </Link>
              </div>
            )}
            {c.status === "ESCALATION_PENDING" && (
              <p className="flex gap-2 rounded-2xl bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-200">
                <ShieldAlert className="size-4 shrink-0" /> Our team is reviewing whether a detailed inspection is needed. We&apos;ll update you here and by email.
              </p>
            )}
            {c.status === "CLOSED" && !c.historical && (
              <Section>
                {reopenable ? (
                  <>
                    <p className="text-sm text-zinc-700">
                      Problem came back? You can reopen this case until <span className="font-semibold">{graceEnd && fmtDate(graceEnd)}</span> ({daysLeft} day(s) left). A
                      new photo is required.
                    </p>
                    <Link
                      href={`/buyer/cases/${c.id}/reopen`}
                      className="mt-3 grid h-12 place-items-center rounded-xl border-2 border-brand text-sm font-semibold text-brand"
                    >
                      Reopen Case
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-zinc-700">The {RULES.gracePeriodDays}-day reopen period has ended. If the problem returns, please submit a new report.</p>
                )}
              </Section>
            )}

            {/* What the buyer sent */}
            <Section title="What you reported">
              <p className="whitespace-pre-line rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800">&ldquo;{c.description}&rdquo;</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {reported.map((p, i) => (
                  <PhotoThumb key={i} photo={p} className="aspect-square" />
                ))}
              </div>
            </Section>

            {/* What the AI understood */}
            <Section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Bot className="size-4 text-violet-600" /> How we categorised it
              </h2>
              <dl>
                <Row label="Category">{CATEGORY_LABEL[c.category]}</Row>
                <Row label="Type">{c.subCategory}</Row>
                <Row label="Location">{c.location || "—"}</Row>
                <Row label="Urgency">
                  <UrgencyBadge urgency={c.urgency} />
                </Row>
                <Row label="Summary">{c.summary}</Row>
              </dl>
            </Section>

            {/* Bookings */}
            <Section title="Bookings">
              <dl>
                <Row label={c.status === "EXTRA_INSPECTION" ? "Joint extra inspection" : "Inspection visit"}>{c.visitSlot ? fmtDateTime(c.visitSlot) : "—"}</Row>
                {c.preferredVisitAt && c.preferredVisitAt !== c.visitSlot && <Row label="You asked for">{fmtDateTime(c.preferredVisitAt)}</Row>}
                <Row label="Inspected by">{workerName(c.inspectorId ?? (c.repairSlot ? undefined : c.technicianId))}</Row>
                {c.supportId && <Row label="With subcontractor">{workerName(c.supportId)}</Row>}
                <Row label="Repair">
                  {c.repairSlot
                    ? `${fmtDateTime(c.repairSlot)} · ${fmtHours(c.repairHours ?? REPAIR_PLAN[c.category].hours)}`
                    : c.status === "VALID"
                      ? "Not booked yet"
                      : "—"}
                </Row>
                {c.repairSlot && <Row label="Repair by">{workerName(c.technicianId)}</Row>}
              </dl>
            </Section>

            {/* Inspection + repair */}
            {(c.verdict || c.repairNote) && (
              <Section title="Inspection & repair">
                <dl>
                  {c.verdict && (
                    <>
                      <Row label="Inspection result">{c.verdict.outcome === "VALID" ? "Defect confirmed" : "Not a defect"}</Row>
                      <Row label="Inspected on">{fmtDate(c.verdict.at)}</Row>
                    </>
                  )}
                  {c.repairedAt && <Row label="Repaired on">{fmtDate(c.repairedAt)}</Row>}
                </dl>
                {c.verdict?.note && <p className="mt-2 text-sm text-zinc-700">Technician: &ldquo;{c.verdict.note}&rdquo;</p>}
                {c.repairNote && (
                  <p className="mt-2 flex gap-1.5 text-sm text-zinc-700">
                    <Wrench className="mt-0.5 size-3.5 shrink-0 text-zinc-400" /> {c.repairNote}
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
          </>
        )}

        {tab === "history" && (
          <>
            <Section title="Progress">
              <CaseProgress c={c} />
            </Section>

            {messages.length > 0 && (
              <Section title="Updates">
                <ul className="space-y-3">
                  {messages.map((m) => (
                    <li key={m.id} className="flex gap-2">
                      <MessageSquare className="mt-0.5 size-4 shrink-0 text-brand" />
                      <div>
                        <p className="text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-zinc-600">{m.body}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400">
                          <CalendarClock className="size-3" /> {fmtDateTime(m.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <PreviousReports c={c} />
          </>
        )}

        {tab === "record" &&
          (recordAvailable(c) ? (
            <>
              <DefectRecordCard c={c} viewer={`Buyer (${DEMO_BUYER.name})`} />
              {c.closedAt && c.status === "CLOSED" && (
                <p className="-mt-2 px-1 text-xs text-zinc-500">
                  Closed {fmtDate(c.closedAt)} · reopen allowed until {graceEnd && fmtDate(graceEnd)}
                </p>
              )}
            </>
          ) : (
            <EmptyState icon={<FileText className="size-16" strokeWidth={1.5} />} text="The digital defect record is ready once your defect has been repaired." />
          ))}
      </div>
    </div>
  );
}
