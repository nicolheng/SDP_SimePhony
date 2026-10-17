"use client";
import { Bot, Check, Mail } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { fmtDate, fmtDateTime, fmtShort } from "@/lib/dates";
import { BUYER_STEPS, buyerStepIndex } from "@/lib/status";
import { useDemo } from "@/lib/store";
import type { Case, CaseEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const steps = c.status === "INVALID" ? ["Reported", "Inspection", "Not a defect — closed"] : BUYER_STEPS;
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

export function EventTimeline({ events, compact }: { events: CaseEvent[]; compact?: boolean }) {
  if (!events.length) return <p className="text-sm text-zinc-500">No activity yet.</p>;
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
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
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
                <code className="text-[10px] text-zinc-400">{e.type}</code>
              )}
            </div>
            <p className="text-sm text-zinc-800">{e.message}</p>
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
