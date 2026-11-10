"use client";
import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PhotoThumb } from "@/components/photo";
import { RepairClockBadge } from "@/components/repair-clock";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";

/** List card shared by the buyer's My Defects and the technician's My Jobs:
 *  case ID, category, report date/time, then status and repair-clock (DLP) badges. */
export function DefectCard({ c, href, buyer }: { c: Case; href: string; buyer?: boolean }) {
  const now = useDemo((s) => s.now);
  return (
    <Link href={href} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
      <PhotoThumb photo={c.photos[0]} className="size-20 shrink-0" label={false} zoom={false} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{c.id}</p>
        <p className="text-xs text-zinc-500">{CATEGORY_LABEL[c.category]}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
          <CalendarClock className="size-3.5" /> {fmtDateTime(c.createdAt)}
        </p>
        {/* One line: status and DLP badges are slightly compact so they fit side by side on a phone. */}
        <div className="mt-1.5 flex flex-nowrap items-center gap-1">
          <StatusBadge status={c.status} buyer={buyer} of={c} className="px-1.5 text-[11px]" />
          <RepairClockBadge c={c} now={now} className="px-1.5 text-[11px]" />
        </div>
      </div>
      <ChevronRight className="size-4 self-center text-zinc-400" />
    </Link>
  );
}
