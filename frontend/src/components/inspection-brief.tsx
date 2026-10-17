"use client";
import { Bot, Check } from "lucide-react";
import { useState } from "react";
import { fmtDate } from "@/lib/dates";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhotoThumb } from "./photo";

export function InspectionBriefView({ c, interactive }: { c: Case; interactive?: boolean }) {
  const b = c.inspectionBrief;
  const [done, setDone] = useState<number[]>([]);
  if (!b) return null;
  const original = c.photos.find((p) => p.kind === "original");
  const reopen = [...c.photos].reverse().find((p) => p.kind === "reopen");

  return (
    <div className="space-y-4 text-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700">
        <Bot className="size-3.5" /> InitialInspectionAgent · generated {fmtDate(b.generatedAt)}
      </p>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Timeline</h3>
        <ol className="space-y-1 border-l border-zinc-200 pl-3">
          {b.timeline.map((t, i) => (
            <li key={i} className="text-xs">
              <span className="text-zinc-400">{fmtDate(t.at)}</span> — {t.text}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Photo comparison</h3>
        <div className="grid grid-cols-2 gap-2">
          {original && <PhotoThumb photo={original} className="aspect-[4/3]" />}
          {reopen && <PhotoThumb photo={reopen} className="aspect-[4/3]" />}
        </div>
        <p className="mt-1.5 text-xs text-zinc-600">{b.photoComparison}</p>
      </div>

      {b.neighbouringUnits.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Neighbouring units with the same problem</h3>
          <ul className="flex flex-wrap gap-1.5">
            {b.neighbouringUnits.map((u) => (
              <li key={u.unitId} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200">
                <span className="font-mono font-semibold">{u.unitId}</span> · {u.cases} case(s), last {fmtDate(u.last)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Likely components</h3>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-zinc-700">
          {b.likelyComponents.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Checklist</h3>
        <ol className="space-y-1.5">
          {b.checklist.map((x, i) => {
            const on = done.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => setDone(on ? done.filter((d) => d !== i) : [...done, i])}
                  className={cn("flex w-full gap-2 rounded-lg p-2 text-left text-xs ring-1", on ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-zinc-200")}
                >
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  {x}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
