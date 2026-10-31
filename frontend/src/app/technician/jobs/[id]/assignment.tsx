"use client";
import { ArrowRightLeft, CalendarX, CheckCircle2, Clock, Loader2, PencilLine, Repeat, Siren, Thermometer } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/mobile";
import { acceptJob, handOverJob } from "@/lib/api";
import { getTechnician, workerLabel } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useOffline } from "@/lib/store";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

const REASONS: { label: string; hint: string; icon: ReactNode }[] = [
  { label: "Sudden emergency", hint: "Something urgent came up", icon: <Siren className="size-4" /> },
  { label: "Not available at this time", hint: "Clashes with another job or appointment", icon: <CalendarX className="size-4" /> },
  { label: "Unwell or on leave", hint: "Sick, or away that day", icon: <Thermometer className="size-4" /> },
  { label: "Other", hint: "Tell us briefly", icon: <PencilLine className="size-4" /> },
];

/** Accept the job, or hand it over (declining, or an emergency after accepting). The TriageAgent picks the next available colleague. */
export function JobAssignment({ c, me }: { c: Case; me: string }) {
  const router = useRouter();
  const pending = c.bookingStatus === "pending";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const offline = useOffline();
  const text = reason === "Other" ? other.trim() : reason;

  async function accept() {
    setBusy(true);
    try {
      await acceptJob(c.id, me);
      toast.success("Job accepted: the buyer has been told");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handOver() {
    if (!text) return;
    setBusy(true);
    try {
      const r = await handOverJob(c.id, me, text);
      toast.success(`Handed over to ${getTechnician(r.technicianId)?.name ?? r.technicianId}${r.sameTime ? "" : ` · new time ${fmtDateTime(r.start)}`}`);
      router.push("/technician/jobs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Section className={pending ? "ring-amber-300" : undefined}>
      {pending ? (
        <>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <Clock className="size-4" /> {c.handover ? "Handed over to you: please confirm" : "New job: please confirm"}
          </p>
          {c.handover && <p className="mt-1 text-sm text-zinc-700">{workerLabel(c.handover.fromId)} couldn&apos;t make it.</p>}
          {!open && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || offline}
                onClick={accept}
                className="h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={busy || offline}
                onClick={() => setOpen(true)}
                className="h-12 rounded-xl border-2 border-zinc-800 text-sm font-semibold text-zinc-800 disabled:border-zinc-200 disabled:text-zinc-400"
              >
                Reject
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" /> You accepted this job
          </p>
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-medium text-brand">
              <Repeat className="size-3.5" /> Can&apos;t make it?
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
          <p className="text-sm font-medium text-zinc-900">Why can&apos;t you make it?</p>
          <ul className="space-y-2">
            {REASONS.map((r) => {
              const on = reason === r.label;
              return (
                <li key={r.label}>
                  <button
                    type="button"
                    onClick={() => setReason(r.label)}
                    className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition", on ? "bg-red-50 ring-2 ring-brand" : "bg-white ring-zinc-200")}
                  >
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", on ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500")}>{r.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-900">{r.label}</span>
                      <span className="block text-xs text-zinc-500">{r.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {reason === "Other" && (
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              maxLength={300}
              autoFocus
              placeholder="What happened?"
              className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm outline-none focus:border-brand"
            />
          )}
          <p className="text-xs text-zinc-500">The next available colleague will be assigned automatically. Your reason isn&apos;t shown to the buyer.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setReason(null);
              }}
              className="h-11 rounded-xl border border-zinc-300 text-sm font-semibold text-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !text || offline}
              onClick={handOver}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />} Hand over
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
