"use client";
import { useMemo, useState } from "react";
import { SLOT_TIMES } from "@/lib/constants";
import { dayKey, fmtTime, slotIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

const wk = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short" });
const dd = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric" });
const mon = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "long", year: "numeric" });

/** Date strip + time grid, in the style of the SDP app's Key Handover Appointment screen. */
export function SlotPicker({ available, value, onChange }: { available: string[]; value: string | null; onChange: (iso: string) => void }) {
  const days = useMemo(() => [...new Set(available.map(dayKey))], [available]);
  const [day, setDay] = useState<string | null>(value ? dayKey(value) : (days[0] ?? null));
  const set = new Set(available);
  if (!days.length) return <p className="text-sm text-zinc-500">No slots available.</p>;
  const current = day ?? days[0];

  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-semibold text-brand">Please select an available date and time slot</p>
      <p className="text-center text-xs font-medium text-zinc-500">{mon.format(new Date(`${current}T12:00:00+08:00`))}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const date = new Date(`${d}T12:00:00+08:00`);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "flex w-12 shrink-0 flex-col items-center rounded-xl py-2 text-xs ring-1 ring-zinc-200 transition",
                d === current ? "bg-brand text-white ring-brand" : "bg-white text-zinc-700 hover:ring-brand",
              )}
            >
              <span className="text-[10px] uppercase opacity-80">{wk.format(date)}</span>
              <span className="text-base font-semibold">{dd.format(date)}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SLOT_TIMES.map((t) => {
          const iso = slotIso(current, t);
          const ok = set.has(iso);
          return (
            <button
              key={t}
              type="button"
              disabled={!ok}
              onClick={() => onChange(iso)}
              className={cn(
                "h-10 rounded-lg text-sm font-medium ring-1 transition",
                value === iso ? "bg-brand text-white ring-brand" : ok ? "bg-white text-zinc-800 ring-zinc-200 hover:ring-brand" : "bg-zinc-100 text-zinc-400 line-through ring-zinc-100",
              )}
            >
              {fmtTime(iso)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
