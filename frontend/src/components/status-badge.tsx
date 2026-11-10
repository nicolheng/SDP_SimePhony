import { buyerBadge, statusMeta, TONE_CLASS } from "@/lib/status";
import type { CaseStatus, Urgency } from "@/lib/types";
import { cn } from "@/lib/utils";

/** `of` (buyer only): the case, so the label follows its booking, approval and verification (status.buyerBadge). */
export function StatusBadge({ status, buyer, className, of }: { status: CaseStatus; buyer?: boolean; className?: string; of?: Parameters<typeof buyerBadge>[0] }) {
  const m = statusMeta(status);
  const b = buyer && of ? buyerBadge(of) : null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", TONE_CLASS[b?.tone ?? m.tone], className)}>
      {b ? b.label : buyer ? m.buyer : m.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const cls = { high: "bg-red-600 text-white", normal: "bg-zinc-200 text-zinc-700", low: "bg-zinc-100 text-zinc-500" }[urgency];
  return <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls)}>{urgency}</span>;
}
