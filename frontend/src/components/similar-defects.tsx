"use client";
import { getUnit } from "@/lib/constants";
import type { Case } from "@/lib/types";

/** SimilarDefectAgent's links for the technician: just which other units in the same stack had the same problem. */
export function SimilarDefects({ c }: { c: Case }) {
  const unit = getUnit(c.unitId);
  const units = [...new Set(c.similar.filter((s) => s.unitId !== c.unitId).map((s) => s.unitId))].sort();
  if (!units.length) return null;
  return (
    <div>
      <p>
        Same problem in {units.length} other unit{units.length === 1 ? "" : "s"} of stack {unit.block}-{unit.stack}:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {units.map((u) => (
          <span key={u} className="rounded bg-white px-2 py-0.5 font-mono text-xs text-zinc-700 ring-1 ring-violet-200">
            {u}
          </span>
        ))}
      </div>
    </div>
  );
}
