"use client";
import { AlertTriangle, ArrowLeft, BrainCircuit } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EventTimeline, SimilarList, useCase, useCaseEvents, useCaseId } from "@/components/case-views";
import { DefectRecordCard } from "@/components/defect-record";
import { recordAvailable } from "@/lib/defect-record";
import { InspectionBriefView } from "@/components/inspection-brief";
import { PhotoThumb } from "@/components/photo";
import { Stars } from "@/components/rating";
import { RepairClockBadge } from "@/components/repair-clock";
import { ReviewPanel } from "@/components/review-panel";
import { Panel } from "@/components/sdp-ui";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { developerSignOff } from "@/lib/api";
import { CATEGORY_LABEL, getTechnician, getUnit, SDP_STAFF, workerLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { agentLabel } from "@/lib/agents";
import { useDemo, useOffline } from "@/lib/store";
import type { CaseEvent } from "@/lib/types";

function hasWhyData(event: CaseEvent) {
  const telemetry = event.telemetry;
  return event.type === "agent.step" && Boolean(telemetry && (
    telemetry.model ||
    telemetry.timing_ms > 0 ||
    telemetry.confidence_score !== null ||
    telemetry.fallback_used ||
    telemetry.guardrail_hits.length > 0 ||
    telemetry.reasoning?.matched_rule ||
    telemetry.reasoning?.evidence ||
    telemetry.reasoning?.related_cases?.length ||
    telemetry.reasoning?.cluster_reason
  ));
}

function WhyPanel({ event }: { event: CaseEvent }) {
  const telemetry = event.telemetry!;
  const reasoning = telemetry.reasoning;
  const guardrails = telemetry.guardrail_hits.map((hit) => hit.replace(/_guardrail_triggered$/, ""));

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-indigo-700" aria-hidden="true" />
          <h3 className="font-semibold text-zinc-900">event.agent ? agentLabel(event.agent) : "AI agent"}</h3>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
          {telemetry.model && <span>Model: <strong className="font-medium text-zinc-800">{telemetry.model}</strong></span>}
          {telemetry.timing_ms > 0 && <span>Timing: <strong className="font-medium text-zinc-800">{(telemetry.timing_ms / 1000).toFixed(1)}s</strong></span>}
          {telemetry.confidence_score !== null && (
            <span>Self-reported confidence: <strong className="font-medium text-zinc-800">{Math.round(telemetry.confidence_score * 100)}%</strong></span>
          )}
        </div>
      </header>

      <div className="mt-3 space-y-3 text-sm">
        {typeof reasoning === "string" ? (
          <p className="text-zinc-700">{reasoning}</p>
        ) : (
          (reasoning?.matched_rule || reasoning?.evidence) && (
            <div>
              {reasoning.matched_rule && (
                <p><span className="font-medium text-zinc-700">Matched rule:</span> {reasoning.matched_rule}</p>
              )}
              {reasoning.evidence && (
                <blockquote className="mt-1 border-l-2 border-indigo-300 pl-3 italic text-zinc-600">
                  &ldquo;{reasoning.evidence}&rdquo;
                </blockquote>
              )}
            </div>
          )
        )}
        {typeof reasoning === "object" && reasoning?.cluster_reason && (
          <p className="text-zinc-700">{reasoning.cluster_reason}</p>
        )}
        {!!reasoning?.related_cases?.length && (
          <div>
            <p className="font-medium text-zinc-700">Related cases</p>
            <ul className="mt-1 space-y-1">
              {reasoning.related_cases.map((related) => (
                <li key={related.case_id} className="flex flex-wrap gap-x-2 text-zinc-600">
                  <span className="font-mono text-zinc-800">{related.case_id}</span>
                  {related.score !== null && <span>{Math.round(related.score * 100)}% similarity</span>}
                  <span>{related.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {(telemetry.fallback_used || guardrails.length > 0) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-indigo-100 pt-2 text-xs text-zinc-500">
          {telemetry.fallback_used && (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="size-3.5 text-amber-700" aria-hidden="true" />
              Rule-based fallback used
            </span>
          )}
          {guardrails.length > 0 && <span>Guardrail triggered: {guardrails.join(", ")}</span>}
        </p>
      )}
    </section>
  );
}

export function SdpCaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const events = useCaseEvents(id);
  const whyEvents = useMemo(() => events.filter(hasWhyData), [events]);
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const now = useDemo((s) => s.now);
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
    ...(c.repairClock ? ([["30-day repair clock", <RepairClockBadge key="clock" c={c} now={now} className="text-sm" />]] as [string, React.ReactNode][]) : []),
    ...(unit.dlpExpiry ? ([["DLP ends", fmtDate(`${unit.dlpExpiry}T12:00:00+08:00`)]] as [string, React.ReactNode][]) : []),
    ...(c.rating
      ? ([["Buyer rating", <span key="r" className="inline-flex items-center gap-2"><Stars value={c.rating.stars} /> {c.rating.stars}/5</span>]] as [string, React.ReactNode][])
      : []),
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

          {whyEvents.length > 0 && (
            <Panel title="AI decision rationale">
              <div className="space-y-3">
                {[...whyEvents].reverse().map((event) => <WhyPanel key={event.id} event={event} />)}
              </div>
            </Panel>
          )}

          <Panel title="Photos">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {c.photos.map((p, i) => (
                <PhotoThumb key={i} photo={p} className="aspect-square" />
              ))}
            </div>
          </Panel>

          {(c.verdict || c.repairNote || c.verification) && (
            <Panel title="Inspection, Repair & Verification">
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
            <Panel title="Inspection Brief">
              <InspectionBriefView c={c} />
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {c.status === "PENDING_REVIEW" && <ReviewPanel c={c} />}
          {c.status === "PENDING_SIGNOFF" && !c.signoff?.developer && (
            <Panel title="Developer Verification">
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
                disabled={busy || offline}
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
          {c.rating?.comment && (
            <Panel title="Buyer Feedback">
              <Stars value={c.rating.stars} className="text-lg" />
              <p className="mt-2 text-base text-zinc-700">&ldquo;{c.rating.comment}&rdquo;</p>
              <p className="mt-1 text-sm text-zinc-500">{fmtDateTime(c.rating.at)}</p>
            </Panel>
          )}
          {recordAvailable(c) && <DefectRecordCard c={c} viewer={`${SDP_STAFF.name} (${SDP_STAFF.title})`} large />}
          {!!c.assignments?.length && (
            <Panel title="Assignment History">
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
            <Panel title="Related Cases (Similar Defect Agent)">
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
