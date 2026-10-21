"use client";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useState } from "react";
import { EventTimeline, SimilarList, useCase, useCaseEvents, useCaseId } from "@/components/case-views";
import { DefectRecordCard } from "@/components/defect-record";
import { recordAvailable } from "@/lib/defect-record";
import { InspectionBriefView } from "@/components/inspection-brief";
import { PhotoThumb } from "@/components/photo";
import { Panel } from "@/components/sdp-ui";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { developerSignOff } from "@/lib/api";
import { CATEGORY_LABEL, getTechnician, getUnit, SDP_STAFF, workerLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";

export function SdpCaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const events = useCaseEvents(id);
  const [busy, setBusy] = useState(false);
  if (!c) return <p className="text-base text-zinc-500">Case {id} not found.</p>;
  const unit = getUnit(c.unitId);
  const tech = getTechnician(c.technicianId);

  const facts: [string, React.ReactNode][] = [
    ["Unit", `${c.unitId} · Block ${unit.block}, level ${unit.floor}, stack ${unit.stack}`],
    ["Contractor", unit.contractor],
    ["Category", `${CATEGORY_LABEL[c.category]} › ${c.subCategory}`],
    ["Location", c.location || "—"],
    ["Technician", tech?.name ?? "—"],
    ["Reported", fmtDateTime(c.createdAt)],
    ["Visit", c.visitSlot ? fmtDateTime(c.visitSlot) : "—"],
    ["Repair", c.repairSlot ? fmtDateTime(c.repairSlot) : "—"],
    ["Occurrence in unit", c.occurrence],
    ["Reopened", `${c.reopenCount}×`],
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/sdp/defects" className="mb-4 inline-flex items-center gap-1 text-base text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> Defects
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{c.summary}</h1>
        <StatusBadge status={c.status} />
        <UrgencyBadge urgency={c.urgency} />
        <span className="font-mono text-base text-zinc-500">{c.id}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Details">
            <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-zinc-100 py-1.5">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 whitespace-pre-line rounded-lg bg-zinc-50 p-3 text-base text-zinc-700">&ldquo;{c.description}&rdquo;</p>
            {c.triageReason && <p className="mt-2 text-sm text-zinc-500">Triage: {c.triageReason}</p>}
          </Panel>

          <Panel title="Photos">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {c.photos.map((p, i) => (
                <PhotoThumb key={i} photo={p} className="aspect-square" />
              ))}
            </div>
          </Panel>

          {(c.verdict || c.repairNote || c.verification) && (
            <Panel title="Inspection, repair & verification">
              <ul className="space-y-2 text-base">
                {c.verdict && (
                  <li>
                    <span className="font-medium">Verdict ({fmtDate(c.verdict.at)}):</span> {c.verdict.outcome} — {c.verdict.note}
                  </li>
                )}
                {c.repairNote && (
                  <li>
                    <span className="font-medium">Repair note:</span> {c.repairNote}
                  </li>
                )}
                {c.verificationGuide && (
                  <li>
                    <span className="font-medium">Verification checks sent to buyer:</span>
                    <ol className="mt-1 list-decimal pl-5 text-zinc-600">
                      {c.verificationGuide.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </li>
                )}
                {c.verification && (
                  <li>
                    <span className="font-medium">Buyer verification ({fmtDate(c.verification.at)}):</span> {c.verification.result.replace("_", " ")}
                    {c.verification.note && ` — "${c.verification.note}"`}
                  </li>
                )}
              </ul>
            </Panel>
          )}

          {c.inspectionBrief && (
            <Panel title="Inspection brief">
              <InspectionBriefView c={c} />
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {c.status === "PENDING_SIGNOFF" && !c.signoff?.developer && (
            <Panel title="Developer verification">
              <p className="text-base text-zinc-700">
                Check the repair by {workerLabel(c.technicianId)}, then approve it.
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Buyer: {c.signoff?.buyer ? `signed ${fmtDateTime(c.signoff.buyer.at)}` : "signs after your approval (then has 14 days)"}
              </p>
              {c.signoffOverdueAt && (
                <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-base text-red-800">
                  Buyer sign-off overdue since {fmtDateTime(c.signoffOverdueAt)}. High urgency, so not auto-closed: please contact the buyer.
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await developerSignOff(c.id);
                    toast.success(c.signoff?.buyer ? "Approved: case closed" : "Approved: buyer asked to sign off");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mt-4 h-11 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve repair (developer sign-off)
              </button>
            </Panel>
          )}
          {recordAvailable(c) && <DefectRecordCard c={c} viewer={`${SDP_STAFF.name} (${SDP_STAFF.title})`} large />}
          {!!c.assignments?.length && (
            <Panel title="Assignment history">
              <ul className="space-y-2.5">
                {[...c.assignments].reverse().map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-base">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{a.job}</p>
                      <p className="font-medium">{workerLabel(a.technicianId)}</p>
                      {a.reason && <p className="text-sm text-zinc-600">Reason: {a.reason}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={
                          a.outcome === "ACCEPTED"
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-700"
                            : "rounded-full bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-800"
                        }
                      >
                        {a.outcome === "ACCEPTED" ? "Accepted" : "Declined / handed over"}
                      </span>
                      <p className="mt-0.5 text-sm text-zinc-500">{fmtDateTime(a.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {c.similar.length > 0 && (
            <Panel title="Related cases (SimilarDefectAgent)">
              <SimilarList c={c} />
            </Panel>
          )}
          <Panel title="Timeline">
            <EventTimeline large events={events} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
