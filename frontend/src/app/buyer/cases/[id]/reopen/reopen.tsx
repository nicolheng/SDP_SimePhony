"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useCase, useCaseId } from "@/components/case-views";
import { MobileHeader, PrimaryButton, Section } from "@/components/mobile";
import { PhotoInput, PhotoThumb, samplePhoto } from "@/components/photo";
import { canReopen, reopenCase } from "@/lib/api";
import { RULES } from "@/lib/constants";
import { useDemo } from "@/lib/store";

export function ReopenCase() {
  const id = useCaseId();
  const c = useCase(id);
  const now = useDemo((s) => s.now);
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!c) return <MobileHeader title="Case not found" back="/buyer/cases" />;

  if (!canReopen(c, now))
    return (
      <div>
        <MobileHeader title="Reopen Case" back={`/buyer/cases/${c.id}`} />
        <p className="p-6 text-sm text-zinc-600">
          This case can no longer be reopened (cases can be reopened within {RULES.gracePeriodDays} days of closing). Please submit a new report.
        </p>
      </div>
    );

  return (
    <div>
      <MobileHeader title="Reopen Case" back={`/buyer/cases/${c.id}`} />
      <div className="space-y-4 p-4">
        <Section>
          <p className="text-sm font-semibold">{c.summary}</p>
          <p className="text-xs text-zinc-500">{c.id} · same case, same details — we only need a new photo.</p>
          <div className="mt-3 w-28">
            {c.photos[0] && <PhotoThumb photo={c.photos[0]} className="aspect-square" />}
          </div>
        </Section>
        <Section title="1. New photo *">
          <PhotoInput value={photo} onChange={setPhoto} label="Take a new photo" required />
          {!photo && (
            <button type="button" onClick={() => setPhoto(samplePhoto("leak-worse"))} className="mt-2 text-xs font-medium text-brand">
              Use a sample photo (demo)
            </button>
          )}
        </Section>
        <Section title="2. What happened? (optional)">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="e.g. Leaking again after last night's rain"
            className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
          />
        </Section>
        <PrimaryButton
          disabled={!photo || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await reopenCase(c.id, text.trim() || "Problem came back", photo!);
              toast.success("Case reopened");
              router.push(`/buyer/cases/${c.id}`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Reopening…" : "Reopen Case"}
        </PrimaryButton>
      </div>
    </div>
  );
}
