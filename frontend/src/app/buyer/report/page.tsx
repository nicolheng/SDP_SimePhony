"use client";
import { Bot, CheckCircle2, History, Loader2, Sparkles } from "lucide-react";
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

        <Section title="3. Inspection visit *">
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
  const steps = events.filter((e) => e.type === "agent.step");
  if (!c) return null;
  const tech = getTechnician(c.technicianId);

  return (
    <div>
      <MobileHeader title="Report submitted" back="/buyer" />
      <div className="space-y-4 p-4">
        <Section>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {done ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Loader2 className="size-5 animate-spin text-brand" />}
            {done ? "All set" : "Our assistant is reviewing your report…"}
          </div>
          <ul className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.id} className="flex gap-2 text-xs text-zinc-600">
                <Bot className="mt-0.5 size-3.5 shrink-0 text-violet-600" />
                <span>
                  <span className="font-medium text-violet-700">{s.agent}</span> · {s.message}
                </span>
              </li>
            ))}
          </ul>
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

        {c.similar.length > 0 && (
          <Section>
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <History className="size-4" /> This has happened before
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              We linked your report to {c.similar.filter((s) => s.unitId === c.unitId).length} earlier report(s) in your unit
              {c.similar.some((s) => s.unitId !== c.unitId) && " and similar reports in units above and below you"}, so the technician has the full history.
            </p>
          </Section>
        )}

        {c.status === "INFO_NEEDED" && (
          <Section>
            <p className="text-sm font-semibold text-amber-800">One more question</p>
            <p className="mt-1 text-sm text-zinc-700">{c.followUpQuestion}</p>
          </Section>
        )}

        {c.status === "VISIT_SCHEDULED" && tech && c.visitSlot && (
          <Section title="Inspection booked">
            <p className="text-sm">
              <span className="font-medium">{tech.name}</span> will visit on <span className="font-medium">{fmtDateTime(c.visitSlot)}</span>.
            </p>
            {c.triageReason && <p className="mt-1 text-xs text-zinc-500">{c.triageReason}</p>}
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
