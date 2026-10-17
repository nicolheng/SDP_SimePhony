"use client";
import { ChevronRight, ClipboardCheck, Hammer, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MobileHeader } from "@/components/mobile";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { getTechnician, TECHNICIANS } from "@/lib/constants";
import { dayKey, fmtDay, fmtTime } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { Case } from "@/lib/types";
import { cn } from "@/lib/utils";

const JOB_STATUSES = ["VISIT_SCHEDULED", "EXTRA_INSPECTION", "REPAIR_BOOKED"];

export const jobSlot = (c: Case) => (c.status === "REPAIR_BOOKED" ? c.repairSlot : c.visitSlot) ?? c.createdAt;

export function JobList({ done }: { done?: boolean }) {
  const cases = useDemo((s) => s.cases);
  const now = useDemo((s) => s.now);
  const [tech, setTech] = useState<string>("all");
  const jobs = useMemo(
    () =>
      cases
        .filter((c) => !c.historical && c.technicianId && (done ? !JOB_STATUSES.includes(c.status) && c.verdict : JOB_STATUSES.includes(c.status)))
        .filter((c) => tech === "all" || c.technicianId === tech)
        .sort((a, b) => (done ? jobSlot(b).localeCompare(jobSlot(a)) : jobSlot(a).localeCompare(jobSlot(b)))),
    [cases, tech, done],
  );
  const today = dayKey(now);
  const groups = useMemo(() => {
    const m = new Map<string, Case[]>();
    for (const j of jobs) {
      const k = dayKey(jobSlot(j));
      m.set(k, [...(m.get(k) ?? []), j]);
    }
    return [...m.entries()];
  }, [jobs]);

  return (
    <div>
      <MobileHeader title={done ? "Completed" : "My Jobs"} />
      <div className="sticky top-14 z-10 flex gap-1.5 overflow-x-auto border-b bg-white px-3 py-2">
        {[{ id: "all", name: "All technicians" }, ...TECHNICIANS].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTech(t.id)}
            className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium", tech === t.id ? "bg-ink text-white" : "bg-zinc-100 text-zinc-600")}
          >
            {t.name.split(" ")[0]}
          </button>
        ))}
      </div>
      <div className="space-y-5 p-4">
        {groups.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-500">
            <Search className="mx-auto mb-2 size-6 text-zinc-300" />
            No jobs.
          </div>
        )}
        {groups.map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {day === today ? "Today" : fmtDay(jobSlot(list[0]))}
            </h2>
            <ul className="space-y-2">
              {list.map((c) => {
                const repair = c.status === "REPAIR_BOOKED";
                return (
                  <li key={c.id}>
                    <Link href={`/technician/jobs/${c.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/70">
                      <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", repair ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700")}>
                        {repair ? <Hammer className="size-5" /> : <ClipboardCheck className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold">{fmtTime(jobSlot(c))}</span>
                          <span className="text-xs text-zinc-500">· {c.unitId}</span>
                          <UrgencyBadge urgency={c.urgency} />
                        </div>
                        <p className="truncate text-sm text-zinc-700">{c.summary}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <StatusBadge status={c.status} />
                          <span className="truncate text-[11px] text-zinc-500">{getTechnician(c.technicianId)?.name}</span>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-zinc-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
