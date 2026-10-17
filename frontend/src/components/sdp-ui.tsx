"use client";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HeatCell } from "@/lib/analytics";
import { STACKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-zinc-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/70", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>}
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
      <p className={cn("text-xs font-medium uppercase tracking-wide", accent ? "text-white/80" : "text-zinc-500")}>{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className={cn("mt-1 text-xs", accent ? "text-white/80" : "text-zinc-500")}>{hint}</p>}
    </div>
  );
}

const AXIS = { fontSize: 12, fill: "#71717a" };
const TOOLTIP = { contentStyle: { borderRadius: 10, border: "1px solid #e4e4e7", fontSize: 12 }, cursor: { fill: "#f4f4f5" } };

/** Single-series horizontal bars: one hue, rounded data ends, hover tooltip. */
export function HBars({ data, dataKey = "count", height = 280 }: { data: { name: string }[]; dataKey?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="#f4f4f5" />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={110} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey={dataKey} name="Defects" fill="var(--brand)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data, height = 220 }: { data: { month: string; count: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#f4f4f5" />
        <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip {...TOOLTIP} cursor={{ stroke: "#d4d4d8" }} />
        <Line type="monotone" dataKey="count" name="New defects" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Warm sequential ramp (0 → 3+): neutral, amber, orange, red — the plan's "amber, then red".
const HEAT = ["bg-zinc-100", "bg-amber-200", "bg-orange-400", "bg-red-600"];
const heatClass = (n: number) => HEAT[Math.min(n, 3)];

export function StackHeatmap({ rows, highlightStack, onCell }: { rows: HeatCell[][]; highlightStack?: string; onCell?: (c: HeatCell) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-[10px]">
        <thead>
          <tr>
            <th />
            {STACKS.map((s) => (
              <th key={s} className={cn("px-1 font-medium text-zinc-500", s === highlightStack && "text-brand")}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0].floor}>
              <th className="pr-1 text-right font-medium text-zinc-500">L{row[0].floor}</th>
              {row.map((c) => (
                <td key={c.unitId}>
                  <button
                    type="button"
                    onClick={() => onCell?.(c)}
                    title={`${c.unitId}: ${c.count} report(s)${c.open ? " · open case" : ""}`}
                    className={cn(
                      "block h-6 w-9 rounded transition-colors duration-700 hover:ring-2 hover:ring-zinc-900/40",
                      heatClass(c.count),
                      c.open && "cell-pulse",
                    )}
                    aria-label={`${c.unitId}, ${c.count} reports`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        {["0", "1", "2", "3+"].map((l, i) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className={cn("inline-block size-3 rounded-sm", HEAT[i])} /> {l}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="cell-pulse inline-block size-3 rounded-sm bg-red-600" /> open case
        </span>
      </div>
    </div>
  );
}
