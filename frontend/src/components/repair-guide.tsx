"use client";
// The repair guide from the knowledge base (#134), on the technician's job page once a defect is confirmed Valid.
// Read from GET /api/cases/{id}/technician-guide, which is not part of /api/state, so buyer pages never get it.
import { BookOpen, Clock, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Section } from "@/components/mobile";
import { getTechnicianGuide, type RepairMethod } from "@/lib/api";

/** refreshKey: changes when the verdict or status changes, so the guide is fetched again (e.g. after SDP overturns). */
export function RepairGuideCard({ caseId, refreshKey }: { caseId: string; refreshKey: string }) {
  const [method, setMethod] = useState<RepairMethod | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getTechnicianGuide(caseId)
      .then((g) => live && (setMethod(g.repairMethod), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [caseId, refreshKey]);

  if (failed) {
    return (
      <Section title="Repair Guide">
        <p className="text-sm text-zinc-500">The repair guide couldn&apos;t be loaded. Check the connection and reopen this job.</p>
      </Section>
    );
  }
  if (!method) return null;

  return (
    <Section title="Repair Guide">
      <div className="mb-3 flex items-start gap-2">
        <Wrench className="mt-0.5 size-4 shrink-0 text-brand" />
        <div>
          <p className="text-sm font-semibold leading-snug text-zinc-900">{method.title}</p>
          <p className="mt-0.5 text-xs text-zinc-500">For technicians only. Never share these steps with the buyer.</p>
        </div>
      </div>

      {method.licensedOnly && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Licensed {method.specialistTrade ?? "specialist"} only.
        </p>
      )}

      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-800">
        {method.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      {method.materials.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-zinc-500">Materials</p>
          <p className="text-sm text-zinc-800">{method.materials.join(", ")}</p>
        </div>
      )}

      {method.dryingTime && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Drying / curing: </span>
            {method.dryingTime}
          </span>
        </div>
      )}

      {method.callSpecialistIf.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-zinc-500">
            Call a {method.specialistTrade ?? "specialist"} if
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-800">
            {method.callSpecialistIf.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {method.sources.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <BookOpen className="size-3.5" /> Sources
          </p>
          <ul className="space-y-0.5 text-xs text-zinc-600">
            {method.sources.map((s) => (
              <li key={s.id}>
                {s.title} <span className="text-zinc-400">({s.authorityLabel})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
