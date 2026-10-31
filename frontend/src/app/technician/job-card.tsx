"use client";
import { CalendarClock, ChevronRight, ClipboardCheck, Hammer, ScrollText } from "lucide-react";
import Link from "next/link";
import { PhotoThumb } from "@/components/photo";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { fmtDateTime } from "@/lib/dates";
import { TECH_TODO } from "@/lib/status";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";
import { jobKind, jobSlot } from "./use-my-jobs";

export function JobCard({ c }: { c: Case }) {
  const kind = jobKind(c);
  const repair = c.status === "REPAIR_BOOKED";
  return (
    <Link href={`/technician/jobs/${c.id}`} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
      <div className="relative shrink-0">
        <PhotoThumb photo={c.photos[0]} className="size-20" label={false} zoom={false} />
        <span className={cn("absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full ring-2 ring-white", repair ? "bg-sky-600 text-white" : "bg-amber-500 text-white")}>
          {repair ? <Hammer className="size-3.5" /> : <ClipboardCheck className="size-3.5" />}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">{kind}</span>
          <UrgencyBadge urgency={c.urgency} />
        </div>
        <p className="truncate font-semibold">{c.summary}</p>
        <p className="text-xs text-zinc-500">
          {c.unitId} · {c.id}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
          <CalendarClock className="size-3.5" /> {fmtDateTime(jobSlot(c))}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={c.status} />
          {c.bookingStatus === "pending" && TECH_TODO.includes(c.status) && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300">
              {c.handover ? "Handed over · accept?" : "New · accept?"}
            </span>
          )}
          {c.inspectionBrief && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
              <ScrollText className="size-3" /> AI brief
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="size-4 self-center text-zinc-400" />
    </Link>
  );
}
