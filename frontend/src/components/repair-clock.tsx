import { Timer } from "lucide-react";
import { RULES } from "@/lib/constants";
import { daysBetween, fmtDate } from "@/lib/dates";
import { isOpen } from "@/lib/status";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

type Clock = { text: string; tone: "green" | "amber" | "red" | "gray"; hint: string };

/** Where a case stands on the statutory repair clock (RULES.repairDaysFromNotice from the buyer's notice). */
export function repairClockState(c: Case, now: string): Clock | null {
  const k = c.repairClock;
  if (!k) return null;
  const days = RULES.repairDaysFromNotice ?? 30;
  const hint = `Repair due ${fmtDate(k.dueAt)}: ${days} days from the notice on ${fmtDate(k.noticeAt)}`;
  if (k.doneAt) {
    const took = Math.max(0, Math.round(daysBetween(k.noticeAt, k.doneAt)));
    return new Date(k.doneAt) <= new Date(k.dueAt)
      ? { text: `Repaired in ${took}d`, tone: "green", hint }
      : { text: `Repaired ${Math.ceil(daysBetween(k.dueAt, k.doneAt))}d late`, tone: "red", hint };
  }
  if (!isOpen(c.status)) return null;
  const left = daysBetween(now, k.dueAt);
  if (left < 0) return { text: `Overdue ${Math.ceil(-left)}d`, tone: "red", hint };
  return { text: `${Math.ceil(left)}d left`, tone: left <= 7 ? "amber" : "gray", hint };
}

const TONE = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export function RepairClockBadge({ c, now, className }: { c: Case; now: string; className?: string }) {
  const s = repairClockState(c, now);
  if (!s) return null;
  return (
    <span title={s.hint} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE[s.tone], className)}>
      <Timer className="size-3" /> {s.text}
    </span>
  );
}
