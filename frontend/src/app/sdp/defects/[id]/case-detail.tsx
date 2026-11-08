"use client";
import { AlertTriangle, ArrowLeft, Bot, ChevronDown, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EventTimeline, SimilarList, useCase, useCaseEvents, useCaseId } from "@/components/case-views";
import { DefectRecordCard } from "@/components/defect-record";
import { DeveloperSignoffPanel } from "@/components/developer-signoff";
import { recordAvailable } from "@/lib/defect-record";
import { InspectionBriefView } from "@/components/inspection-brief";
import { PhotoThumb } from "@/components/photo";
import { Stars } from "@/components/rating";
import { RepairClockBadge } from "@/components/repair-clock";
import { ReviewPanel } from "@/components/review-panel";
import { Panel } from "@/components/sdp-ui";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { CATEGORY_LABEL, getTechnician, getUnit, SDP_STAFF, workerLabel } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { agentLabel } from "@/lib/agents";
import { useDemo } from "@/lib/store";
import type { CaseEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Generic text the backend writes when an agent step recorded no reasoning (tools._emit / state.py): no model, nothing to explain. */
function isPlaceholder(event: CaseEvent) {
  const t = event.telemetry!;
  const rule = typeof t.reasoning === "string" ? t.reasoning : t.reasoning?.matched_rule;
  const agent = event.agent ?? "agent";
  return (
    !t.model &&
    !t.fallback_used &&
    t.guardrail_hits.length === 0 &&
    !(typeof t.reasoning === "object" && t.reasoning?.related_cases?.length) &&
    (rule === `Rule-based ${agent} assessment` || rule === `Rule-based decision: ${agent}`)
  );
}

function hasWhyData(event: CaseEvent) {
  const telemetry = event.telemetry;
  return event.type === "agent.step" && !!telemetry && !isPlaceholder(event) && Boolean(
    telemetry.model ||
    telemetry.timing_ms > 0 ||
    telemetry.confidence_score !== null ||
    telemetry.fallback_used ||
    telemetry.guardrail_hits.length > 0 ||
    telemetry.reasoning?.matched_rule ||
    telemetry.reasoning?.evidence ||
    telemetry.reasoning?.related_cases?.length ||
    telemetry.reasoning?.cluster_reason
  );
}

/** "urgency_guardrail_triggered" -> "Urgency guardrail" */
const guardrailLabel = (hit: string) => {
  const name = hit.replace(/_guardrail_triggered$/, "").replace(/_/g, " ");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} guardrail`;
};

function WhyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-zinc-800">{children}</dd>
    </>
  );
}

function WhyCard({ event }: { event: CaseEvent }) {
  const telemetry = event.telemetry!;
  const reasoning = telemetry.reasoning;
  const rule = typeof reasoning === "string" ? reasoning : reasoning?.matched_rule;
  const details = typeof reasoning === "object" ? reasoning : null;
  const score = telemetry.confidence_score !== null ? Math.round(telemetry.confidence_score * 100) : null;
  const runInfo = [telemetry.model, telemetry.timing_ms > 0 && `${(telemetry.timing_ms / 1000).toFixed(1)} s`].filter(Boolean);

  return (
    <li className="relative overflow-hidden rounded-xl bg-white p-4 pl-5 ring-1 ring-zinc-200/70">
      <span className="absolute inset-y-0 left-0 w-1 bg-violet-400" aria-hidden="true" />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="grid size-7 place-items-center rounded-lg bg-violet-50 text-violet-700">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          {event.agent ? agentLabel(event.agent) : "AI agent"}
        </h3>
        <time dateTime={event.at} className="text-sm text-zinc-500">{fmtDateTime(event.at)}</time>
      </header>

      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
        {rule && <WhyRow label="Rule">{rule}</WhyRow>}
        {details?.evidence && (
          <WhyRow label="Evidence">
            <blockquote className="border-l-2 border-violet-300 pl-3 text-zinc-700">&ldquo;{details.evidence}&rdquo;</blockquote>
          </WhyRow>
        )}
        {details?.cluster_reason && details.cluster_reason !== details.evidence && (
          <WhyRow label="Pattern">{details.cluster_reason}</WhyRow>
        )}
        {!!details?.related_cases?.length && (
          <WhyRow label="Related">
            <p className="text-zinc-500">Related cases: {details.related_cases.length}</p>
            <ul className="mt-1 space-y-1">
              {details.related_cases.map((related) => (
                <li key={related.case_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link href={`/sdp/defects/${related.case_id}`} className="font-mono text-zinc-900 hover:underline">
                    {related.case_id}
                  </Link>
                  <span className="text-zinc-600">{related.reason}</span>
                  {related.score !== null && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-600">
                      {Math.round(related.score * 100)}% similarity
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </WhyRow>
        )}
      </dl>

      {score !== null && (
        <div className="mt-3 flex items-center gap-3" title="The model's own estimate, not a measured accuracy">
          <span className="text-xs text-zinc-500">Self-reported confidence</span>
          <div className="h-2 max-w-48 flex-1 rounded-full bg-violet-100">
            <div className={cn("h-2 rounded-full", score < 70 ? "bg-amber-500" : "bg-violet-500")} style={{ width: `${score}%` }} />
          </div>
          <span className="text-sm tabular-nums text-violet-800">{score}%</span>
        </div>
      )}

      {(runInfo.length > 0 || telemetry.fallback_used || telemetry.guardrail_hits.length > 0) && (
        <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5">
          <span className="font-mono text-xs text-zinc-500">{runInfo.join(" · ")}</span>
          <span className="flex flex-wrap gap-1.5">
            {telemetry.fallback_used && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
                title={telemetry.fallback_reason ?? undefined}
              >
                <AlertTriangle className="size-3" aria-hidden="true" /> Rule-based fallback
              </span>
            )}
            {telemetry.guardrail_hits.map((hit) => (
              <span key={hit} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                <ShieldCheck className="size-3" aria-hidden="true" /> {guardrailLabel(hit)}
              </span>
            ))}
          </span>
        </footer>
      )}
    </li>
  );
}

/** Newest step per agent first; each agent's older steps sit behind "Show earlier steps". */
function WhyList({ events }: { events: CaseEvent[] }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const { latest, earlier } = useMemo(() => {
    const seen = new Set<string>();
    const latest: CaseEvent[] = [];
    const earlier: CaseEvent[] = [];
    for (const event of [...events].reverse()) {
      const agent = event.agent ?? "AI agent";
      (seen.has(agent) ? earlier : latest).push(event);
      seen.add(agent);
    }
    return { latest, earlier };
  }, [events]);

  return (
    <>
      <ol className="space-y-3">
        {latest.map((event) => <WhyCard key={event.id} event={event} />)}
      </ol>
      {earlier.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowEarlier((v) => !v)}
            aria-expanded={showEarlier}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            {showEarlier ? "Hide" : "Show"} {earlier.length} earlier step{earlier.length === 1 ? "" : "s"}
            <ChevronDown className={cn("size-4 transition-transform", showEarlier && "rotate-180")} aria-hidden="true" />
          </button>
          {showEarlier && (
            <ol className="mt-3 space-y-3 opacity-90">
              {earlier.map((event) => <WhyCard key={event.id} event={event} />)}
            </ol>
          )}
        </>
      )}
    </>
  );
}

export function SdpCaseDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const events = useCaseEvents(id);
  const whyEvents = useMemo(() => events.filter(hasWhyData), [events]);
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
            <Panel
              title="Why the AI decided this"
              action={<span className="text-sm text-zinc-500">{whyEvents.length} AI step{whyEvents.length === 1 ? "" : "s"}</span>}
            >
              <p className="-mt-2 mb-4 text-sm text-zinc-500">
                The rule each AI step applied, the evidence from the report, and the model&apos;s self-reported confidence.
              </p>
              <WhyList events={whyEvents} />
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
          {c.status === "PENDING_SIGNOFF" && !c.signoff?.developer && <DeveloperSignoffPanel c={c} />}
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
