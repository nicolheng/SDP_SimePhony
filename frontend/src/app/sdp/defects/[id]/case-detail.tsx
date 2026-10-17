"use client";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { EventTimeline, SimilarList, useCase, useCaseEvents, useCaseId } from "@/components/case-views";
import { InspectionBriefView } from "@/components/inspection-brief";
import { PhotoThumb } from "@/components/photo";
import { Panel } from "@/components/sdp-ui";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { developerSignOff } from "@/lib/api";
import { CATEGORY_LABEL, getTechnician, getUnit } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";

export function SdpCaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const events = useCaseEvents(id);
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
          {(c.status === "PENDING_SIGNOFF" || c.signoff) && (
            <Panel title="Sign-off">
              <ul className="space-y-2 text-base">
                <li>
                  <span className="font-medium">Buyer:</span>{" "}
                  {c.signoff?.buyer ? `signed ${fmtDateTime(c.signoff.buyer.at)}` : "waiting"}
                </li>
                <li>
                  <span className="font-medium">Developer:</span>{" "}
                  {c.signoff?.developer ? `signed ${fmtDateTime(c.signoff.developer.at)} (${c.signoff.developer.by})` : "waiting"}
                </li>
              </ul>
              {c.status === "PENDING_SIGNOFF" && !c.signoff?.developer && (
                <button
                  type="button"
                  onClick={async () => {
                    await developerSignOff(c.id);
                    toast.success(c.signoff?.buyer ? "Signed off: case closed" : "Developer signed off; waiting for buyer");
                  }}
                  className="mt-4 h-10 w-full rounded-xl bg-brand text-base font-semibold text-white hover:bg-brand-dark"
                >
                  Developer Sign-off
                </button>
              )}
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
