"use client";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";

/** SimilarDefectAgent's links for the technician: each other unit in the stack with the same problem, its case and when it was reported. */
export function SimilarDefects({ c }: { c: Case }) {
  const cases = useDemo((st) => st.cases);
  // One row per case; the date is when that case was reported (the link date when the case isn't loaded).
  const rows = c.similar
    .filter((s) => s.unitId && s.unitId !== c.unitId)
    .filter((s, i, xs) => xs.findIndex((x) => x.caseId === s.caseId) === i)
    .map((s) => {
      const other = cases.find((x) => x.id === s.caseId);
      return { caseId: s.caseId, unitId: s.unitId, at: other?.createdAt ?? s.at };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!rows.length) return null;
  return (
    <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200">
      {rows.map((r) => (
        <li key={r.caseId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-semibold text-zinc-900">Unit {r.unitId}</p>
            <p className="font-mono text-xs text-zinc-500">{r.caseId}</p>
          </div>
          <span className="shrink-0 text-xs text-zinc-600">{fmtDate(r.at)}</span>
        </li>
      ))}
    </ul>
  );
}
