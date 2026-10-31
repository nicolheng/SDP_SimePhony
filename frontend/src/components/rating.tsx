"use client";
import { Loader2, Star } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { rateRepair } from "@/lib/api";
import { useOffline } from "@/lib/store";
import { cn } from "@/lib/utils";

export const STAR_LABEL = ["", "Very unhappy", "Unhappy", "Okay", "Happy", "Very happy"];

/** Read-only stars, e.g. on the SDP side. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-[1em]", n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />
      ))}
    </span>
  );
}

/** Asks the buyer to rate the repair after they sign off. `onDone` runs after rating or "Not now". */
export function RatingDialog({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();

  async function submit() {
    setBusy(true);
    try {
      await rateRepair(caseId, stars, comment.trim());
      toast.success("Thank you for your feedback");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="rating-title" className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="rating-title" className="text-center text-lg font-semibold">
          How happy are you with the repair?
        </h2>
        <p className="mt-1 text-center text-sm text-zinc-500">Your rating helps the developer improve its defect service.</p>
        <div className="mt-4 flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setStars(n)} className="p-1" aria-label={`${n} star${n > 1 ? "s" : ""}: ${STAR_LABEL[n]}`} aria-pressed={stars === n}>
              <Star className={cn("size-9 transition", n <= stars ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />
            </button>
          ))}
        </div>
        <p className="h-5 text-center text-sm font-medium text-amber-700">{STAR_LABEL[stars]}</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Anything you'd like to tell us? (optional)"
          className="mt-3 w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          disabled={!stars || busy || offline}
          onClick={submit}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Submit rating"}
        </button>
        <button type="button" disabled={busy} onClick={onDone} className="mt-1 h-10 w-full text-sm font-medium text-zinc-500">
          Not now
        </button>
      </div>
    </div>,
    document.body,
  );
}
