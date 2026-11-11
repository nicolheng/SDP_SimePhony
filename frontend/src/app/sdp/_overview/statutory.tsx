"use client";
import { ChevronRight, Scale } from "lucide-react";
import Link from "next/link";
import { Kpi, Panel } from "@/components/sdp-ui";
import { useAnalytics } from "@/lib/analytics";
import { RULES } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import type { Statutory } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Defect liability period per block and the 30-day repair-from-notice clock (rules.yaml statutory). */
export function StatutoryClocks({ s, tab }: { s: Statutory; tab?: boolean }) {
  return (
    <section className={tab ? undefined : "mt-8"}>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
        <Scale className="size-5 text-zinc-500" /> Statutory Clocks
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`Repaired Within ${s.repairDays} Days`} value={`${Math.round(s.onTimeRate * 100)}%`} hint={`Of ${s.repaired} repairs, from the buyer's notice`} />
        <Kpi label="Overdue Repairs" value={s.overdue.length} hint={`Open past ${s.repairDays} days`} accent={s.overdue.length > 0} />
        <Kpi label="Due Within 7 Days" value={s.dueSoon} />
        <Kpi label="DLP" value={`${s.dlpMonths} months`} hint="From vacant possession" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DlpEndingSoon s={s} />
        <Panel title={`Past the ${s.repairDays}-Day Repair Period`}>
          {s.overdue.length === 0 ? (
            <p className="text-base text-zinc-500">No open case is past its repair deadline.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {s.overdue.slice(0, 8).map((o) => (
                <li key={o.caseId}>
                  <Link href={`/sdp/defects/${o.caseId}`} className="flex items-center gap-3 py-2.5 hover:bg-zinc-50">
                    <span className="font-mono text-sm">{o.caseId}</span>
                    <span className="min-w-0 flex-1 truncate text-base">
                      {o.unitId} · {o.summary}
                    </span>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">{o.daysOverdue}d overdue</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {s.overdue.length > 8 && <p className="mt-2 text-sm text-zinc-500">and {s.overdue.length - 8} more</p>}
        </Panel>
      </div>
    </section>
  );
}

const DLP_BADGE = {
  expired: "bg-red-50 text-red-700 ring-red-200",
  expiring: "bg-amber-50 text-amber-800 ring-amber-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  unknown: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

/** Every block, A to C (the backend sends them in order). Once a unit's DLP ends its buyer can't report new defects;
 * a row opens the Defects list for that block, so long lists stay searchable. */
function DlpEndingSoon({ s }: { s: Statutory }) {
  const day = (d: string) => fmtDate(`${d}T12:00:00+08:00`);
  return (
    <Panel title="Defect Liability Period Ending">
      <p className="-mt-2 mb-3 text-sm text-zinc-500">
        Once the DLP ends, buyers can&apos;t report new defects. Select a block to see its cases. Amber: ends within {RULES.dlpExpiringDays ?? 90} days.
      </p>
      <ul className="divide-y divide-zinc-100">
        {s.dlp.map((b) => (
          <li key={b.block}>
            <Link href={`/sdp/defects?block=${b.block}`} className="flex items-center gap-3 py-2.5 text-base hover:bg-zinc-50">
              <span className="w-20 font-medium">Block {b.block}</span>
              <span className="flex-1 text-zinc-600">
                {b.dlpExpiry ? (b.state === "expired" ? `DLP ended ${day(b.dlpExpiry)}` : `Next DLP ends ${day(b.dlpExpiry)}`) : "No vacant possession date"}
                {b.openCases > 0 && <span className="text-zinc-900"> · {b.openCases} open case(s)</span>}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", DLP_BADGE[b.state])}>
                {b.state === "expired" ? "Ended" : b.daysLeft === null ? "—" : `${b.daysLeft}d left`}
              </span>
              <ChevronRight className="size-4 text-zinc-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Overview › Statutory tab: the clocks on their own page (calculated by the backend with the analytics). */
export function Statutory() {
  const a = useAnalytics();
  if (!a) return <p className="rounded-2xl bg-white p-6 text-base text-zinc-600 ring-1 ring-zinc-200">Statutory clocks are calculated by the backend. Start it to see them.</p>;
  if (!a.statutory) return <p className="rounded-2xl bg-white p-6 text-base text-zinc-600 ring-1 ring-zinc-200">No statutory data yet.</p>;
  return <StatutoryClocks s={a.statutory} tab />;
}
