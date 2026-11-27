"use client";
import type { KbMethod, KbRule, KbVerifyMethod } from "@/lib/kb";

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

const OP_WORD: Record<string, string> = { ">": "more than", ">=": "at least", "<": "less than", "<=": "at most" };

/** When the reading counts as a defect, in words. */
function defectIf(r: KbRule) {
  if (r.check === "yes_no") return `the answer to "${r.question}" is yes`;
  return `the ${r.metric} is ${(r.op && OP_WORD[r.op]) || r.op} ${r.threshold} ${r.unit ?? ""}`.trim();
}

/** How to verify the defect on the inspection visit (kb/tolerances.yaml): tools, how to check, and the limit. */
export function SuggestedVerify({ rules }: { rules: KbRule[] }) {
  return (
    <div className="space-y-4 text-sm">
      {rules.map((r) => (
        <div key={r.id} className="space-y-3">
          <p className="text-base font-semibold text-zinc-900">{r.condition}</p>
          <div>
            <p className="mb-1 font-semibold text-zinc-900">Steps:</p>
            <ol className="list-decimal space-y-1 pl-5 text-zinc-700">
              <li>Bring: {r.tool}.</li>
              <li>{r.howToMeasure}</li>
              <li>It is a defect if {defectIf(r)}.</li>
            </ol>
          </div>
          <p className="text-xs text-zinc-500">
            Source: {r.source.title}
            {r.source.clause && `, ${r.source.clause}`}
          </p>
        </div>
      ))}
    </div>
  );
}

/** How to verify a defect type with no limit rule (kb/verify_methods.yaml), in the same layout. */
export function SuggestedVerifyMethod({ method }: { method: KbVerifyMethod }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="mb-1 font-semibold text-zinc-900">Steps:</p>
        <ol className="list-decimal space-y-1 pl-5 text-zinc-700">
          <li>Bring: {method.tool}.</li>
          {method.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      <p className="text-zinc-700">
        <span className="font-semibold text-zinc-900">It is a defect if:</span> {method.defectIf}
      </p>
      <p className="text-xs text-zinc-500">Source: {method.sources.join("; ")}</p>
    </div>
  );
}
