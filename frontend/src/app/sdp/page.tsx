"use client";
import { ArrowRight, Bot, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { EventTimeline } from "@/components/case-views";
import { Kpi, PageTitle, Panel, TrendLine } from "@/components/sdp-ui";
import { insight, kpis, monthly } from "@/lib/analytics";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";

export default function SdpOverview() {
  const cases = useDemo((s) => s.cases);
  const events = useDemo((s) => s.events);
  const approvals = useDemo((s) => s.approvals);
  const now = useDemo((s) => s.now);
  const k = useMemo(() => kpis(cases), [cases]);
  const trend = useMemo(() => monthly(cases, now), [cases, now]);
  const text = useMemo(() => insight(cases), [cases]);
  const pending = approvals.filter((a) => a.status === "pending");
  const recent = useMemo(() => events.filter((e) => e.type !== "agent.step").slice(-8), [events]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Overview" sub={`Residensi Harmoni · as of ${fmtDate(now)}`} />

      {pending.length > 0 && (
        <Link
          href="/sdp/approvals"
          className="mb-6 flex items-center gap-3 rounded-2xl bg-violet-600 p-4 text-white shadow-sm transition hover:bg-violet-700"
        >
          <ShieldAlert className="size-6 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{pending.length} extra inspection request(s) waiting for your decision</p>
            <p className="text-sm text-white/80">The RecurrenceAgent found a recurring or clustered defect. A human decides.</p>
          </div>
          <ArrowRight className="size-5" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Open defects" value={k.open} hint={`${k.highOpen} high urgency`} accent />
        <Kpi label="Closed" value={k.closed} hint="Last 18 months" />
        <Kpi label="Reopened" value={k.reopened} hint={`${(k.reopenRate * 100).toFixed(1)}% reopen rate`} />
        <Kpi label="Avg days to close" value={k.avgDaysToClose.toFixed(1)} hint="Verified repairs" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="New defects per month" className="lg:col-span-2">
          <TrendLine data={trend} />
        </Panel>
        <Panel>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-brand" /> AI insight
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">{text}</p>
          <Link href="/sdp/analytics" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
            View stack heatmap <ArrowRight className="size-4" />
          </Link>
          <p className="mt-4 flex items-center gap-1 text-[11px] text-zinc-400">
            <Bot className="size-3" /> Placeholder summary until P1&apos;s analytics agent is wired in
          </p>
        </Panel>
      </div>

      <Panel title="Recent activity" className="mt-6" action={<Link href="/sdp/trace" className="text-xs font-semibold text-brand">Agent trace →</Link>}>
        <EventTimeline events={recent} />
      </Panel>
    </div>
  );
}
