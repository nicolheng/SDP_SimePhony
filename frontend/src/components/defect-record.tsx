"use client";
import { CheckCircle2, CircleAlert, CircleDashed, Clock, Download, Loader2, MinusCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/dates";
import { buildDefectRecord, downloadDefectRecordPdf, type StepState } from "@/lib/defect-record";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<StepState, React.ReactNode> = {
  done: <CheckCircle2 className="size-5 text-emerald-600" />,
  pending: <CircleDashed className="size-5 text-zinc-400" />,
  attention: <CircleAlert className="size-5 text-orange-600" />,
  skipped: <MinusCircle className="size-5 text-zinc-300" />,
};
const BADGE: Record<StepState, string> = {
  done: "bg-emerald-50 text-emerald-700",
  pending: "bg-zinc-100 text-zinc-600",
  attention: "bg-orange-50 text-orange-700",
  skipped: "bg-zinc-50 text-zinc-400",
};

/** Digital defect record with role-based sign-off history and a PDF download. */
export function DefectRecordCard({ c, viewer, large }: { c: Case; viewer: string; large?: boolean }) {
  const approvals = useDemo((s) => s.approvals);
  const record = useMemo(() => buildDefectRecord(c, approvals), [c, approvals]);
  const [busy, setBusy] = useState(false);
  const t = large ? "text-base" : "text-sm";
  const ts = large ? "text-sm" : "text-xs";

  async function download() {
    setBusy(true);
    try {
      await downloadDefectRecordPdf(record, viewer, c.photos[0]?.url);
    } catch {
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const head: [string, string][] = [
    ["Defect ID", record.defectId],
    ["Defect", record.defect],
    ["Assigned trade", record.trade],
    ["Assigned to", record.assignedTo],
    ["Status", record.status],
  ];

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className={cn("font-semibold", large ? "text-lg" : "text-sm")}>Digital defect record</p>
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className={cn("inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60", ts)}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download PDF
        </button>
      </div>
      <dl>
        {head.map(([k, v]) => (
          <div key={k} className={cn("flex justify-between gap-4 py-1.5", t)}>
            <dt className="shrink-0 text-zinc-500">{k}</dt>
            <dd className={cn("text-right", k === "Defect ID" ? "font-semibold" : "text-zinc-900")}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="my-3 border-t border-zinc-200" />
      <p className={cn("mb-2 font-semibold", t)}>Approval history</p>
      <ol className="space-y-3">
        {record.steps.map((s) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="mt-0.5 shrink-0">{s.state === "pending" && s.who ? <Clock className="size-5 text-orange-500" /> : ICON[s.state]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className={cn("font-medium", t, s.state === "skipped" && "text-zinc-400")}>{s.title}</p>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 font-medium", ts, BADGE[s.state])}>{s.badge}</span>
              </div>
              <p className={cn("text-zinc-500", ts)}>{s.desc}</p>
              {(s.who || s.at) && (
                <p className={cn("text-zinc-700", ts)}>
                  {s.who}
                  {s.who && s.at && " · "}
                  {s.at && fmtDateTime(s.at)}
                </p>
              )}
              {s.detail && <p className={cn("mt-0.5 text-zinc-500", ts)}>{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
