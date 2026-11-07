"use client";
import { CalendarClock, CheckCircle2, CircleAlert, Lightbulb, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AssetPicker } from "@/components/asset-picker";
import { TechAvatar } from "@/components/brand";
import { useCase, useCaseEvents } from "@/components/case-views";
import { FollowUpForm } from "@/components/follow-up-form";
import { BuildingBanner } from "@/components/illustrations";
import { MobileHeader, PrimaryButton, primaryButtonClass, Section } from "@/components/mobile";
import { PhotoInput } from "@/components/photo";
import { SlotPicker } from "@/components/slot-picker";
import { UrgencyBadge } from "@/components/status-badge";
import { fetchVisitSlots, submitReport } from "@/lib/api";
import { DEMO_BUYER, getTechnician, getUnit, PROJECT_NAME } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { setBuyerUnit, useBuyerUnit } from "@/lib/session";
import { useDemo } from "@/lib/store";
import type { Category, Urgency } from "@/lib/types";

const EXAMPLES = ["Ceiling in master bedroom seems to be leaking", "Bocor"];

/** What the priority badge means for the buyer (high urgency books the earliest slot and is watched by SDP staff). */
const PRIORITY_NOTE: Record<Urgency, string> = {
  high: "High priority: earliest available inspection, monitored by our team",
  normal: "Normal priority: inspection at your selected time",
  low: "Low priority (cosmetic): inspection at your selected time",
};

/** Interim care advice until the inspection visit. */
const CARE_TIP: Record<Category, string> = {
  water_leak: "Keep the area dry, move valuables and furniture away, and avoid using power points nearby.",
  plumbing: "Turn off the nearest stop valve if water is leaking, and wipe up standing water.",
  drainage: "Avoid pouring oil or debris into the drain; use another bathroom or sink if possible.",
  sanitary_fittings: "Avoid forcing the fitting; turn off its water supply valve if it keeps running or leaking.",
  electrical: "Do not use the affected socket or switch. If you smell burning or see sparks, switch off at the DB box.",
  wall_crack: "Avoid hanging items on or drilling into the cracked area. Take a photo if the crack grows.",
  structural_crack: "Keep clear of the affected area and avoid placing heavy loads near it. Contact us if it widens.",
  tiles: "Avoid walking on or placing heavy items over loose or hollow tiles; mark the spot to prevent trips.",
  ceiling: "Keep clear of the area below and move furniture away in case of falling debris.",
  door_window: "Avoid forcing the door or window; keep it locked if it closes securely.",
  paint: "Keep the area dry and avoid scraping or repainting it before the inspection.",
  other: "Avoid using or disturbing the affected area until the technician has inspected it.",
};

