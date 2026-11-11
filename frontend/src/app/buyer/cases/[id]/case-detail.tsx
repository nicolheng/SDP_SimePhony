"use client";
import { ArrowRightLeft, Bot, CalendarClock, CheckCircle2, Clock, FileText, MessageSquare, ShieldAlert, Star, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CaseChat } from "@/components/case-chat";
import { CaseProgress, useCase, useCaseEvents, useCaseId } from "@/components/case-views";
import { ArrangingSoon } from "@/components/arranging-soon";
import { useSignoffOverdue, useUnitSignoff } from "@/components/unit-signoff";
import { TechAvatar } from "@/components/brand";
import { DefectRecordCard } from "@/components/defect-record";
import { FollowUpForm } from "@/components/follow-up-form";
import { recordAvailable } from "@/lib/defect-record";
import { EmptyState, MobileHeader, primaryButtonClass, Section, UnderlineTabs } from "@/components/mobile";
import { PhotoThumb } from "@/components/photo";
import { RatingDialog, STAR_LABEL, Stars } from "@/components/rating";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { canReopen, signoffDeadline } from "@/lib/api";
import { CATEGORY_LABEL, DEMO_BUYER, getTechnician, RULES, workerName } from "@/lib/constants";
import { addDays, daysBetween, fmtDate, fmtDateTime } from "@/lib/dates";
import { BUYER_EXPLAIN, fmtRepairHours, isOpen } from "@/lib/status";
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
  VISIT_SCHEDULED: "Scheduled Inspection",
  EXTRA_INSPECTION: "Scheduled Detailed Inspection",
  REPAIR_BOOKED: "Scheduled Repair",
};

/** Who is coming and when, including a hand-over to a different technician. */
function YourTechnician({ c }: { c: Case }) {
  const job = JOB_NAME[c.status];
  const slot = c.status === "REPAIR_BOOKED" ? c.repairSlot : c.visitSlot;
  const tech = getTechnician(c.technicianId);
  // The repair is booked automatically after a valid inspection; until a technician accepts, the buyer just waits.
  if (c.status === "VALID")
    return (
      <Section title="Scheduled Repair">
        <ArrangingSoon what="Your repair" />
      </Section>
    );
  if (!job) return null;
  const confirmed = c.bookingStatus !== "pending";
  if (!tech || !confirmed)
    return (
      <Section title={job}>
        <ArrangingSoon />
      </Section>
    );
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
        <TechAvatar tech={tech} className="size-11 shrink-0 ring-1 ring-zinc-200" iconClassName="size-6" />
        <div className="min-w-0 flex-1 text-sm">
          <p>
            <span className="font-medium">{tech.name}</span> will visit on
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-medium">
            <CalendarClock className="size-4 text-brand" /> {slot ? fmtDateTime(slot) : "Time to be confirmed"}
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

type Tab = "details" | "history" | "chat" | "record";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
  { id: "chat", label: "Chat" },
  { id: "record", label: "Defect record" },
];

