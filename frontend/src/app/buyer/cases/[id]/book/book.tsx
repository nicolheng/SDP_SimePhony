"use client";
import { Clock, HardHat, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCase, useCaseId } from "@/components/case-views";
import { MobileHeader, PrimaryButton, Section } from "@/components/mobile";
import { SlotPicker } from "@/components/slot-picker";
import { fmtHours, repairBlocks } from "@/lib/agents";
import { bookRepair, fetchRepairOptions, type RepairOption } from "@/lib/api";
import { REPAIR_PLAN, SLOT_HOURS, workerName } from "@/lib/constants";
import { fmtTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";

export function BookRepair() {
  const id = useCaseId();
  const c = useCase(id);
  const router = useRouter();
  const now = useDemo((s) => s.now);
  const bookings = useDemo((s) => s.bookings);
  const [start, setStart] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<RepairOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Re-ask the backend whenever the clock or the bookings change.
  useEffect(() => {
    fetchRepairOptions(id)
      .then((o) => {
        setOptions(o);
        setLoadError(null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id, now, bookings]);

  if (!c) return <MobileHeader title="Case Not Found" back="/buyer/cases" />;
  const plan = REPAIR_PLAN[c.category];
  const blocks = repairBlocks(plan.hours);
  const chosen = options?.find((o) => o.start === start);
  const endTime = chosen ? fmtTime(new Date(new Date(chosen.slots.at(-1)!).getTime() + SLOT_HOURS * 3_600_000).toISOString()) : null;

  return (
    <div>
      <MobileHeader title="Book Repair" back={`/buyer/cases/${c.id}`} />
      <div className="space-y-4 p-4">
        <Section>
          <p className="text-sm font-semibold">{c.summary}</p>
          <p className="text-xs text-zinc-500">{c.id}</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Clock className="size-4 text-brand" />
              <span>
                Estimated job duration: <span className="font-semibold">{fmtHours(plan.hours)}</span>
                <span className="text-zinc-500"> · reserves {blocks * SLOT_HOURS} h</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Wrench className="size-4 text-brand" />
              <span>
                Trade: <span className="font-medium">{plan.trade}</span>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <HardHat className="size-4 text-brand" />
              <span>{plan.by === "subcontractor" ? "Specialist subcontractor" : "In-house technician"}, allocated by availability</span>
            </li>
          </ul>
        </Section>

        <Section>
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : !options ? (
            <p className="text-sm text-zinc-500">Loading available times…</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-zinc-600">No repair times are free in the next 2 weeks. Our team will contact you to arrange one.</p>
          ) : (
            <SlotPicker available={options.map((o) => o.start)} value={start} onChange={setStart} />
          )}
        </Section>

        {chosen && (
          <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
            {fmtTime(chosen.start)} – {endTime} · will be allocated to{" "}
            <span className="font-medium">{workerName(c.supportId && chosen.workerIds.includes(c.supportId) ? c.supportId : chosen.workerIds[0])}</span>
            {chosen.workerIds.length > 1 && <span className="text-zinc-500"> ({chosen.workerIds.length} available)</span>}
          </p>
        )}

        <PrimaryButton
          disabled={!start || c.status !== "VALID" || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await bookRepair(c.id, start!);
              toast.success("Repair booked");
              router.push(`/buyer/cases/${c.id}`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't book that time");
              setBusy(false);
            }
          }}
        >
          {busy ? "Booking…" : "Confirm Repair Slot"}
        </PrimaryButton>
      </div>
    </div>
  );
}
