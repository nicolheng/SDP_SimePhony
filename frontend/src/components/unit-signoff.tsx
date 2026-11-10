"use client";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { signOffUnit } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { useDemo, useOffline } from "@/lib/store";
import type { UnitSignoff } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Overlay } from "./overlay";
import { RatingDialog } from "./rating";

/** Sign-off state of one unit from GET /api/state (tools.unit_signoff_state), or null when it has no defects. */
export function useUnitSignoff(unitId: string): UnitSignoff | null {
  return useDemo((s) => s.unitSignoff?.[unitId] ?? null);
}

/** The unit's sign-off deadline has passed: its defects were closed automatically (or flagged to SDP), so the buyer
 *  can no longer verify or sign off. */
export function useSignoffOverdue(unitId: string): boolean {
  const u = useUnitSignoff(unitId);
  const now = useDemo((s) => s.now);
  return !!u?.deadline && Date.parse(u.deadline) < Date.parse(now);
}

const on = "bg-brand text-white shadow-sm hover:bg-brand-dark";
const off = "cursor-not-allowed bg-zinc-200 text-zinc-500";

/** Home page: the Sign Off button turns red once every open defect in the unit is approved by SDP and verified by the
 *  buyer (the same rule as Sign Off Unit), and opens My Defects on the Pending tab. Grey otherwise. */
export function HomeSignOffButton({ unitId, className }: { unitId: string; className?: string }) {
  const u = useUnitSignoff(unitId);
  const overdue = useSignoffOverdue(unitId);
  const active = !!u && u.caseIds.length > 0 && u.ready && !overdue;
  const cls = cn("shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-[11px] font-semibold transition", active ? on : off, className);
  return active ? (
    <Link href="/buyer/cases?tab=pending" className={cls}>
      Sign Off
    </Link>
  ) : (
    <button type="button" disabled className={cls} title="Available once every repair in your unit is approved and verified">
      Sign Off
    </button>
  );
}

/** My Defects: the unit Sign Off button. Red when every open defect is approved by SDP and verified by the buyer;
 *  grey otherwise, with the reason. Signing off closes every defect in the unit together. */
export function UnitSignOffPanel({ unitId }: { unitId: string }) {
  const u = useUnitSignoff(unitId);
  const offline = useOffline();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(false);
  const overdue = useSignoffOverdue(unitId);
  const open = u?.caseIds.length ?? 0;
  const ready = !!u?.ready && open > 0 && !overdue;

  const reason = !u || open === 0
    ? ""
    : overdue
      ? "The sign-off period has ended; our team will follow up."
    : u.waitingForDeveloper.length
      ? `Waiting for the developer to approve ${u.waitingForDeveloper.length} defect${u.waitingForDeveloper.length > 1 ? "s" : ""}.`
      : u.waitingForBuyer.length
        ? `Please verify ${u.waitingForBuyer.length} defect${u.waitingForBuyer.length > 1 ? "s" : ""} in the Pending tab first.`
        : "";

  // The sheet closes at once; the request finishes in the background and the rating opens when it is done.
  async function signOff() {
    setConfirm(false);
    setBusy(true);
    const t = toast.loading("Signing off…");
    try {
      await signOffUnit(unitId);
      toast.success(`Unit ${unitId} signed off: ${open} defect${open > 1 ? "s" : ""} closed`, { id: t });
      setRate(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={!ready || busy || offline}
        onClick={() => setConfirm(true)}
        className={cn("flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition", ready ? on : off)}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Sign Off Unit {unitId}
      </button>
      {!ready && reason && (
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
          <Clock className="size-3.5 shrink-0" /> {reason}
        </p>
      )}
      {rate && <RatingDialog unitId={unitId} onDone={() => setRate(false)} />}
      {u?.deadline && open > 0 && !overdue && <p className="mt-0.5 text-center text-[11px] text-zinc-400">Please sign off by {fmtDate(u.deadline)}.</p>}

      {confirm && (
        <Overlay label="Sign off unit" onClick={() => !busy && setConfirm(false)} className="flex items-end bg-black/40">
          <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl">
            <h2 className="text-base font-semibold">Sign off unit {unitId}?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              You have verified every repair. Signing off closes {open > 1 ? `all ${open} defects` : "this defect"} together. If a problem comes back, you
              can still reopen it with a new photo.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="h-11 rounded-xl text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300">
                Cancel
              </button>
              <button type="button" disabled={busy || offline} onClick={signOff} className="flex h-11 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50">
                Sign Off
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
