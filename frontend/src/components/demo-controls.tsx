"use client";
import { CloudRain, FastForward, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { resetDemo, simulateRain, skipDays } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";

export function ResetDemoButton() {
  return (
    <button
      type="button"
      onClick={() => {
        resetDemo();
        toast.success("Demo data reset");
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-zinc-200/60 hover:text-zinc-800"
    >
      <RotateCcw className="size-3.5" /> Reset demo
    </button>
  );
}

export function DemoControls() {
  const now = useDemo((s) => s.now);
  const btn = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/10 hover:text-white";
  return (
    <div className="space-y-1 rounded-xl bg-white/5 p-2">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Demo · {fmtDate(now)}</p>
      <button type="button" className={btn} onClick={() => { skipDays(14); toast("Skipped 2 weeks"); }}>
        <FastForward className="size-3.5" /> Skip 2 weeks
      </button>
      <button type="button" className={btn} onClick={() => { simulateRain(); toast("Rain: new leak reports in stack A-08"); }}>
        <CloudRain className="size-3.5" /> Simulate rain
      </button>
      <button type="button" className={btn} onClick={() => { resetDemo(); toast.success("Demo reset to seed data"); }}>
        <RotateCcw className="size-3.5" /> Reset demo
      </button>
    </div>
  );
}
