"use client";
import { AlertTriangle, CheckCircle2, CircleAlert, Minus } from "lucide-react";
import Link from "next/link";
import type { Tone } from "@/lib/insights-data";
import { cn } from "@/lib/utils";

// Status colours (same set as the DLP badges on Statutory Clocks), always shown with an icon and words, never colour alone.
export const TONE = {
  good: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", icon: CheckCircle2 },
  warn: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500", icon: CircleAlert },
  bad: { chip: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-600", icon: AlertTriangle },
  neutral: { chip: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400", icon: Minus },
} satisfies Record<Tone, unknown>;

export function ToneChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", t.chip)}>
      <Icon className="size-3.5" /> {children}
    </span>
  );
}

/** The cases behind a figure, each a link to its case page, so every number can be checked. */
export function CaseChips({ ids, max = 6 }: { ids: string[]; max?: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {ids.slice(0, max).map((id) => (
        <Link key={id} href={`/sdp/defects/${id}`} className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700 hover:bg-zinc-200">
          {id}
        </Link>
      ))}
      {ids.length > max && <span className="text-xs text-zinc-500">+{ids.length - max} more</span>}
    </span>
  );
}

/** A thin horizontal meter for inline comparisons in tables and lists. */
export function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <div className="h-2 flex-1 rounded-full bg-zinc-100">
      <div className={cn("h-2 rounded-full bg-brand", className)} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </div>
  );
}

/** Small uppercase heading used above a section's figures. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">{children}</p>;
}
