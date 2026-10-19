"use client";
import { Bot, Check, CircleCheck, Mail } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { fmtDate, fmtDateTime, fmtShort } from "@/lib/dates";
import { BUYER_STEPS, buyerStepIndex } from "@/lib/status";
import { useDemo } from "@/lib/store";
import type { Case, CaseEvent } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Section } from "./mobile";

export function useCaseId() {
  return useParams<{ id: string }>().id;
}

export function useCase(id: string): Case | undefined {
  const cases = useDemo((s) => s.cases);
  return useMemo(() => cases.find((c) => c.id === id), [cases, id]);
}

export function useCaseEvents(id: string | null): CaseEvent[] {
  const events = useDemo((s) => s.events);
  return useMemo(() => (id ? events.filter((e) => e.caseId === id) : events), [events, id]);
}

/** Vertical progress list, styled after the SDP app's Construction Progress screen. */
export function CaseProgress({ c }: { c: Case }) {
  const idx = buyerStepIndex(c.status);
  const steps = c.status === "INVALID" ? ["Reported", "Inspection visit", "Not a defect — closed"] : BUYER_STEPS;
  const done = c.status === "INVALID" ? 3 : idx;
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const complete = i < done;
        const current = i === done;
        return (
          <li
            key={s}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1",
              complete ? "bg-emerald-50/60 ring-emerald-200" : current ? "bg-white ring-brand" : "bg-white ring-zinc-200",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2",
                complete ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-brand" : "border-zinc-300",
              )}
            >
              {complete && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className={cn("text-sm", complete ? "text-zinc-700" : current ? "font-semibold text-zinc-900" : "text-zinc-400")}>{s}</span>
            {current && c.status !== "CLOSED" && <span className="ml-auto text-[11px] font-medium text-brand">Now</span>}
          </li>
        );
      })}
    </ol>
  );
}

const EVENT_LABEL: Partial<Record<CaseEvent["type"], string>> = {
  "case.created": "Reported",
  "case.info_needed": "Info needed",
  "case.assigned": "Assigned",
  "verdict.recorded": "Inspection result",
  "repair.booked": "Repair booked",
  "repair.done": "Repaired",
  "verification.requested": "Sign-off requested",
  "verification.completed": "Buyer check",
  "signoff.completed": "Signed off",
  "signoff.reminder": "Sign-off reminder",
  "signoff.overdue": "Sign-off overdue",
  "booking.requested": "Booking requested",
  "booking.confirmed": "Booking confirmed",
  "booking.rejected": "Booking declined",
  "case.closed": "Closed",
  "case.reopened": "Reopened",
  "recurrence.detected": "Recurrence detected",
  "inspection.requested": "Extra inspection requested",
  "inspection.approved": "Extra inspection approved",
  "inspection.rejected": "Extra inspection rejected",
};

export function EventTimeline({ events, compact, large }: { events: CaseEvent[]; compact?: boolean; large?: boolean }) {
  if (!events.length) return <p className={cn("text-zinc-500", large ? "text-base" : "text-sm")}>No activity yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-zinc-200 pl-4">
      {[...events].reverse().map((e) => {
        const isAgent = e.type === "agent.step";
        const isEmail = e.type === "email.sent";
        return (
          <li key={e.id} className="relative">
            <span
              className={cn(
                "absolute -left-[21px] top-1 grid size-2.5 rounded-full ring-4 ring-white",
                isAgent ? "bg-violet-500" : isEmail ? "bg-sky-500" : "bg-brand",
              )}
            />
            <div className={cn("flex flex-wrap items-center gap-x-2 text-zinc-500", large ? "text-sm" : "text-[11px]")}>
              <span>{compact ? fmtShort(e.at) : fmtDateTime(e.at)}</span>
              {isAgent ? (
                <span className="inline-flex items-center gap-1 font-medium text-violet-700">
                  <Bot className="size-3" /> {e.agent ?? "System"}
                </span>
              ) : isEmail ? (
                <span className="inline-flex items-center gap-1 font-medium text-sky-700">
                  <Mail className="size-3" /> Email sent
                </span>
              ) : (
                <span className="font-medium text-zinc-600">{EVENT_LABEL[e.type] ?? "Update"}</span>
              )}
            </div>
            <p className={cn("text-zinc-800", large ? "text-base" : "text-sm")}>{e.message}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function SimilarList({ c }: { c: Case }) {
  if (!c.similar.length) return null;
  return (
    <ul className="space-y-1.5">
      {c.similar.map((s) => (
        <li key={s.caseId} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">{s.unitId}</span>
          <span className="text-zinc-700">{s.reason}</span>
          <span className="ml-auto shrink-0 text-xs text-zinc-400">{fmtDate(s.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Earlier reports of the same issue in the same unit: title and date only, in the approval-history style. Renders nothing if none. */
export function PreviousReports({ c }: { c: Case }) {
  const cases = useDemo((s) => s.cases);
  const list = useMemo(
    () => cases.filter((x) => x.id !== c.id && x.unitId === c.unitId && x.category === c.category && x.createdAt < c.createdAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [cases, c.id, c.unitId, c.category, c.createdAt],
  );
  if (!list.length) return null;
  return (
    <Section title={`Previous ${CATEGORY_LABEL[c.category].toLowerCase()} reports in unit ${c.unitId}`}>
      <ol className="space-y-3">
      {list.map((x) => (
        <li key={x.id} className="flex items-start gap-2.5">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-zinc-400" />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <p className="text-sm font-medium">{x.summary}</p>
            <span className="shrink-0 text-xs text-zinc-500">{fmtDate(x.createdAt)}</span>
          </div>
        </li>
      ))}
      </ol>
    </Section>
  );
}
