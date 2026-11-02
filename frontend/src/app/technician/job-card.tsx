"use client";
import { DefectCard } from "@/components/defect-card";
import type { Case } from "@/lib/types";

export function JobCard({ c }: { c: Case }) {
  return <DefectCard c={c} href={`/technician/jobs/${c.id}`} />;
}
