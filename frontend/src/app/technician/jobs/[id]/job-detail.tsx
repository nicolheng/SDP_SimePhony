"use client";
import { Bot, CalendarClock, Check, CircleDashed, History, Lock, MapPin, ShieldAlert, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EventTimeline, SimilarList, useCase, useCaseEvents, useCaseId } from "@/components/case-views";
import { InspectionBriefView } from "@/components/inspection-brief";
import { MobileHeader, PrimaryButton, primaryButtonClass, Section } from "@/components/mobile";
import { PhotoInput, PhotoThumb, samplePhoto } from "@/components/photo";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { markRepaired, recordVerdict } from "@/lib/api";
import { CATEGORY_LABEL, DEMO_BUYER, getUnit } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { TECH_EXPLAIN } from "@/lib/status";
import { useTechnicianId } from "@/lib/session";
import { useDemo } from "@/lib/store";
import { jobKind, jobSlot } from "../../use-my-jobs";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm last:border-0">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

function AgentCard({ agent, children }: { agent: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-violet-50/60 p-3 ring-1 ring-violet-100">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
        <Bot className="size-3.5" /> {agent}
      </p>
      <div className="text-sm text-zinc-800">{children}</div>
    </div>
  );
}

export function JobDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const me = useTechnicianId();
  const events = useCaseEvents(id);
  const approvals = useDemo((s) => s.approvals);
  const approval = useMemo(() => approvals.filter((a) => a.caseId === id).at(-1), [approvals, id]);
  const agentEvents = useMemo(() => events.filter((e) => e.type === "agent.step" || e.type.startsWith("inspection") || e.type === "recurrence.detected"), [events]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!c) return <MobileHeader title="Job not found" back="/technician/jobs" />;
  if (c.technicianId !== me)
    return (
      <div>
        <MobileHeader title={c.id} back="/technician/jobs" />
        <div className="p-6 text-center">
          <Lock className="mx-auto size-10 text-zinc-300" />
          <p className="mt-3 text-sm text-zinc-600">This job is assigned to another technician.</p>
          <Link href="/technician/jobs" className={`${primaryButtonClass} mt-5`}>
            Back to My Jobs
          </Link>
        </div>
      </div>
    );

  const unit = getUnit(c.unitId);
  const inspecting = c.status === "VISIT_SCHEDULED" || c.status === "EXTRA_INSPECTION";
  const repairing = c.status === "REPAIR_BOOKED";
  const reported = c.photos.filter((p) => p.kind === "original" || p.kind === "reopen");
  const evidence = c.photos.filter((p) => p.kind !== "original" && p.kind !== "reopen");

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    await fn();
    setNote("");
    setPhoto(null);
    setBusy(false);
    toast.success(msg);
  }

  return (
    <div>
      <MobileHeader title={c.id} back="/technician/jobs" />
      <div className="space-y-4 p-4">
        {/* Summary */}
        <Section>
          <PhotoThumb photo={c.photos[0]} className="aspect-[16/9] w-full" />
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand">{jobKind(c)}</span>
            <UrgencyBadge urgency={c.urgency} />
          </div>
          <h2 className="text-lg font-semibold leading-snug">{c.summary}</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 text-zinc-400" /> {fmtDateTime(jobSlot(c))}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-zinc-400" /> {c.unitId} · Block {unit.block}, level {unit.floor} · {c.location || "location not given"}
            </li>
            <li className="flex items-center gap-2">
              <UserRound className="size-4 text-zinc-400" /> {c.buyerId === DEMO_BUYER.id ? DEMO_BUYER.name : `Owner of ${c.unitId}`}
            </li>
          </ul>
          <div className="mt-3 rounded-xl bg-zinc-50 p-3">
            <StatusBadge status={c.status} />
            <p className="mt-1.5 text-sm text-zinc-700">{TECH_EXPLAIN[c.status]}</p>
          </div>
        </Section>

        {/* Actions */}
        {inspecting && (
          <Section title={c.status === "EXTRA_INSPECTION" ? "Detailed inspection result *" : "Inspection result *"}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="What did you find? (shown to the buyer)"
              className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
            />
            <p className="-mt-1 text-right text-xs text-zinc-400">{note.length} / 500</p>
            <PhotoInput value={photo} onChange={setPhoto} label="Add inspection photo (optional)" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!note.trim() || busy}
                onClick={() => run(() => recordVerdict(c.id, "VALID", note.trim(), photo), "Marked valid: buyer asked to book a repair")}
                className="h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                Valid
              </button>
              <button
                type="button"
                disabled={!note.trim() || busy}
                onClick={() => run(() => recordVerdict(c.id, "INVALID", note.trim(), photo), "Marked invalid: case closed")}
                className="h-12 rounded-xl border-2 border-zinc-800 text-sm font-semibold text-zinc-800 disabled:border-zinc-200 disabled:text-zinc-400"
              >
                Invalid
              </button>
            </div>
            <button type="button" onClick={() => setNote("Active seepage confirmed at ceiling joint; moisture reading high.")} className="mt-2 text-xs font-medium text-brand">
              Fill example note (demo)
            </button>
          </Section>
        )}

        {repairing && (
          <Section title="Repair *">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="What did you repair? The VerificationAgent uses this to build the buyer's sign-off checklist."
              className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
            />
            <p className="-mt-1 text-right text-xs text-zinc-400">{note.length} / 500</p>
            <PhotoInput value={photo} onChange={setPhoto} label="Add repair evidence photo" />
            {!photo && (
              <button type="button" onClick={() => setPhoto(samplePhoto("repaired"))} className="mt-2 block text-xs font-medium text-brand">
                Use a sample photo (demo)
              </button>
            )}
            <PrimaryButton className="mt-3" disabled={!note.trim() || busy} onClick={() => run(() => markRepaired(c.id, note.trim(), photo), "Marked repaired: buyer asked to sign off")}>
              Mark Repaired
            </PrimaryButton>
            <button type="button" onClick={() => setNote("Resealed ceiling pipe joint and replaced stained ceiling board.")} className="mt-2 text-xs font-medium text-brand">
              Fill example note (demo)
            </button>
          </Section>
        )}

        {/* Buyer's report */}
        <Section title="Buyer's report">
          <p className="whitespace-pre-line rounded-xl bg-zinc-50 p-3 text-sm text-zinc-800">&ldquo;{c.description}&rdquo;</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {reported.map((p, i) => (
              <PhotoThumb key={i} photo={p} className="aspect-square" />
            ))}
          </div>
        </Section>

        {/* What the agents worked out for this job */}
        <Section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-violet-600" /> AI assistance
          </h2>
          <div className="space-y-3">
            <AgentCard agent="IntakeAgent">
              <dl>
                <Row label="Category">
                  {CATEGORY_LABEL[c.category]} › {c.subCategory}
                </Row>
                <Row label="Location">{c.location || "—"}</Row>
                <Row label="Urgency">
                  <UrgencyBadge urgency={c.urgency} />
                </Row>
              </dl>
            </AgentCard>
            {c.triageReason && <AgentCard agent="TriageAgent: why you">{c.triageReason}</AgentCard>}
            {c.similar.length > 0 && (
              <AgentCard agent={`SimilarDefectAgent: ${c.occurrence}× in this unit`}>
                <SimilarList c={c} />
              </AgentCard>
            )}
            {approval && (
              <AgentCard agent={`RecurrenceAgent: extra inspection ${approval.status}`}>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {approval.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </AgentCard>
            )}
            {c.inspectionBrief && (
              <AgentCard agent="InitialInspectionAgent: inspection brief">
                <InspectionBriefView c={c} interactive={inspecting} />
              </AgentCard>
            )}
            {c.verificationGuide && (
              <AgentCard agent="VerificationAgent: checklist sent to the buyer">
                <ol className="list-decimal space-y-1 pl-4 text-xs">
                  {c.verificationGuide.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </AgentCard>
            )}
          </div>
        </Section>

        {/* Inspection, repair and sign-off record */}
        {(c.verdict || c.repairNote) && (
          <Section title="Your record">
            <dl>
              {c.verdict && <Row label="Verdict">{c.verdict.outcome === "VALID" ? `Valid · ${fmtDate(c.verdict.at)}` : `Invalid · ${fmtDate(c.verdict.at)}`}</Row>}
              {c.repairedAt && <Row label="Repaired">{fmtDate(c.repairedAt)}</Row>}
              {c.reopenCount > 0 && <Row label="Reopened">{c.reopenCount}×</Row>}
            </dl>
            {c.verdict?.note && <p className="mt-2 text-sm text-zinc-700">&ldquo;{c.verdict.note}&rdquo;</p>}
            {c.repairNote && <p className="mt-1 text-sm text-zinc-700">Repair: {c.repairNote}</p>}
            {evidence.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {evidence.map((p, i) => (
                  <PhotoThumb key={i} photo={p} className="aspect-square" />
                ))}
              </div>
            )}
          </Section>
        )}

        {(c.status === "PENDING_SIGNOFF" || c.signoff) && (
          <Section title="Sign-off">
            <ul className="space-y-2 text-sm">
              {[
                ["Buyer", c.signoff?.buyer?.at],
                ["Developer", c.signoff?.developer?.at],
              ].map(([who, at]) => (
                <li key={who} className="flex items-center gap-2">
                  {at ? <Check className="size-4 text-emerald-600" /> : <CircleDashed className="size-4 text-zinc-400" />}
                  {who}: {at ? `signed ${fmtDateTime(at)}` : "waiting"}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {c.status === "ESCALATION_PENDING" && (
          <p className="flex gap-2 rounded-2xl bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-200">
            <ShieldAlert className="size-4 shrink-0" /> SDP staff are reviewing an extra inspection for this recurring defect.
          </p>
        )}

        {agentEvents.length > 0 && (
          <Section>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <History className="size-4 text-zinc-500" /> Agent activity
            </h2>
            <EventTimeline events={agentEvents} compact />
          </Section>
        )}
      </div>
    </div>
  );
}
