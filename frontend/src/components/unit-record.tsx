"use client";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DefectRecordCard } from "@/components/defect-record";
import { MobileHeader, Section } from "@/components/mobile";
import { Stars } from "@/components/rating";
import { DEMO_BUYER, getUnit, PROJECT_NAME } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { buildDefectRecord, buyerName, downloadUnitRecordPdf } from "@/lib/defect-record";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/status";
import { useDemo } from "@/lib/store";

/** One unit sign-off: every defect it closed, each in the usual defect record layout, plus one PDF for them all.
 *  Shared by the buyer's Records page and the SDP console. */
export function UnitRecordView({ id, viewer, back, large }: { id: string; viewer: string; back?: string; large?: boolean }) {
  const records = useDemo((s) => s.rectificationRecords);
  const cases = useDemo((s) => s.cases);
  const record = records?.find((r) => r.id === id);
  const defects = useMemo(() => (record ? record.caseIds.map((cid) => cases.find((c) => c.id === cid)).filter((c) => !!c) : []), [record, cases]);
  const [busy, setBusy] = useState(false);

  if (!record) return back ? <MobileHeader title="Record Not Found" back={back} /> : <p className="text-base text-zinc-500">Record not found.</p>;
  const unit = getUnit(record.unitId);
  const owner = defects[0] ? buyerName(defects[0]) : DEMO_BUYER.name;

  async function download() {
    if (!record) return;
    setBusy(true);
    try {
      await downloadUnitRecordPdf(
        record,
        defects.map((c) => ({ record: buildDefectRecord(c), photoUrl: c.photos[0]?.url })),
        viewer,
      );
    } catch {
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {back && <MobileHeader title="Rectification Record" back={back} />}
      <div className={cn("space-y-4", back && "p-4")}>
        <Section>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-500">{record.id}</p>
              <p className="font-semibold">
                {PROJECT_NAME} · Unit {record.unitId}
              </p>
              <p className="text-xs text-zinc-500">
                Block {unit.block}, level {unit.floor} · {owner}
              </p>
            </div>
            <button
              type="button"
              onClick={download}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download PDF
            </button>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">{record.kind === "signed" ? "Signed off" : "Closed automatically"}</dt>
              <dd className="text-right">{fmtDateTime(record.signedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Defects</dt>
              <dd>{record.caseIds.length}</dd>
            </div>
            {record.rating ? (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-500">{back ? "Your rating" : "Buyer rating"}</dt>
                <dd>
                  <Stars value={record.rating} className="text-base" />
                </dd>
              </div>
            ) : null}
          </dl>
          {record.kind === "auto_closed" && <p className="mt-2 text-xs text-zinc-500">No sign-off was received within the sign-off period, so these defects were closed automatically.</p>}
        </Section>

        {defects.map((c) => (
          <div key={c.id} className="space-y-2">
            {c.status !== "CLOSED" && (
              <p className="flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
                <RotateCcw className="size-3.5 shrink-0" /> {c.id} was reopened after this sign-off; it is now {STATUS_META[c.status].buyer.toLowerCase()}.
              </p>
            )}
            <DefectRecordCard c={c} viewer={viewer} hideDownload large={large} />
          </div>
        ))}
      </div>
    </div>
  );
}
