"use client";
import { CheckCircle2, CircleAlert, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCase, useCaseEvents } from "@/components/case-views";
import { BuildingBanner } from "@/components/illustrations";
import { MobileHeader, PrimaryButton, primaryButtonClass, Section } from "@/components/mobile";
import { PhotoInput, samplePhoto } from "@/components/photo";
import { SlotPicker } from "@/components/slot-picker";
import { UrgencyBadge } from "@/components/status-badge";
import { upcomingSlots } from "@/lib/agents";
import { submitReport } from "@/lib/api";
import { CATEGORY_LABEL, DEMO_BUYER, getTechnician, PROJECT_NAME } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";

const EXAMPLES = [
  "Siling bilik utama bocor lagi lepas hujan, air menitis atas almari",
  "Ceiling in master bedroom leaking again after heavy rain",
  "Socket kat dapur tak function, ada bau hangus sikit",
  "Bocor",
];

export default function ReportDefect() {
  const now = useDemo((s) => s.now);
  const slots = useMemo(() => upcomingSlots(now), [now]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [nonDefect, setNonDefect] = useState<string | null>(null);

  async function submit() {
    if (!photo || !text.trim() || !slot) return;
    setBusy(true);
    setNonDefect(null);
    try {
      const r = await submitReport({ description: text.trim(), photoUrl: photo, slot }, setCaseId);
      if (r.nonDefect) setNonDefect(r.nonDefect);
    } catch {
      toast.error("Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (caseId)
    return (
      <Processing
        caseId={caseId}
        done={!busy}
        onReset={() => {
          setCaseId(null);
          setPhoto(null);
          setText("");
          setSlot(null);
        }}
      />
    );

  return (
    <div>
      <MobileHeader title="Submit Defect" back="/buyer" />
      <div className="-mt-7 h-44">
        <BuildingBanner />
      </div>
      <div className="relative mx-4 -mt-10 rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
        <p className="text-lg font-semibold">{PROJECT_NAME}</p>
        <p className="text-sm text-zinc-500">
          Unit {DEMO_BUYER.unitId} · {DEMO_BUYER.name}
        </p>
        <p className="mt-2 text-xs text-zinc-500">Tell us what&apos;s wrong. Our assistant will categorise it and book the right technician.</p>
      </div>
      <div className="space-y-4 p-4">
        <Section title="1. Photo of the defect *">
          <PhotoInput value={photo} onChange={setPhoto} label="Take or upload a photo" required />
          {!photo && (
            <button type="button" onClick={() => setPhoto(samplePhoto())} className="mt-2 text-xs font-medium text-brand">
              Use a sample photo (demo)
            </button>
          )}
        </Section>

        <Section title="2. Describe the problem *">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="What's wrong, which room, and where exactly? English or BM is fine."
            className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <p className="-mt-1 text-right text-xs text-zinc-400">{text.length} / 500</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setText(e)} className="rounded-full bg-zinc-100 px-2.5 py-1 text-left text-[11px] text-zinc-600 hover:bg-zinc-200">
                {e.length > 38 ? e.slice(0, 38) + "…" : e}
              </button>
            ))}
          </div>
        </Section>

        <Section title="3. Book your inspection visit *">
          <p className="-mt-1 mb-3 text-xs text-zinc-500">Your first appointment is an inspection visit: a technician checks the defect. If it&apos;s confirmed, you book the repair afterwards.</p>
          <SlotPicker available={slots} value={slot} onChange={setSlot} />
        </Section>

        {nonDefect && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{nonDefect}</p>}

        <PrimaryButton disabled={!photo || !text.trim() || !slot || busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit Defect"}
        </PrimaryButton>
        {(!photo || !text.trim() || !slot) && <p className="text-center text-xs text-zinc-500">Photo, description and a visit slot are required.</p>}
      </div>
    </div>
  );
}

function Processing({ caseId, done, onReset }: { caseId: string; done: boolean; onReset: () => void }) {
  const c = useCase(caseId);
  const events = useCaseEvents(caseId);
  if (!c) return null;
  // Buyer-facing progress only: no agent names, no related-case details.
  const did = (agent: string) => events.some((e) => e.type === "agent.step" && e.agent === agent);
  const booked = c.status === "VISIT_SCHEDULED" && !!c.visitSlot;
  const stages: { label: string; state: "done" | "active" | "attention" | "todo" }[] = [
    { label: "Report received", state: "done" },
    { label: "Understanding your report", state: did("IntakeAgent") ? "done" : "active" },
    c.status === "INFO_NEEDED"
      ? { label: "Waiting for one more detail from you", state: "attention" }
      : { label: "Finding a technician", state: did("TriageAgent") ? "done" : did("IntakeAgent") ? "active" : "todo" },
    ...(c.status === "INFO_NEEDED" ? [] : [{ label: "Inspection visit booked", state: booked ? ("done" as const) : ("todo" as const) }]),
  ];
  const tech = getTechnician(c.technicianId);

  return (
    <div>
      <MobileHeader title="Report submitted" back="/buyer" />
      <div className="space-y-4 p-4">
        <Section>
          <p className="flex items-center gap-2 text-sm font-semibold">
            {done ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Loader2 className="size-5 animate-spin text-brand" />}
            {done ? (c.status === "INFO_NEEDED" ? "We need one more detail" : "All set") : "Processing your report…"}
          </p>
          <ol className="mt-3 space-y-2.5">
            {stages.map((st) => (
              <li key={st.label} className="flex items-center gap-2.5 text-sm">
                {st.state === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : st.state === "active" ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
                ) : st.state === "attention" ? (
                  <CircleAlert className="size-4 shrink-0 text-amber-600" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border-2 border-zinc-200" />
                )}
                <span className={st.state === "todo" ? "text-zinc-400" : "text-zinc-800"}>{st.label}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="What we understood">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" />
            <span className="text-sm font-medium">{c.summary}</span>
            <UrgencyBadge urgency={c.urgency} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {CATEGORY_LABEL[c.category]} · {c.subCategory} · {c.location || "location not given"}
          </p>
        </Section>


        {c.status === "INFO_NEEDED" && (
          <Section>
            <p className="text-sm font-semibold text-amber-800">One more question</p>
            <p className="mt-1 text-sm text-zinc-700">{c.followUpQuestion}</p>
          </Section>
        )}

        {c.status === "VISIT_SCHEDULED" && tech && c.visitSlot && (
          <Section title="Inspection visit booked">
            <p className="text-sm">
              <span className="font-medium">{tech.name}</span> will visit on <span className="font-medium">{fmtDateTime(c.visitSlot)}</span>.
            </p>
          </Section>
        )}

        {done && (
          <Link href={`/buyer/cases/${c.id}`} className={primaryButtonClass}>
            {c.status === "INFO_NEEDED" ? "Answer question" : "View my case"}
          </Link>
        )}
        {done && (
          <button type="button" onClick={onReset} className="w-full text-center text-sm font-semibold text-brand">
            Report another defect
          </button>
        )}
      </div>
    </div>
  );
}
