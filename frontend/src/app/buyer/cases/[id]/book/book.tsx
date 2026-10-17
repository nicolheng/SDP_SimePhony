"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCase, useCaseId } from "@/components/case-views";
import { MobileHeader, PrimaryButton, Section } from "@/components/mobile";
import { SlotPicker } from "@/components/slot-picker";
import { upcomingSlots } from "@/lib/agents";
import { bookRepair } from "@/lib/api";
import { getTechnician } from "@/lib/constants";
import { useDemo } from "@/lib/store";

export function BookRepair() {
  const id = useCaseId();
  const c = useCase(id);
  const router = useRouter();
  const now = useDemo((s) => s.now);
  const bookings = useDemo((s) => s.bookings);
  const [slot, setSlot] = useState<string | null>(null);
  const free = useMemo(
    () => upcomingSlots(now).filter((s) => !bookings.some((b) => b.technicianId === c?.technicianId && b.slot === s)),
    [now, bookings, c?.technicianId],
  );

  if (!c) return <MobileHeader title="Case not found" back="/buyer/cases" />;
  const tech = getTechnician(c.technicianId);

  return (
    <div>
      <MobileHeader title="Book Repair" back={`/buyer/cases/${c.id}`} />
      <div className="space-y-4 p-4">
        <Section>
          <p className="text-sm font-semibold">{c.summary}</p>
          <p className="text-xs text-zinc-500">
            {c.id} · Repair by {tech?.name}
          </p>
        </Section>
        <Section>
          <SlotPicker available={free} value={slot} onChange={setSlot} />
        </Section>
        <PrimaryButton
          disabled={!slot || c.status !== "VALID"}
          onClick={async () => {
            await bookRepair(c.id, slot!);
            toast.success("Repair booked");
            router.push(`/buyer/cases/${c.id}`);
          }}
        >
          Confirm Repair Slot
        </PrimaryButton>
      </div>
    </div>
  );
}
