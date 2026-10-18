"use client";
import { useMemo } from "react";
import { getTechnician } from "@/lib/constants";
import { useTechnicianId } from "@/lib/session";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";

/** When the job happens: repair slot for repairs, visit slot otherwise. */
export const jobSlot = (c: Case) => (c.status === "REPAIR_BOOKED" ? c.repairSlot : c.visitSlot) ?? c.createdAt;

export const jobKind = (c: Case) =>
  c.status === "REPAIR_BOOKED" ? "Repair" : c.status === "EXTRA_INSPECTION" ? "Detailed inspection" : c.reopenCount > 0 && c.status === "VISIT_SCHEDULED" ? "Revisit" : "Inspection";

/** Only the cases assigned to the signed-in technician. */
export function useMyJobs() {
  const techId = useTechnicianId();
  const cases = useDemo((s) => s.cases);
  const jobs = useMemo(() => cases.filter((c) => c.technicianId === techId), [cases, techId]);
  return { tech: getTechnician(techId)!, jobs };
}
