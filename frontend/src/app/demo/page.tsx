"use client";
import { BellRing, HardHat, Home } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { workerLabel } from "@/lib/constants";
import { setTechnicianId } from "@/lib/session";
import { useDemo, useLoadStatus } from "@/lib/store";
import type { EventType } from "@/lib/types";
import { cn } from "@/lib/utils";

// Events that hand work to a technician: a new or reopened case booked, a repair booked, a job handed over.
const TECH_TRIGGERS = new Set<EventType>(["case.assigned", "booking.requested", "repair.booked"]);

type Alert = { caseId: string; workerId: string; text: string; at: number };

function Phone({ title, icon, highlight, children }: { title: string; icon: ReactNode; highlight?: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-700">
        {icon} {title}
      </h2>
      <div
        className={cn(
          "relative overflow-hidden rounded-[2.5rem] border-[10px] border-zinc-900 bg-white shadow-2xl transition duration-300",
          highlight && "scale-[1.02] ring-8 ring-brand/40",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Buyer and technician apps side by side for live demos. Both phones are the real apps; when a buyer action
 *  gives a technician work, the technician phone switches to that worker and opens the job. */
export default function SideBySideDemo() {
  const status = useLoadStatus();
  const events = useDemo((s) => s.events);
  const cases = useDemo((s) => s.cases);
  const seen = useRef<number | null>(null);
  const [techSrc, setTechSrc] = useState("/technician");
  const [techKey, setTechKey] = useState(0);
  const [alert, setAlert] = useState<Alert | null>(null);

  useEffect(() => {
    if (status !== "ready" || !events.length) return;
    const last = events.reduce((m, e) => Math.max(m, e.id), 0);
    // Only react to what happens after the page opened.
    if (seen.current === null) {
      seen.current = last;
      return;
    }
    const fresh = events.filter((e) => e.id > (seen.current ?? 0) && e.caseId && TECH_TRIGGERS.has(e.type));
    seen.current = Math.max(seen.current, last);
    const trigger = fresh.at(-1);
    const c = trigger && cases.find((x) => x.id === trigger.caseId);
    if (!trigger || !c?.technicianId) return;
    setTechnicianId(c.technicianId);
    setTechSrc(`/technician/jobs/${c.id}`);
    setTechKey((k) => k + 1);
    setAlert({
      caseId: c.id,
      workerId: c.technicianId,
      text: trigger.type === "repair.booked" ? "Repair booked" : "New inspection visit",
      at: Date.now(),
    });
  }, [status, events, cases]);

  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(t);
  }, [alert]);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-zinc-200 px-4 py-5">
      <h1 className="mb-4 text-lg font-semibold text-zinc-800">Live demo: buyer and technician</h1>
      <div className="flex flex-wrap items-start justify-center gap-8">
        <Phone title="Buyer" icon={<Home className="size-4" />}>
          <iframe src="/buyer" title="Buyer app" className="block h-[820px] w-[390px] max-w-[calc(100vw-52px)]" />
        </Phone>
        <Phone title={`Technician${alert ? `: ${workerLabel(alert.workerId)}` : ""}`} icon={<HardHat className="size-4" />} highlight={!!alert}>
          {alert && (
            <div key={alert.at} className="absolute inset-x-3 top-3 z-10 flex animate-in items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white shadow-lg fade-in slide-in-from-top-4">
              <BellRing className="size-4 shrink-0 animate-bounce" />
              {alert.text} · {alert.caseId}
            </div>
          )}
          <iframe key={techKey} src={techSrc} title="Technician app" className="block h-[820px] w-[390px] max-w-[calc(100vw-52px)]" />
        </Phone>
      </div>
    </main>
  );
}
