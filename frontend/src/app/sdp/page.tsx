"use client";
import { ArrowRight, Bot, ChevronRight, Scale, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Kpi, PageTitle, Panel, TrendLine } from "@/components/sdp-ui";
import { useAnalytics } from "@/lib/analytics";
import { PROJECT_NAME, RULES } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { Statutory } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SdpOverview() {
  const cases = useDemo((s) => s.cases);
  const approvals = useDemo((s) => s.approvals);
  const now = useDemo((s) => s.now);
  const a = useAnalytics();
  const k = a?.kpis ?? { total: 0, open: 0, closed: 0, reopened: 0, reopenRate: 0, avgDaysToClose: 0, highOpen: 0 };
  const trend = a?.monthly ?? [];
  const text = a?.insight ?? "Analytics are calculated by the backend. Start it to see them.";
  const pending = approvals.filter((a) => a.status === "pending");
  const overdue = useMemo(() => cases.filter((c) => c.status === "PENDING_SIGNOFF" && c.signoffOverdueAt), [cases]);
  const awaitingDev = useMemo(() => cases.filter((c) => c.status === "PENDING_SIGNOFF" && !c.signoff?.developer), [cases]);
  const held = useMemo(() => cases.filter((c) => c.status === "PENDING_REVIEW"), [cases]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Overview" sub={`${PROJECT_NAME} · as of ${fmtDate(now)}`} />

      {pending.length > 0 && (
        <Link
          href="/sdp/approvals"
          className="mb-6 flex items-center gap-3 rounded-2xl bg-violet-600 p-4 text-white shadow-sm transition hover:bg-violet-700"
        >
          <ShieldAlert className="size-6 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{pending.length} extra inspection request(s) waiting for your decision</p>
            <p className="text-base text-white/80">The Recurrence Agent found a recurring or clustered defect. A human decides.</p>
          </div>
          <ArrowRight className="size-5" />
        </Link>
      )}

      {held.length > 0 && (
        <Link href="/sdp/approvals" className="mb-6 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-2 ring-violet-300 transition hover:ring-violet-500">
          <Bot className="size-6 shrink-0 text-violet-600" />
          <div className="flex-1">
            <p className="font-semibold">{held.length} case(s) held for review</p>
            <p className="text-base text-zinc-600">An AI agent wasn&apos;t confident enough to continue. Approve or reject to move them on.</p>
          </div>
          <ArrowRight className="size-5 text-zinc-400" />
        </Link>
      )}

      {overdue.length > 0 && (
        <Panel title={`${overdue.length} high-urgency case(s) with overdue buyer sign-off`} className="mb-6 ring-2 ring-red-200">
          <p className="mb-3 text-base text-zinc-600">Not auto-closed because they are high urgency. Contact the buyer to confirm the repair.</p>
          <ul className="flex flex-wrap gap-2">
            {overdue.map((c) => (
              <li key={c.id}>
                <Link href={`/sdp/defects/${c.id}`} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-base ring-1 ring-red-200 hover:ring-brand">
                  <span className="font-mono text-sm">{c.id}</span> {c.summary}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {awaitingDev.length > 0 && (
        <Panel title={`${awaitingDev.length} case(s) awaiting developer sign-off`} className="mb-6">
          <ul className="flex flex-wrap gap-2">
            {awaitingDev.map((c) => (
              <li key={c.id}>
                <Link href={`/sdp/defects/${c.id}`} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-base ring-1 ring-zinc-200 hover:ring-brand">
                  <span className="font-mono text-sm">{c.id}</span> {c.summary}
                  {c.signoff?.buyer && <span className="text-sm text-emerald-700">buyer signed</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Open defects" value={k.open} hint={`${k.highOpen} high urgency`} accent />
        <Kpi label="Closed" value={k.closed} hint="All cases to date" />
        <Kpi label="Reopened" value={k.reopened} hint={`${(k.reopenRate * 100).toFixed(1)}% reopen rate`} />
        <Kpi label="Avg days to close" value={k.avgDaysToClose.toFixed(1)} hint="Verified repairs" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="New defects per month" className="lg:col-span-2">
          <TrendLine data={trend} />
        </Panel>
        <Panel>
          <p className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-5 text-brand" /> Systemic issue detection
          </p>
          <p className="mt-3 text-base leading-relaxed text-zinc-700">{text}</p>
          <Link href="/sdp/analytics" className="mt-4 inline-flex items-center gap-1 text-base font-semibold text-brand">
            See systemic issues <ArrowRight className="size-4" />
          </Link>
        </Panel>
      </div>

      {a?.statutory && <StatutoryClocks s={a.statutory} />}

    </div>
  );
}

/** Defect liability period per block and the 30-day repair-from-notice clock (rules.yaml statutory). */
function StatutoryClocks({ s }: { s: Statutory }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
        <Scale className="size-5 text-zinc-500" /> Statutory clocks
      </h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label={`Repaired within ${s.repairDays} days`} value={`${Math.round(s.onTimeRate * 100)}%`} hint={`Of ${s.repaired} repairs, from the buyer's notice`} />
        <Kpi label="Overdue repairs" value={s.overdue.length} hint={`Open past ${s.repairDays} days`} accent={s.overdue.length > 0} />
        <Kpi label="Due within 7 days" value={s.dueSoon} />
        <Kpi label="DLP" value={`${s.dlpMonths} months`} hint="From vacant possession" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DlpEndingSoon s={s} />
        <Panel title={`Past the ${s.repairDays}-day repair period`}>
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
    <Panel title="Defect liability period ending">
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