export default function ReportDefect() {
  const now = useDemo((s) => s.now);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  useEffect(() => {
    fetchVisitSlots()
      .then((s) => {
        setSlots(s);
        setSlotError(null);
      })
      .catch((e: Error) => setSlotError(e.message));
  }, [now]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [nonDefect, setNonDefect] = useState<string | null>(null);
  // The asset (unit) this report is for; the buyer can switch to another property registered to them.
  const unitId = useBuyerUnit();
  const [picking, setPicking] = useState(false);
  // Defects can be reported until the unit's defect liability period ends (the backend refuses after).
  const dlpEnd = getUnit(unitId).dlpExpiry;
  const dlpOver = !!dlpEnd && new Date(`${dlpEnd}T23:59:59+08:00`) < new Date(now);

  async function submit() {
    if (!photo || !text.trim() || !slot) return;
    setBusy(true);
    setNonDefect(null);
    try {
      const r = await submitReport({ description: text.trim(), photoUrl: photo, slot, unitId, buyerId: DEMO_BUYER.id }, setCaseId);
      if (r.nonDefect) setNonDefect(r.nonDefect);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (caseId)
    return (
      <Processing caseId={caseId} done={!busy} />
    );

  return (
    <div>
      <MobileHeader title="Submit Defect" back="/buyer" />
      <div className="-mt-7 h-44">
        <BuildingBanner />
      </div>
      <div className="relative mx-4 -mt-10 rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-lg font-semibold">{PROJECT_NAME}</p>
            <p className="text-sm text-zinc-500">
              Unit {unitId} · {DEMO_BUYER.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand/40 hover:bg-red-50"
          >
            Select Another Asset
          </button>
        </div>
        {picking && <AssetPicker value={unitId} onPick={setBuyerUnit} onClose={() => setPicking(false)} />}
        {dlpOver && (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
            Your Defect Liability Period ended on {fmtDate(`${dlpEnd}T12:00:00+08:00`)}, so new defects can&apos;t be reported in the app. Please contact the developer.
          </p>
        )}
      </div>
      <div className="space-y-4 p-4">
        <Section title="1. Defect Photo *">
          <PhotoInput value={photo} onChange={setPhoto} />
        </Section>

        <Section title="2. Defect Description *">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Tell us what's wrong."
            className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <p className="-mt-1 text-right text-xs text-zinc-400">{text.length} / 500</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setText(e)} className="rounded-full bg-zinc-100 px-2.5 py-1 text-left text-[11px] text-zinc-600 hover:bg-zinc-200">
                {e}
              </button>
            ))}
          </div>
        </Section>

        <Section title="3. Book Your Inspection Visit *">
          {slotError ? (
            <p className="text-sm text-red-600">{slotError}</p>
          ) : slots ? (
            <SlotPicker available={slots} value={slot} onChange={setSlot} />
          ) : (
            <p className="text-sm text-zinc-500">Loading available times…</p>
          )}
        </Section>

        {nonDefect && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{nonDefect}</p>}

        <PrimaryButton disabled={!photo || !text.trim() || !slot || busy || dlpOver} onClick={submit}>
          {busy ? "Submitting…" : "Submit Defect"}
        </PrimaryButton>
      </div>
    </div>
  );
}

type Stage = { label: string; state: "done" | "active" | "attention" | "todo" };

/** Buyer-facing progress only: no agent names, no related-case details. */
function stagesFor(c: NonNullable<ReturnType<typeof useCase>>, events: ReturnType<typeof useCaseEvents>): Stage[] {
  const did = (agent: string) => events.some((e) => e.type === "agent.step" && e.agent === agent);
  const review = c.status === "PENDING_REVIEW";
  const booked = c.status === "VISIT_SCHEDULED" && !!c.visitSlot;
  return [
    { label: "Report received", state: "done" },
    // With USE_AI_AGENTS=only the agents run after the report is saved: a case that has left SUBMITTED is past
    // this stage even without an IntakeAgent step (e.g. held for review when the AI failed).
    { label: "Understanding your report", state: did("IntakeAgent") || c.status !== "SUBMITTED" ? "done" : "active" },
    c.status === "INFO_NEEDED"
      ? { label: "Waiting for one more detail from you", state: "attention" }
      : review
        ? { label: "Our team is checking your report", state: "attention" }
        : { label: "Finding a technician", state: did("TriageAgent") ? "done" : did("IntakeAgent") ? "active" : "todo" },
    ...(c.status === "INFO_NEEDED" ? [] : [{ label: "Inspection visit booked", state: booked ? ("done" as const) : ("todo" as const) }]),
  ];
}

