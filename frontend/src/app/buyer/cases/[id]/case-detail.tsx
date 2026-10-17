"use client";
import { CalendarClock, History, Loader2, MessageSquare, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CaseProgress, SimilarList, useCase, useCaseId } from "@/components/case-views";
import { MobileHeader, PrimaryButton, primaryButtonClass, Section } from "@/components/mobile";
import { PhotoThumb } from "@/components/photo";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { answerFollowUp, canReopen } from "@/lib/api";
import { CATEGORY_LABEL, getTechnician, RULES } from "@/lib/constants";
import { daysBetween, fmtDate, fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";

export function CaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const now = useDemo((s) => s.now);
  const allMessages = useDemo((s) => s.messages);
  const messages = useMemo(() => allMessages.filter((m) => m.caseId === id).reverse(), [allMessages, id]);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);

  if (!c) return <MobileHeader title="Case not found" back="/buyer/cases" />;
  const tech = getTechnician(c.technicianId);
  const reopenable = canReopen(c, now);
  const daysLeft = c.closedAt ? Math.max(0, Math.ceil(RULES.gracePeriodDays - daysBetween(c.closedAt, now))) : 0;

  return (
    <div>
      <MobileHeader title={c.id} back="/buyer/cases" />
      <div className="space-y-4 p-4">
        <Section>
          <div className="flex gap-3">
            <PhotoThumb photo={c.photos[0]} className="size-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{c.summary}</p>
                <UrgencyBadge urgency={c.urgency} />
              </div>
              <p className="text-xs text-zinc-500">
                {CATEGORY_LABEL[c.category]} · {c.location || "Location pending"}
              </p>
              <p className="text-xs text-zinc-500">Reported {fmtDate(c.createdAt)}</p>
              <StatusBadge status={c.status} buyer className="mt-1.5" />
            </div>
          </div>
          {c.reopenCount > 0 && <p className="mt-3 text-xs font-medium text-red-700">Reopened {c.reopenCount}×</p>}
        </Section>

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
                await answerFollowUp(c.id, answer.trim());
                setAnswer("");
                setSending(false);
              }}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
            </PrimaryButton>
          </Section>
        )}

        {(c.status === "VISIT_SCHEDULED" || c.status === "EXTRA_INSPECTION") && tech && c.visitSlot && (
          <Section>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 text-brand" /> {c.status === "EXTRA_INSPECTION" ? "Detailed inspection" : "Inspection visit"}
            </p>
            <p className="mt-1 text-sm text-zinc-700">
              {tech.name} · {fmtDateTime(c.visitSlot)}
            </p>
          </Section>
        )}

        {c.status === "VALID" && (
          <Section title="Defect confirmed">
            <p className="text-sm text-zinc-700">{c.verdict?.note}</p>
            <Link href={`/buyer/cases/${c.id}/book`} className={`${primaryButtonClass} mt-3`}>
              Book Repair Slot
            </Link>
          </Section>
        )}

        {c.status === "INVALID" && (
          <Section title="Inspection result">
            <p className="text-sm text-zinc-700">The technician assessed this as not a defect: &ldquo;{c.verdict?.note}&rdquo;</p>
            <p className="mt-2 text-xs text-zinc-500">This case is closed. If the problem gets worse or changes, please submit a new report.</p>
          </Section>
        )}

        {c.status === "REPAIR_BOOKED" && c.repairSlot && (
          <Section>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 text-brand" /> Repair booked
            </p>
            <p className="mt-1 text-sm text-zinc-700">
              {tech?.name} · {fmtDateTime(c.repairSlot)}
            </p>
          </Section>
        )}

        {c.status === "PENDING_VERIFICATION" && (
          <Section title="Repair completed — please check it">
            <p className="text-sm text-zinc-700">Go through a short checklist made for your defect, then confirm whether it is fixed.</p>
            <Link href={`/buyer/cases/${c.id}/verify`} className={`${primaryButtonClass} mt-3`}>
              Verify Repair
            </Link>
          </Section>
        )}

        {c.status === "ESCALATION_PENDING" && (
          <Section>
            <p className="flex items-center gap-2 text-sm font-semibold text-violet-700">
              <ShieldAlert className="size-4" /> Under review
            </p>
            <p className="mt-1 text-sm text-zinc-700">Because this problem has come back, our team is reviewing whether a detailed inspection is needed.</p>
          </Section>
        )}

        {c.status === "CLOSED" && (
          <Section title="Case closed">
            {reopenable ? (
              <>
                <p className="text-sm text-zinc-700">
                  Problem came back? You can reopen this case for <span className="font-semibold">{daysLeft} more day(s)</span>.
                </p>
                <Link href={`/buyer/cases/${c.id}/reopen`} className="mt-3 grid h-12 place-items-center rounded-xl border-2 border-brand text-sm font-semibold text-brand">
                  Reopen Case
                </Link>
              </>
            ) : (
              <p className="text-sm text-zinc-700">The {RULES.gracePeriodDays}-day reopen period has ended. If the problem returns, please submit a new report.</p>
            )}
          </Section>
        )}

        <Section title="Progress">
          <CaseProgress c={c} />
        </Section>

        {c.similar.some((s) => s.unitId === c.unitId) && (
          <Section>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-amber-600" /> Linked history
            </p>
            <SimilarList c={{ ...c, similar: c.similar.filter((s) => s.unitId === c.unitId) }} />
          </Section>
        )}

        <Section title="Photos">
          <div className="grid grid-cols-3 gap-2">
            {c.photos.map((p, i) => (
              <PhotoThumb key={i} photo={p} className="aspect-square" />
            ))}
          </div>
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
                    <p className="mt-0.5 text-[11px] text-zinc-400">{fmtDateTime(m.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
