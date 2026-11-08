"use client";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/sdp-ui";
import { retryInspectionBrief } from "@/lib/api";
import { useDemo, useOffline } from "@/lib/store";
import type { Case, CaseEvent } from "@/lib/types";

/** After SDP approves an extra inspection, the brief and joint booking are made just after the click
 *  (USE_AI_AGENTS=only). Shows that it is in progress, or why it failed with a Try again button. */
export function BriefProgress({ c, events }: { c: Case; events: CaseEvent[] }) {
  const approvals = useDemo((s) => s.approvals);
  const offline = useOffline();
  const [busy, setBusy] = useState(false);
  const approval = approvals
    .filter((a) => a.caseId === c.id && a.status === "approved" && a.decidedAt)
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0];
  if (!approval?.decidedAt) return null;
  if (c.inspectionBrief && c.inspectionBrief.generatedAt >= approval.decidedAt) return null;
  const failed = [...events]
    .reverse()
    .find((e) => e.agent === "InitialInspectionAgent" && e.at >= approval.decidedAt! && e.message.startsWith("Could not finish"));

  async function retry() {
    setBusy(true);
    try {
      await retryInspectionBrief(approval.id);
      toast.success("Trying again: the AI is writing the inspection brief");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Extra Inspection" className={failed ? "ring-2 ring-red-200" : "ring-2 ring-violet-200"}>
      {failed && !busy ? (
        <>
          <p className="flex items-start gap-2 text-base text-red-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> The inspection brief and booking could not be finished.
          </p>
          <p className="mt-1.5 text-sm text-zinc-600">{failed.message}</p>
          <button
            type="button"
            disabled={offline}
            onClick={retry}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 text-base font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <RotateCcw className="size-4" /> Try again
          </button>
        </>
      ) : (
        <p className="flex items-center gap-2 text-base text-violet-900">
          <Loader2 className="size-4 animate-spin" /> Approved. The AI is writing the inspection brief and booking the joint inspection…
        </p>
      )}
    </Panel>
  );
}
