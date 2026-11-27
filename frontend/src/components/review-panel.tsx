"use client";
import { Bot, Check, ExternalLink, History, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PhotoThumb } from "@/components/photo";
import { decideReview } from "@/lib/api";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { useDemo, useOffline } from "@/lib/store";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A report after the DLP that recurs an earlier repair (tools.create_case, #144). */
export const isLatentDefect = (c: Case) => c.review?.reasonCode === "POSSIBLE_LATENT_DEFECT";

/** What Approve and Reject do, by the step the agent held (matches tools.resolve_review). */
function outcomes(previous: string): { approve: string; reject: string } {
  if (previous === "INVALID")
    return { approve: "Confirm not a defect: the case closes and the buyer is told", reject: "Overturn: it is a defect, and the repair is booked" };
  if (["REOPENED", "EXTRA_INSPECTION", "ESCALATION_PENDING"].includes(previous))
    return { approve: "Book a revisit (or an extra inspection if it keeps recurring)", reject: "Keep the case closed: the reopen is not accepted" };
  if (previous === "REPAIRED") return { approve: "Accept the repair and sign off as the developer: the buyer is asked to check it and sign off", reject: "Repair needs more work: the buyer books a new repair" };
  if (["VALID", "REPAIR_BOOKED"].includes(previous)) return { approve: "The buyer books the repair", reject: "Repair needs more work: the buyer books a new repair" };
  return { approve: "Accept the report as it is and book the inspection visit", reject: "Close as not a defect (the buyer is told why)" };
}

/** A case held for a person (PENDING_REVIEW): by an AI agent that was unsure, or by a technician's Invalid
 *  verdict (rejecting a defect is SDP's decision). Why, how sure it was, and the SDP decision. */
export function ReviewPanel({ c, showCase }: { c: Case; showCase?: boolean }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const r = c.review;
  const latent = isLatentDefect(c);
  const o = outcomes(r?.previousStatus ?? "SUBMITTED");
  const invalid = r?.previousStatus === "INVALID";
  // A latent-defect hold is a rule (the earlier repair matched), not an AI's confidence: no score bar.
  const score = !latent && typeof r?.confidence === "number" ? Math.round(r.confidence * 100) : null;
  // A held repair check: show the before and after photos side by side, so SDP can compare them here.
  const before = r?.previousStatus === "REPAIRED" ? c.photos.find((p) => p.kind === "original") : undefined;
  const after = r?.previousStatus === "REPAIRED" ? [...c.photos].reverse().find((p) => p.kind === "repair") : undefined;

  async function decide(approve: boolean) {
    if (!approve && !note.trim()) {
      toast.error("Please add a short reason.");
      return;
    }
    setBusy(true);
    try {
      await decideReview(c.id, approve, note.trim());
      toast.success(
        invalid
          ? approve ? "Confirmed: not a defect, the buyer has been told" : "Overturned: the repair is being booked"
          : approve ? "Approved: the case continues" : "Rejected: the buyer has been told",
      );
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
      <h2 className="text-lg font-semibold">Held for Human Review</h2>
      <div className={cn("mt-3 rounded-xl p-4", latent ? "bg-amber-50" : "bg-violet-50")}>
        {latent ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <History className="size-4" /> Possible latent defect · reported after the defect liability period ended
            {r?.at ? ` · ${fmtDateTime(r.at)}` : ""}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-800">
            <Bot className="size-4" /> {invalid ? "Technician marked this not a defect" : `${r?.agent ?? "An AI agent"} was not sure`}
            {r?.at ? ` · ${fmtDateTime(r.at)}` : ""}
          </p>
        )}
        <p className={cn("mt-1.5 text-base", latent ? "text-amber-950" : "text-violet-950")}>
          {latent
            ? "The same problem came back in the same room after an earlier repair. If that repair did not work, the developer may still be liable. Compare it with the earlier repair below."
            : (r?.reason ?? "An AI agent asked a person to check this case.")}
        </p>
        {latent && <EarlierRepair id={r?.earlierCaseId ?? null} repairedAt={r?.earlierRepairedAt ?? null} />}
        {score !== null && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-violet-100">
              <div className={cn("h-2 rounded-full", score < 70 ? "bg-amber-500" : "bg-violet-500")} style={{ width: `${score}%` }} />
            </div>
            <span className="text-sm tabular-nums text-violet-800">{score}% confidence</span>
          </div>
        )}
      </div>
      {(before || after) && (
        <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
          {before && <PhotoThumb photo={before} className="aspect-[4/3]" />}
          {after && <PhotoThumb photo={after} className="aspect-[4/3]" />}
        </div>
      )}
      {latent ? (
        <LatentDecision busy={busy || offline} note={note} setNote={setNote} decide={decide} />
      ) : (
        <>
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
            placeholder="Reason (required to reject)"
            className="mt-3 w-full resize-none rounded-xl border border-zinc-300 p-3 text-base outline-none focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={busy || offline} onClick={() => decide(true)} className={approveBtn}>
              <Check className="size-4" /> {invalid ? "Confirm not a defect" : "Approve & continue"}
            </button>
            <button type="button" disabled={busy || offline} onClick={() => decide(false)} className={secondaryBtn}>
              <X className="size-4" /> {invalid ? "Overturn: valid defect" : "Reject"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const approveBtn =
  "inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
const secondaryBtn =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 text-base font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

function LatentDecision({
  busy,
  note,
  setNote,
  decide,
}: {
  busy: boolean;
  note: string;
  setNote: (v: string) => void;
  decide: (approve: boolean) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  if (!rejecting)
    return (
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={() => decide(true)} className={approveBtn}>
          <Check className="size-4" /> Approve
        </button>
        <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={secondaryBtn}>
          <X className="size-4" /> Reject
        </button>
      </div>
    );
  return (
    <div className="mt-4">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        autoFocus
        placeholder="Reason for rejecting (shown to the buyer)"
        className="w-full resize-none rounded-xl border border-zinc-300 p-3 text-base outline-none focus:border-brand"
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          <X className="size-4" /> Confirm reject
        </button>
        <button type="button" disabled={busy} onClick={() => setRejecting(false)} className={secondaryBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The earlier repaired case a post-DLP report recurs, linked so SDP can check what was done (#144). */
function EarlierRepair({ id, repairedAt }: { id: string | null; repairedAt: string | null }) {
  const earlier = useDemo((s) => (id ? s.cases.find((x) => x.id === id) : undefined));
  if (!id) return <p className="mt-3 text-sm text-amber-800">The earlier repair was not recorded for this report.</p>;
  const photo = earlier && ([...earlier.photos].reverse().find((p) => p.kind === "repair") ?? earlier.photos.find((p) => p.kind === "original"));
  const when = repairedAt ?? earlier?.repairedAt ?? null;
  return (
    <Link
      href={`/sdp/defects/${id}`}
      className="mt-3 flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-amber-200 transition hover:ring-amber-500"
    >
      {photo && <PhotoThumb photo={photo} label={false} zoom={false} className="size-16 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-amber-800">Earlier repair</span>
        <span className="block truncate text-base">
          <span className="font-mono text-sm">{id}</span>
          {earlier ? ` · ${earlier.summary}` : ""}
        </span>
        <span className="block truncate text-sm text-zinc-500">
          {[earlier && CATEGORY_LABEL[earlier.category], earlier?.location, when ? `repaired ${fmtDate(when)}` : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-amber-700" />
    </Link>
  );
}
