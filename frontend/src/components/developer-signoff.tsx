"use client";
import { Bot, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PhotoThumb } from "@/components/photo";
import { Panel } from "@/components/sdp-ui";
import { developerSignOff, rejectRepair } from "@/lib/api";
import { workerLabel } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useOffline } from "@/lib/store";
import type { Case, PhotoCheck } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<PhotoCheck["assessment"], { label: string; tone: string }> = {
  looks_resolved: { label: "Looks repaired", tone: "bg-emerald-100 text-emerald-800" },
  unclear: { label: "Not sure", tone: "bg-amber-100 text-amber-800" },
  not_resolved: { label: "Looks not repaired", tone: "bg-red-100 text-red-800" },
};

/** The VerificationAgent's photo check in one line: a verdict badge, what it found, and whether the AI or a
 *  rule produced it. `sdp` adds the prompt to compare the photos when the check is flagged. */
export function PhotoCheckSummary({ check, sdp = false }: { check: PhotoCheck; sdp?: boolean }) {
  const rule = check.source === "rule";
  const v = rule ? { label: "Same photo", tone: "bg-amber-100 text-amber-800" } : (VERDICT[check.assessment] ?? VERDICT.unclear);
  const score = check.confidence === null ? null : Math.round(check.confidence * 100);
  return (
    <div className={cn("rounded-xl p-3", sdp && check.flagged ? "bg-amber-50 ring-1 ring-amber-200" : "bg-violet-50")}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-violet-800">
        <Bot className="size-4" /> Verification Agent
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", v.tone)}>{v.label}</span>
      </p>
      <p className="mt-1.5 text-sm text-zinc-800">
        {rule ? "The repair photo is the same file as the original photo, so the AI did not check it." : check.observations || "No details given."}
      </p>
      <p className="mt-1.5 text-xs text-zinc-500">
        {rule ? "Rule check · no AI" : ["AI", check.model, score !== null ? `${score}% sure` : null].filter(Boolean).join(" · ")}
        {sdp && check.flagged && (
          <span className="font-medium text-amber-800">
            {check.similarToOriginal && !rule ? " · Looks almost the same as the original photo" : ""} · Compare the photos before deciding
          </span>
        )}
      </p>
    </div>
  );
}

/** SDP's one decision on a finished repair: look at the photos and the agent's check, then sign off or send it back. */
export function DeveloperSignoffPanel({ c }: { c: Case }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const before = c.photos.find((p) => p.kind === "original");
  const after = [...c.photos].reverse().find((p) => p.kind === "repair");

  async function decide(approve: boolean) {
    if (!approve && !note.trim()) {
      toast.error("Please add a short reason; the buyer and technician see it.");
      return;
    }
    setBusy(true);
    try {
      if (approve) {
        await developerSignOff(c.id);
        toast.success(c.signoff?.buyer ? "Approved: case closed" : "Approved: buyer asked to sign off");
      } else {
        await rejectRepair(c.id, note.trim());
        toast.success("Sent back: a new repair is being booked");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Developer Sign-Off" className={c.photoCheck?.flagged ? "ring-2 ring-amber-300" : undefined}>
      <p className="text-base text-zinc-700">
        Check the repair by {workerLabel(c.technicianId)}, then sign it off or send it back.
      </p>
      {c.repairNote && <p className="mt-2 text-sm text-zinc-600">Technician&apos;s note: &ldquo;{c.repairNote}&rdquo;</p>}
      {(before || after) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {before && <PhotoThumb photo={before} className="aspect-[4/3]" />}
          {after && <PhotoThumb photo={after} className="aspect-[4/3]" />}
        </div>
      )}
      <div className="mt-4">
        {c.photoCheck ? (
          <PhotoCheckSummary check={c.photoCheck} sdp />
        ) : (
          <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-600">No AI photo check for this repair (AI agents off or unavailable). Please compare the photos yourself.</p>
        )}
      </div>
      <p className="mt-3 text-sm text-zinc-500">
        Buyer: {c.signoff?.buyer ? `signed ${fmtDateTime(c.signoff.buyer.at)}` : "checks and signs after your approval (then has 14 days)"}
      </p>
      {c.signoffOverdueAt && (
        <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-base text-red-800">
          Buyer sign-off overdue since {fmtDateTime(c.signoffOverdueAt)}. High urgency, so not auto-closed: please contact the buyer.
        </p>
      )}
      <ul className="mt-4 space-y-1 text-sm text-zinc-600">
        <li>
          <span className="font-medium text-emerald-700">Approve:</span> sign off as the developer; the buyer is asked to check it and sign off
        </li>
        <li>
          <span className="font-medium text-zinc-800">Reject:</span> the repair needs more work; the buyer books a new repair
        </li>
      </ul>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Reason (required to reject; shown to the buyer and technician)"
        className="mt-3 w-full resize-none rounded-xl border border-zinc-300 p-3 text-base outline-none focus:border-brand"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => decide(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="size-4" /> Approve repair
        </button>
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => decide(false)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 text-base font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <X className="size-4" /> Reject
        </button>
      </div>
    </Panel>
  );
}