export function CaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const events = useCaseEvents(id);
  const unitSignoff = useUnitSignoff(c?.unitId ?? "");
  const signoffOver = useSignoffOverdue(c?.unitId ?? "");
  const now = useDemo((s) => s.now);
  const allMessages = useDemo((s) => s.messages);
  const messages = useMemo(() => allMessages.filter((m) => m.caseId === id).reverse(), [allMessages, id]);
  const [tab, setTab] = useState<Tab>("details");
  const [rating, setRating] = useState(false);

  if (!c) return <MobileHeader title="Case Not Found" back="/buyer/cases" />;
  // IntakeAgent hasn't finished: still missing a detail, or rerunning with the buyer's answer. Its result is shown as
  // soon as IntakeAgent is done, without waiting for the booking that keeps the case SUBMITTED a little longer.
  const since = Math.max(0, ...events.filter((e) => e.type === "case.answered").map((e) => e.id));
  const intakeDone = events.some((e) => e.type === "agent.step" && e.agent === "IntakeAgent" && e.id > since);
  const assessing = c.status === "INFO_NEEDED" || (c.status === "SUBMITTED" && !intakeDone);
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
              {c.photos[0] && <PhotoThumb photo={c.photos[0]} className="mb-3 aspect-[16/9] w-full" />}
              <div className="flex items-start justify-between gap-2">
                {/* While IntakeAgent still lacks details or is rerunning with the buyer's answer, its title and
                    priority are only a first guess: show neutral wording until the assessment is final. */}
                <h2 className="text-lg font-semibold leading-snug">{assessing ? "Your report" : c.summary}</h2>
                {!assessing && <UrgencyBadge urgency={c.urgency} />}
              </div>
              <p className="text-xs text-zinc-500">
                {c.unitId} · Reported {fmtDate(c.createdAt)}
                {c.reopenCount > 0 && <span className="font-medium text-red-700"> · Reopened {c.reopenCount}×</span>}
              </p>
              <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                <StatusBadge status={c.status} buyer of={c} />
                <p className="mt-1.5 text-sm text-zinc-700">
                  {c.status === "PENDING_SIGNOFF" && c.signoff?.developer && !c.signoff?.buyer
                    ? c.verificationStatus === "verified"
                      ? "You verified this repair. Sign off your unit from My Defects once every repair is verified."
                      : unitSignoff && !unitSignoff.canVerify
                        ? "The developer has approved this repair and is still reviewing the other repairs in your unit. You can verify once all are approved."
                        : "The developer has approved the repair. Please verify it."
                    : (BUYER_EXPLAIN[c.status] ?? "We're working on your case.")}
                </p>
                {(c.status === "VALID" || c.status === "REPAIR_BOOKED") && !!c.repairHours && (
                  <p className="mt-1.5 text-xs text-zinc-700">
                    Expected repair duration: <span className="font-semibold">{fmtRepairHours(c.repairHours)}</span>
                  </p>
                )}
                {c.repairClock && !c.repairClock.doneAt && isOpen(c.status) && (
                  <p className="mt-1.5 text-xs text-zinc-500">
                    The developer aims to repair confirmed defects by {fmtDate(c.repairClock.dueAt)}.
                  </p>
                )}
              </div>
            </Section>

            <YourTechnician c={c} />

            {/* Next step for the buyer */}
            {c.status === "INFO_NEEDED" && (
              <Section title="We Need a Little More Information">
                <p className="text-sm text-zinc-700">{c.followUpQuestion}</p>
                <FollowUpForm caseId={c.id} />
              </Section>
            )}
            {c.status === "PENDING_SIGNOFF" && !c.signoff?.buyer && c.signoff?.developer && (!unitSignoff || unitSignoff.canVerify || !!c.signoffOverdueAt) && (
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
                    ? "The sign-off period has passed. Our team will contact you."
                    : `Please verify and sign off your unit by ${fmtDate(deadline)} (${signoffDaysLeft} day(s) left). ${
                        c.urgency === "high" ? "After that our team will follow up." : "After that the defects close automatically."
                      }`}
                </p>
                {c.signoffOverdueAt || signoffOver ? null : c.verificationStatus === "verified" ? (
                  <Link href="/buyer/cases" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    <CheckCircle2 className="size-4" /> Verified · Sign off your unit in My Defects
                  </Link>
                ) : (
                  <Link href={`/buyer/cases/${c.id}/verify`} className={primaryButtonClass}>
                    Verify Repair
                  </Link>
                )}
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

            {c.signoff?.buyer && !c.historical && (
              <Section>
                {c.rating ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-zinc-700">Your rating: {STAR_LABEL[c.rating.stars]}</p>
                    <Stars value={c.rating.stars} className="text-lg" />
                  </div>
                ) : (
                  <button type="button" onClick={() => setRating(true)} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-brand">
                    <Star className="size-4" /> Rate this repair
                  </button>
                )}
              </Section>
            )}
            {rating && <RatingDialog unitId={c.unitId} onDone={() => setRating(false)} />}

            {/* What the buyer sent */}
            <Section title="Your Report">
              <ul className="space-y-2">
                {c.description
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i} className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800">
                      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{i === 0 ? "Initial report" : "Additional detail"}</p>
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

            {/* What the AI understood */}
            <Section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Bot className="size-4 text-violet-600" /> Defect Assessment
              </h2>
              {c.status === "INFO_NEEDED" ? (
                // Only a guess until the buyer answers the follow-up question.
                <p className="text-sm text-zinc-700">We&apos;ll show our assessment once you&apos;ve answered the question above.</p>
              ) : assessing ? (
                <p className="text-sm text-zinc-700">Checking your report…</p>
              ) : (
                <dl>
                  <Row label="Category">{CATEGORY_LABEL[c.category]}</Row>
                  <Row label="Defect type">{c.subCategory}</Row>
                  <Row label="Location">{c.location || "—"}</Row>
                  <Row label="Priority">
                    <UrgencyBadge urgency={c.urgency} />
                  </Row>
                </dl>
              )}
            </Section>

            {/* Inspection + repair */}
            {(c.verdict || c.repairNote) && (
              <Section title="Inspection & Repair">
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
          </>
        )}

        {tab === "chat" && <CaseChat c={c} viewer="buyer" onClose={() => setTab("details")} />}

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
