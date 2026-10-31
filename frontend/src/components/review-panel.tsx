"use client";
import { Bot, Check, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { decideReview } from "@/lib/api";
import { fmtDateTime } from "@/lib/dates";
import { useOffline } from "@/lib/store";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What Approve and Reject do, by the step the agent held (matches tools.resolve_review). */
function outcomes(previous: string): { approve: string; reject: string } {
  if (["REOPENED", "EXTRA_INSPECTION", "ESCALATION_PENDING"].includes(previous))
    return { approve: "Book a revisit (or an extra inspection if it keeps recurring)", reject: "Keep the case closed: the reopen is not accepted" };
  if (previous === "REPAIRED") return { approve: "Accept the repair: the buyer gets the standard sign-off checklist", reject: "Repair needs more work: the buyer books a new repair" };
  if (["VALID", "REPAIR_BOOKED"].includes(previous)) return { approve: "The buyer books the repair", reject: "Repair needs more work: the buyer books a new repair" };
  return { approve: "Accept the report as it is and book the inspection visit", reject: "Close as not a defect (the buyer is told why)" };
}

/** A case an AI agent held for a person (PENDING_REVIEW): why, how sure it was, and the SDP decision. */
export function ReviewPanel({ c, showCase }: { c: Case; showCase?: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const r = c.review;
  const o = outcomes(r?.previousStatus ?? "SUBMITTED");
  const score = typeof r?.confidence === "number" ? Math.round(r.confidence * 100) : null;

  async function decide(approve: boolean) {
    if (!approve && !note.trim()) {
      toast.error("Please add a short reason; the buyer sees it.");
      return;
    }
    setBusy(true);
    try {
      await decideReview(c.id, approve, note.trim());
      toast.success(approve ? "Approved: the case continues" : "Rejected: the buyer has been told");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-2 ring-violet-200">
      {showCase && (
        <p className="mb-1 text-base">
          <Link href={`/sdp/defects/${c.id}`} className="font-mono text-sm hover:underline">
            {c.id}
          </Link>{" "}
          · {c.unitId} · {c.summary}
        </p>
      )}
      <h2 className="text-lg font-semibold">Held for human review</h2>
      <div className="mt-3 rounded-xl bg-violet-50 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-800">
          <Bot className="size-4" /> {r?.agent ?? "An AI agent"} was not sure{r?.at ? ` · ${fmtDateTime(r.at)}` : ""}
        </p>
        <p className="mt-1.5 text-base text-violet-950">{r?.reason ?? "An AI agent asked a person to check this case."}</p>
        {score !== null && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-violet-100">
              <div className={cn("h-2 rounded-full", score < 70 ? "bg-amber-500" : "bg-violet-500")} style={{ width: `${score}%` }} />
            </div>
            <span className="text-sm tabular-nums text-violet-800">{score}% confidence</span>
          </div>
        )}
      </div>
      <ul className="mt-4 space-y-1 text-sm text-zinc-600">
        <li>
          <span className="font-medium text-emerald-700">Approve:</span> {o.approve}
        </li>
        <li>
          <span className="font-medium text-zinc-800">Reject:</span> {o.reject}
        </li>
      </ul>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Reason (required to reject; shown to the buyer)"
        className="mt-3 w-full resize-none rounded-xl border border-zinc-300 p-3 text-base outline-none focus:border-brand"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || offline}
          onClick={() => decide(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="size-4" /> Approve &amp; continue
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
    </section>
  );
}
