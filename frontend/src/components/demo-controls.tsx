"use client";
import { CloudRain, FastForward, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { resetDemo, simulateRain, skipDays } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { API_URL, useApiError, useDemo, useOffline } from "@/lib/store";

export function DemoControls() {
  const now = useDemo((s) => s.now);
  const source = useDemo((s) => s.source);
  const apiError = useApiError();
  const offline = useOffline();
  const run = (fn: () => Promise<void>, ok: string) => async () => {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    }
  };
  const btn =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="space-y-1 rounded-xl bg-white/5 p-2">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Demo · {fmtDate(now)}</p>
      <button type="button" disabled={offline} className={btn} onClick={run(() => skipDays(14), "Skipped 2 weeks")}>
        <FastForward className="size-3.5" /> Skip 2 weeks
      </button>
      <button type="button" disabled={offline} className={btn} onClick={run(simulateRain, "Rain: new leak reports in stack A-08")}>
        <CloudRain className="size-3.5" /> Simulate rain
      </button>
      <button
        type="button"
        disabled={offline}
        className={btn}
        onClick={run(resetDemo, "Demo reset: simephony.db restored from seed.db")}
      >
        <RotateCcw className="size-3.5" /> Reset demo
      </button>
      <p className={`px-2.5 pt-1 text-[10px] ${apiError ? "text-red-400" : "text-zinc-500"}`} title={apiError ?? API_URL}>
        {source === "database" && !apiError ? "Data: data/simephony.db (live)" : "Backend offline: built-in demo data"}
      </p>
    </div>
  );
}
