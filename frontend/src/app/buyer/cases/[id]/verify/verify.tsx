"use client";
import { Bot, Check, CircleHelp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useCase, useCaseId } from "@/components/case-views";
import { MobileHeader, Section } from "@/components/mobile";
import { PhotoInput, PhotoThumb, samplePhoto } from "@/components/photo";
import { RatingDialog } from "@/components/rating";
import { signoffDeadline, submitVerification } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { useOffline } from "@/lib/store";
import { cn } from "@/lib/utils";

export function VerifyRepair() {
  const id = useCaseId();
  const c = useCase(id);
  const router = useRouter();
  const [checked, setChecked] = useState<number[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // Set once the buyer has signed off: the satisfaction rating pop-up shows, then we go back to the case.
  const [rating, setRating] = useState(false);
  const offline = useOffline();

  if (!c) return <MobileHeader title="Case not found" back="/buyer/cases" />;
  const g = c.verificationGuide;
  const original = c.photos.find((p) => p.kind === "original");
  const repair = [...c.photos].reverse().find((p) => p.kind === "repair");

  async function submit(result: "FIXED" | "NOT_FIXED" | "CANNOT_VERIFY") {
    if (result === "NOT_FIXED" && !photo) {
      toast.error("Please add a new photo showing the problem.");
      return;
    }
    setBusy(true);
    try {
      await submitVerification(c!.id, result, note.trim(), photo);
      toast.success(result === "FIXED" ? "Signed off: case closed" : result === "NOT_FIXED" ? "Case reopened" : "Saved — check again when you can");
      if (result === "FIXED") setRating(true);
      else router.push(`/buyer/cases/${c!.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  // After signing off the case has left PENDING_SIGNOFF, so this also covers the rating step.
  if (rating || c.status !== "PENDING_SIGNOFF" || !g || c.signoff?.buyer || !c.signoff?.developer)
    return (
      <div>
        <MobileHeader title="Check & Sign Off" back={`/buyer/cases/${c.id}`} />
        <p className="p-6 text-sm text-zinc-500">{rating ? "Signed off. Thank you!" : "Nothing to sign off for this case right now."}</p>
        {rating && <RatingDialog caseId={c.id} onDone={() => router.push(`/buyer/cases/${c.id}`)} />}
      </div>
    );

  return (
    <div>
      <MobileHeader title="Check & Sign Off" back={`/buyer/cases/${c.id}`} />
      <div className="space-y-4 p-4">
        <Section>
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700">
            <Bot className="size-3.5" /> Verification guide for {c.id}
          </p>
          <p className="mt-1 text-sm text-zinc-700">{g.intro}</p>
          <p className="mt-2 text-xs font-medium text-amber-800">
            Sign off by {fmtDate(signoffDeadline(c))}. {c.urgency === "high" ? "After that our team will follow up." : "After that the case closes automatically."}
          </p>
        </Section>

        <Section title="Before and after">
          <div className="grid grid-cols-2 gap-2">
            {original && <PhotoThumb photo={original} className="aspect-[4/3]" />}
            {repair ? (
              <PhotoThumb photo={repair} className="aspect-[4/3]" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center rounded-lg bg-zinc-100 text-xs text-zinc-400">No repair photo</div>
            )}
          </div>
        </Section>

        <Section title="1. Check these points">
          <ol className="space-y-2">
            {g.steps.map((s, i) => {
              const on = checked.includes(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setChecked(on ? checked.filter((x) => x !== i) : [...checked, i])}
                    className={cn("flex w-full gap-3 rounded-xl p-3 text-left text-sm ring-1", on ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-zinc-200")}
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border-2", on ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300")}>
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {s}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-zinc-500">{g.ifFails}</p>
        </Section>

        <Section title="2. Photo (required if not fixed)">
          <PhotoInput value={photo} onChange={setPhoto} label="Add a photo of the repaired area" />
          {!photo && (
            <div className="mt-2 flex gap-3 text-xs font-medium text-brand">
              <button type="button" onClick={() => setPhoto(samplePhoto("repaired"))}>Sample: looks fixed</button>
              <button type="button" onClick={() => setPhoto(samplePhoto("leak"))}>Sample: still leaking</button>
            </div>
          )}
        </Section>

        <Section title="3. Anything to add? (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Looks dry after running the shower"
            className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
          />
        </Section>

        <h2 className="px-1 text-sm font-semibold text-zinc-900">4. Your result</h2>
        <label className="flex gap-3 rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-700">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
          I have checked the repair and confirm the defect is fixed. The developer has already approved it, so the case closes when I sign off.
        </label>

        <div className="space-y-2">
          <button
            type="button"
            disabled={busy || !confirm || offline}
            onClick={() => submit("FIXED")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Check className="size-4" /> Fixed — Sign Off
          </button>
          <button
            type="button"
            disabled={busy || offline}
            onClick={() => submit("NOT_FIXED")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"
          >
            <X className="size-4" /> Still Not Fixed
          </button>
          <button
            type="button"
            disabled={busy || offline}
            onClick={() => submit("CANNOT_VERIFY")}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white text-sm font-semibold text-zinc-700 disabled:opacity-50"
          >
            <CircleHelp className="size-4" /> Cannot Verify Yet
          </button>
        </div>
      </div>
    </div>
  );
}
