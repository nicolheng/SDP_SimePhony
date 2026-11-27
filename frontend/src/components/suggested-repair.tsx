"use client";
import type { KbMethod } from "@/lib/kb";

/** The suggested repair, straight to the point: title, steps, expected outcome. Technicians only. */
export function SuggestedRepair({ method }: { method: KbMethod }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-base font-semibold text-zinc-900">{method.title}</p>
      <div>
        <p className="mb-1 font-semibold text-zinc-900">Steps:</p>
        <ol className="list-decimal space-y-1 pl-5 text-zinc-700">
          {method.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      {method.expectedOutcome && (
        <p className="text-zinc-700">
          <span className="font-semibold text-zinc-900">Expected outcome:</span> {method.expectedOutcome}
        </p>
      )}
      {method.dryingTime && <p className="text-xs text-zinc-500">Drying / curing: {method.dryingTime}</p>}
    </div>
  );
}