function Processing({ caseId, done }: { caseId: string; done: boolean }) {
  const c = useCase(caseId);
  const events = useCaseEvents(caseId);
  // Stages are revealed one at a time: each waits (spinner, grey) until the previous one is ticked.
  const [revealed, setRevealed] = useState(0);
  const real = c ? stagesFor(c, events) : [];
  const currentDone = real[revealed]?.state === "done";
  useEffect(() => {
    if (!currentDone) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 700);
    return () => clearTimeout(t);
  }, [currentDone, revealed]);
  // The care tip is picked from the category, so it waits for IntakeAgent's result on the case (a new case has
  // no category yet and reads as "other"), then shows one tick after the title, like the stages above.
  const categorized = revealed > 1 && real[1]?.state === "done" && !!c?.summary;
  const [tipShown, setTipShown] = useState(false);
  useEffect(() => {
    if (!categorized || tipShown) return;
    const t = setTimeout(() => setTipShown(true), 700);
    return () => clearTimeout(t);
  }, [categorized, tipShown]);
  if (!c) return null;
  // Also not settled while a stage is still running (e.g. re-processing after the buyer answers a question).
  const settled = done && (revealed >= real.length || (real[revealed].state !== "done" && real[revealed].state !== "active"));
  const stages = real.map((st, i) => ({
    label: st.label,
    state: i < revealed ? st.state : i === revealed ? (st.state === "attention" || (settled && st.state === "todo") ? st.state : "active") : "todo",
  }));
  const review = c.status === "PENDING_REVIEW";
  const understood = stages[1]?.state === "done";
  const tech = getTechnician(c.technicianId);


  return (
    <div>
      <MobileHeader title="Report Submitted" back="/buyer" />
      <div className="space-y-4 p-4">
        <Section>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {settled ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Loader2 className="size-5 animate-spin text-zinc-400" />}
            {settled ? (c.status === "INFO_NEEDED" ? "We need one more detail" : review ? "Received: our team is checking it" : "All set") : "Processing your report…"}
          </p>
          <ol className="mt-3 space-y-2.5">
            {stages.map((st) => (
              <li key={st.label} className="flex items-center gap-2.5 text-sm">
                {st.state === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : st.state === "active" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400" />
                ) : st.state === "attention" ? (
                  <CircleAlert className="size-4 shrink-0 text-amber-600" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border-2 border-zinc-200" />
                )}
                <span className={st.state === "done" || st.state === "attention" ? "text-zinc-900" : "text-zinc-400"}>{st.label}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* Each card appears with its stage: the assessment once "Understanding your report" is ticked (with
            USE_AI_AGENTS=only that is when IntakeAgent finishes), while the booking is still being found below. */}
        {!understood && (
          <Section>
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
            <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-zinc-100" />
          </Section>
        )}

        {understood && (
          <Section title="Defect Assessment">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand" />
              <span className="text-sm font-medium">{c.summary}</span>
              <UrgencyBadge urgency={c.urgency} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">{PRIORITY_NOTE[c.urgency] ?? PRIORITY_NOTE.normal}</p>
            {tipShown && (
              <div className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <p>
                  <span className="font-semibold">Until the visit: </span>
                  {CARE_TIP[c.category] ?? CARE_TIP.other}
                </p>
              </div>
            )}
          </Section>
        )}


        {settled && c.status === "INFO_NEEDED" && (
          <Section>
            <p className="text-sm font-semibold text-amber-800">One more question</p>
            <p className="mt-1 text-sm text-zinc-700">{c.followUpQuestion}</p>
            <FollowUpForm caseId={c.id} />
          </Section>
        )}

        {understood && !settled && c.status !== "INFO_NEEDED" && !review && (
          <Section title="Scheduled Inspection">
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400" /> Finding a technician for your visit…
            </p>
          </Section>
        )}

        {settled && c.status === "VISIT_SCHEDULED" && tech && c.visitSlot && (
          <Section title="Scheduled Inspection">
            <div className="flex items-center gap-3">
              <TechAvatar tech={tech} className="size-11 shrink-0 ring-1 ring-zinc-200" iconClassName="size-6" />
              <div className="text-sm">
                <p>
                  <span className="font-medium">{tech.name}</span> will visit on
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-medium">
                  <CalendarClock className="size-4 text-brand" /> {fmtDateTime(c.visitSlot)}
                </p>
              </div>
            </div>
          </Section>
        )}

        {settled && c.status !== "INFO_NEEDED" && (
          <Link href={`/buyer/cases/${c.id}`} className={primaryButtonClass}>
            View my case
          </Link>
        )}
      </div>
    </div>
  );
}
