"use client";
import { CalendarClock, History, MapPin, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SimilarList, useCase, useCaseId } from "@/components/case-views";
import { InspectionBriefView } from "@/components/inspection-brief";
import { MobileHeader, PrimaryButton, Section } from "@/components/mobile";
import { PhotoInput, PhotoThumb, samplePhoto } from "@/components/photo";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { markRepaired, recordVerdict } from "@/lib/api";
import { CATEGORY_LABEL, getTechnician } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { jobSlot } from "../../jobs";

export function JobDetail() {
  const id = useCaseId();
  const c = useCase(id);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!c) return <MobileHeader title="Job not found" back="/technician" />;
  const inspecting = c.status === "VISIT_SCHEDULED" || c.status === "EXTRA_INSPECTION";
  const repairing = c.status === "REPAIR_BOOKED";

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
      <MobileHeader title={`${c.id} · ${c.unitId}`} back="/technician" />
      <div className="space-y-4 p-4">
        <Section>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">{c.summary}</p>
            <UrgencyBadge urgency={c.urgency} />
          </div>
          <p className="text-xs text-zinc-500">
            {CATEGORY_LABEL[c.category]} › {c.subCategory}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-700">
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-zinc-400" /> {c.unitId} · {c.location || "—"}
            </li>
            <li className="flex items-center gap-2">
              <CalendarClock className="size-4 text-zinc-400" /> {fmtDateTime(jobSlot(c))}
            </li>
            <li className="flex items-center gap-2">
              <User className="size-4 text-zinc-400" /> {getTechnician(c.technicianId)?.name}
            </li>
          </ul>
          <StatusBadge status={c.status} className="mt-3" />
        </Section>

        <Section title="Buyer's description">
          <p className="whitespace-pre-line text-sm text-zinc-700">{c.description}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {c.photos.map((p, i) => (
              <PhotoThumb key={i} photo={p} className="aspect-square" />
            ))}
          </div>
        </Section>

        {c.inspectionBrief && (
          <Section title="Inspection brief">
            <InspectionBriefView c={c} interactive={inspecting} />
          </Section>
        )}

        {c.similar.length > 0 && !c.inspectionBrief && (
          <Section>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-amber-600" /> Related cases (AI)
            </p>
            <SimilarList c={c} />
          </Section>
        )}

        {c.repairNote && !repairing && (
          <Section title="Repair note">
            <p className="text-sm text-zinc-700">{c.repairNote}</p>
          </Section>
        )}

        {inspecting && (
          <Section title={c.status === "EXTRA_INSPECTION" ? "Detailed inspection result" : "Inspection result"}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What did you find? (shown to the buyer)"
              className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
            />
            <div className="mt-3">
              <PhotoInput value={photo} onChange={setPhoto} label="Add inspection photo (optional)" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!note.trim() || busy}
                onClick={() => run(() => recordVerdict(c.id, "VALID", note.trim(), photo), "Marked valid")}
                className="h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-40"
              >
                Valid
              </button>
              <button
                type="button"
                disabled={!note.trim() || busy}
                onClick={() => run(() => recordVerdict(c.id, "INVALID", note.trim(), photo), "Marked invalid")}
                className="h-12 rounded-xl bg-zinc-800 text-sm font-semibold text-white disabled:opacity-40"
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
          <Section title="Repair">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What did you repair? (used to build the buyer's verification checklist)"
              className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
            />
            <div className="mt-3">
              <PhotoInput value={photo} onChange={setPhoto} label="Add repair evidence photo" />
              {!photo && (
                <button type="button" onClick={() => setPhoto(samplePhoto("repaired"))} className="mt-2 text-xs font-medium text-brand">
                  Use a sample photo (demo)
                </button>
              )}
            </div>
            <PrimaryButton className="mt-3" disabled={!note.trim() || busy} onClick={() => run(() => markRepaired(c.id, note.trim(), photo), "Marked repaired — buyer asked to verify")}>
              Mark Repaired
            </PrimaryButton>
            <button type="button" onClick={() => setNote("Resealed ceiling pipe joint and replaced stained ceiling board.")} className="mt-2 text-xs font-medium text-brand">
              Fill example note (demo)
            </button>
          </Section>
        )}
      </div>
    </div>
  );
}
