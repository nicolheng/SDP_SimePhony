"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { HeatCell } from "@/lib/analytics";
import { STACKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-base text-zinc-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ title, action, children, className, id }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200/70", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-5 shadow-sm ring-1", accent ? "bg-brand text-white ring-brand" : "bg-white ring-zinc-200/70")}>
      <p className={cn("text-sm font-medium uppercase tracking-wide", accent ? "text-white/85" : "text-zinc-500")}>{label}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn("mt-1 text-sm", accent ? "text-white/85" : "text-zinc-500")}>{hint}</p>}
    </div>
  );
}

// Recharts (~370 KB) loads only when a chart is shown, after the page has painted.
const ChartSkeleton = ({ height }: { height: number }) => <div className="animate-pulse rounded-xl bg-zinc-100" style={{ height }} />;
export const HBars = dynamic(() => import("./charts").then((m) => m.HBars), { ssr: false, loading: () => <ChartSkeleton height={280} /> });
export const TrendLine = dynamic(() => import("./charts").then((m) => m.TrendLine), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

// Warm sequential ramp (0 → 3+): neutral, amber, orange, red — the plan's "amber, then red".
const HEAT = ["bg-zinc-100", "bg-amber-200", "bg-orange-400", "bg-red-600"];
const heatClass = (n: number) => HEAT[Math.min(n, 3)];

/** Units whose count went up since the last render (a new case linked into the cluster). */
function useNewlyLinked(rows: HeatCell[][], viewKey: string) {
  const prev = useRef<{ key: string; counts: Map<string, number> } | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = new Map(rows.flat().map((c) => [c.unitId, c.count]));
    const before = prev.current;
    prev.current = { key: viewKey, counts: now };
    // Changing block/issue is a new view, not a new link.
    if (!before || before.key !== viewKey) return;
    const grown = [...now].filter(([id, n]) => n > (before.counts.get(id) ?? 0)).map(([id]) => id);
    if (!grown.length) return;
    const show = setTimeout(() => setFlash(new Set(grown)), 0);
    const hide = setTimeout(() => setFlash(new Set()), 2600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [rows, viewKey]);
  return flash;
}

export function StackHeatmap({
  rows,
  viewKey,
  highlightStack,
  onCell,
}: {
  rows: HeatCell[][];
  viewKey: string;
  highlightStack?: string;
  onCell?: (c: HeatCell) => void;
}) {
  const flash = useNewlyLinked(rows, viewKey);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[4px] text-xs">
        <thead>
          <tr>
            <th />
            {STACKS.map((s) => (
              <th key={s} className={cn("px-1 font-semibold text-zinc-500", s === highlightStack && "rounded bg-red-50 text-brand")}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0].floor}>
              <th className="pr-1.5 text-right font-medium text-zinc-500">L{row[0].floor}</th>
              {row.map((c) => (
                <td key={c.unitId}>
                  <button
                    type="button"
                    onClick={() => onCell?.(c)}
                    title={`${c.unitId}: ${c.count} report(s)${c.open ? " · open case" : ""}`}
                    className={cn(
                      "block h-7 w-11 rounded-md transition-colors duration-1000 hover:ring-2 hover:ring-zinc-900/40",
                      c.inIssue ? heatClass(c.count) : "bg-zinc-50",
                      c.inIssue && c.stack === highlightStack && c.count > 0 && "ring-2 ring-brand/30",
                      c.open && c.inIssue && "cell-pulse",
                      flash.has(c.unitId) && "cell-link",
                    )}
                    aria-label={`${c.unitId}, ${c.count} reports`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-zinc-600">
        {["0", "1", "2", "3+"].map((l, i) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-4 rounded", HEAT[i])} /> {l} report{l === "1" ? "" : "s"}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="cell-pulse inline-block size-4 rounded bg-red-600" /> open case
        </span>
      </div>
    </div>
  );
}
