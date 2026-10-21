"use client";
import { ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { EventTimeline } from "@/components/case-views";
import { Kpi, PageTitle, Panel, TrendLine } from "@/components/sdp-ui";
import { useAnalytics } from "@/lib/analytics";
import { PROJECT_NAME } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";

export default function SdpOverview() {
  const cases = useDemo((s) => s.cases);
  const events = useDemo((s) => s.events);
  const approvals = useDemo((s) => s.approvals);
  const now = useDemo((s) => s.now);
  const a = useAnalytics();
  const k = a?.kpis ?? { total: 0, open: 0, closed: 0, reopened: 0, reopenRate: 0, avgDaysToClose: 0, highOpen: 0 };
  const trend = a?.monthly ?? [];
  const text = a?.insight ?? "Analytics are calculated by the backend. Start it to see them.";
  const pending = approvals.filter((a) => a.status === "pending");
  const overdue = useMemo(() => cases.filter((c) => c.status === "PENDING_SIGNOFF" && c.signoffOverdueAt), [cases]);
  const awaitingDev = useMemo(() => cases.filter((c) => c.status === "PENDING_SIGNOFF" && !c.signoff?.developer), [cases]);
  const recent = useMemo(() => events.filter((e) => e.type !== "agent.step").slice(-8), [events]);

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

      <Panel title="Recent activity" className="mt-6" action={<Link href="/sdp/trace" className="text-sm font-semibold text-brand">Agent trace →</Link>}>
        <EventTimeline large events={recent} />
      </Panel>
    </div>
  );
}
