import { STATUS_META, TONE_CLASS } from "@/lib/status";
import type { CaseStatus, Urgency } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, buyer, className }: { status: CaseStatus; buyer?: boolean; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", TONE_CLASS[m.tone], className)}>
      {buyer ? m.buyer : m.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const cls = { high: "bg-red-600 text-white", normal: "bg-zinc-200 text-zinc-700", low: "bg-zinc-100 text-zinc-500" }[urgency];
  return <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls)}>{urgency}</span>;
}
