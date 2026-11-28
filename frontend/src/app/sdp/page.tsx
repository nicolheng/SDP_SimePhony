"use client";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock, History, Inbox, Phone } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EChart } from "@/components/echart";
import { C, clockOption } from "@/components/insight-charts";
import { Stars } from "@/components/rating";
import { PageTitle, Panel } from "@/components/sdp-ui";
import { useAnalytics } from "@/lib/analytics";
import { PROJECT_NAME } from "@/lib/constants";
import { daysBetween, fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { CaseStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Statuses where the 30-day repair clock is still running (the repair isn't done yet). */
const REPAIR_OPEN = new Set<CaseStatus>(["SUBMITTED", "INFO_NEEDED", "PENDING_REVIEW", "VISIT_SCHEDULED", "VALID", "REPAIR_BOOKED", "REOPENED", "ESCALATION_PENDING", "EXTRA_INSPECTION"]);

type Queue = "all" | "review" | "signoff" | "extra";
type Decision = { key: string; queue: Exclude<Queue, "all">; id: string; title: string; kind: string; since: string | null; urgent: boolean; flag?: string; href: string };

const QUEUE_STYLE = {
  review: { label: "Held for Review", tag: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  signoff: { label: "Sign-Offs", tag: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  extra: { label: "Extra Inspections", tag: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

/** Actions, for SDP staff: what needs a decision, which legal deadlines are close, and which buyers to call back.
 * Everything here is live (same counts as the Approvals badge); the manager's view is Insights. */
export default function Actions() {
  const now = useDemo((s) => s.now);
  const cases = useDemo((s) => s.cases);
  const approvals = useDemo((s) => s.approvals);
  const a = useAnalytics();
  const st = a?.statutory;
  const [queue, setQueue] = useState<Queue>("all");

  const items = useMemo(() => {
    const held = cases.filter((c) => c.status === "PENDING_REVIEW");
    const signoff = cases.filter((c) => c.status === "PENDING_SIGNOFF" && (!c.signoff?.developer || c.signoffOverdueAt));
    const extra = approvals.filter((x) => x.status === "pending");
    const list: Decision[] = [
      ...held.map((c) => {
        const latent = c.review?.reasonCode === "POSSIBLE_LATENT_DEFECT";
        return {
          key: `r-${c.id}`,
          queue: "review" as const,
          id: c.id,
          title: `${c.unitId} · ${c.summary}`,
          kind: latent ? "Reported after the DLP" : c.verdict?.outcome === "INVALID" ? "Technician marked it not a defect" : `${c.review?.agent ?? "AI agent"} held it for review`,
          since: c.review?.at ?? c.createdAt,
          urgent: latent || c.urgency === "high",
          flag: latent ? "Possible latent defect" : undefined,
          href: `/sdp/approvals?tab=review&open=${c.id}`,
        };
      }),
      ...signoff.map((c) => ({
        key: `s-${c.id}`,
        queue: "signoff" as const,
        id: c.id,
        title: `${c.unitId} · ${c.summary}`,
        kind: c.signoffOverdueAt ? "Buyer sign-off overdue" : "Repair done, needs developer sign-off",
        since: c.signoffOverdueAt ?? c.repairedAt ?? null,
        urgent: !!c.signoffOverdueAt,
        flag: c.signoffOverdueAt ? "High urgency" : undefined,
        href: `/sdp/defects/${c.id}`,
      })),
      ...extra.flatMap((x) => {
        const c = cases.find((k) => k.id === x.caseId);
        return c
          ? [{ key: `e-${x.id}`, queue: "extra" as const, id: c.id, title: `${c.unitId} · ${c.summary}`, kind: "Extra inspection request", since: x.createdAt, urgent: false, href: `/sdp/approvals?tab=extra&open=${x.id}` }]
          : [];
      }),
    ];
    // Urgent first, then whatever has waited longest.
    return list.sort((p, q) => Number(q.urgent) - Number(p.urgent) || (p.since ?? "").localeCompare(q.since ?? ""));
  }, [cases, approvals]);

  // Open repairs grouped by how close their 30-day clock is.
  const clock = useMemo(() => {
    const b = { overdue: 0, week: 0, two: 0, later: 0 };
    for (const c of cases) {
      if (!REPAIR_OPEN.has(c.status) || !c.repairClock || c.repairClock.doneAt) continue;
      const left = daysBetween(now, c.repairClock.dueAt);
      if (left < 0) b.overdue++;
      else if (left <= 7) b.week++;
      else if (left <= 14) b.two++;
      else b.later++;
    }
    return b;
  }, [cases, now]);
  const clockParts = useMemo(
    () => [
      { label: "Overdue", n: clock.overdue, colour: C.brand },
      { label: "Due in 7 days", n: clock.week, colour: C.amber },
      { label: "8 to 14 days", n: clock.two, colour: C.mutedDark },
      { label: "15+ days", n: clock.later, colour: C.muted },
    ],
    [clock],
  );
  // Memoised on the counts so the doughnut doesn't replay its animation on every store poll.
  // The centre shows what matters most: the overdue count, or the open total when nothing is overdue.
  const clockChart = useMemo(() => {
    const total = clockParts.reduce((n, p) => n + p.n, 0);
    return clockOption(clockParts, clock.overdue ? { value: clock.overdue, label: "overdue" } : { value: total, label: "on track" });
  }, [clockParts, clock.overdue]);

  const callBacks = (a?.satisfaction?.recent ?? []).filter((r) => r.stars <= 2);
  const overdue = st?.overdue ?? [];
  const dlpSoon = (st?.dlp ?? []).filter((d) => d.state === "expiring" && d.openCases > 0);
  const count = (q: Queue) => (q === "all" ? items.length : items.filter((d) => d.queue === q).length);
  const shown = queue === "all" ? items : items.filter((d) => d.queue === queue);
  const allClear = items.length === 0 && overdue.length === 0 && callBacks.length === 0;
  const clockTotal = clockParts.reduce((n, p) => n + p.n, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Actions" sub={`${PROJECT_NAME} · ${fmtDate(now)}`} />

      {allClear ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <CheckCircle2 className="size-6 text-emerald-600" />
          <div>
            <p className="text-lg font-semibold text-emerald-900">All clear</p>
            <p className="text-base text-emerald-800">No decisions waiting, no repairs past the legal deadline, no unhappy buyers to call.</p>
          </div>
        </div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Summary icon={Inbox} tile="bg-red-50 text-brand" n={items.length} label={items.length === 1 ? "decision waiting" : "decisions waiting"} />
          <Summary icon={Clock} tile="bg-red-50 text-red-700" n={overdue.length} label={overdue.length === 1 ? "repair past 30 days" : "repairs past 30 days"} bad />
          <Summary icon={Phone} tile="bg-amber-50 text-amber-700" n={callBacks.length} label={callBacks.length === 1 ? "buyer to call back" : "buyers to call back"} />
        </div>
      )}

      <Panel
        title="Needs Your Decision"
        action={
          <Link href="/sdp/approvals" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            All approvals <ArrowRight className="size-4" />
          </Link>
        }
      >
        <div role="tablist" className="-mt-1 mb-2 flex flex-wrap gap-1 border-b border-zinc-200">
          {(["all", "review", "signoff", "extra"] as const).map((q) => (
            <button
              key={q}
              type="button"
              role="tab"
              aria-selected={queue === q}
              onClick={() => setQueue(q)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-base font-medium transition",
                queue === q ? "border-brand text-brand" : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              {q === "all" ? "All" : QUEUE_STYLE[q].label}
              <span className={cn("rounded-full px-1.5 text-sm tabular-nums", queue === q && count(q) ? "bg-brand text-white" : "bg-zinc-100 text-zinc-600")}>{count(q)}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-3 text-base text-zinc-500">
            {queue === "all"
              ? "Nothing waiting on you. New items appear here when an agent holds a case, a repair needs sign-off or an extra inspection is requested."
              : `Nothing in ${QUEUE_STYLE[queue].label} right now.`}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {shown.slice(0, 6).map((d) => (
              <li key={d.key}>
                <Link href={d.href} className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-zinc-50">
                  <span className="w-16 shrink-0 font-mono text-sm text-zinc-500">{d.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 flex flex-wrap gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", QUEUE_STYLE[d.queue].tag)}>{QUEUE_STYLE[d.queue].label}</span>
                      {d.flag && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {d.flag === "Possible latent defect" ? <History className="size-3" /> : <AlertTriangle className="size-3" />} {d.flag}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-base font-medium">{d.title}</span>
                    <span className="block truncate text-sm text-zinc-500">{d.kind}</span>
                  </span>
                  {d.since && <span className="shrink-0 text-sm tabular-nums text-zinc-500">{waited(d.since, now)}</span>}
                  <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 6 && <p className="mt-2 px-2 text-sm text-zinc-500">and {shown.length - 6} more on Approvals</p>}
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="At Risk: Legal Deadlines" className="min-w-0">
          {clockTotal === 0 ? (
            <p className="text-base text-zinc-500">No open repairs on the 30-day clock.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <EChart option={clockChart} height={170} className="w-44 shrink-0" />
              <div className="min-w-40 flex-1">
                <p className="mb-2 text-sm text-zinc-500">{clockTotal} open repairs by time left on the 30-day repair clock</p>
                <ul className="space-y-1.5">
                  {clockParts.map((p) => (
                    <li key={p.label} className="flex items-center gap-2 text-base">
                      <span className="size-3 rounded-full" style={{ background: p.colour }} />
                      <span className="flex-1">{p.label}</span>
                      <span className="font-semibold tabular-nums">{p.n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {overdue.length > 0 && (
            <>
              <p className="mb-1 mt-5 text-sm font-medium uppercase tracking-wide text-zinc-500">Past the 30-day repair period</p>
              <ul className="divide-y divide-zinc-100">
                {overdue.slice(0, 4).map((o) => (
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
              {overdue.length > 4 && (
                <Link href="/sdp/insights?tab=statutory" className="mt-1 inline-block text-sm text-zinc-500 hover:text-zinc-900">
                  and {overdue.length - 4} more
                </Link>
              )}
            </>
          )}
          {dlpSoon.length > 0 && (
            <>
              <p className="mb-1 mt-5 text-sm font-medium uppercase tracking-wide text-zinc-500">Defect liability period ending</p>
              <ul className="divide-y divide-zinc-100">
                {dlpSoon.map((d) => (
                  <li key={d.block}>
                    <Link href={`/sdp/defects?block=${d.block}`} className="flex items-center gap-3 py-2.5 text-base hover:bg-zinc-50">
                      <span className="font-medium">Block {d.block}</span>
                      <span className="flex-1 text-zinc-600">{d.openCases} open case(s) to finish first</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">{d.daysLeft}d left</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!st && <p className="mt-4 text-sm text-zinc-500">Deadlines are calculated by the backend. Start it to see them.</p>}
        </Panel>

        <Panel title="Buyers to Call Back" className="min-w-0">
          {callBacks.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200/70">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <p className="text-base text-zinc-700">No unhappy ratings right now. Buyers who rate a repair 1 or 2 stars show up here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {callBacks.slice(0, 4).map((r) => (
                <li key={r.caseId}>
                  <Link href={`/sdp/defects/${r.caseId}`} className="block rounded-xl p-3 ring-1 ring-zinc-200 hover:ring-brand">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-base font-medium">
                        <Phone className="size-4 text-amber-600" /> Unit {r.unitId}
                      </span>
                      <Stars value={r.stars} />
                    </div>
                    {r.comment && <p className="mt-1 text-base text-zinc-700">&ldquo;{r.comment}&rdquo;</p>}
                    <p className="mt-1 text-sm text-zinc-500">
                      {r.caseId} · rated {fmtDate(r.at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Summary({ icon: Icon, tile, n, label, bad }: { icon: typeof Inbox; tile: string; n: number; label: string; bad?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/70">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", n ? tile : "bg-zinc-100 text-zinc-400")}>
        <Icon className="size-6" />
      </span>
      <span>
        <span className={cn("block text-4xl font-semibold tabular-nums", bad && n > 0 && "text-red-700")}>{n}</span>
        <span className="text-base text-zinc-600">{label}</span>
      </span>
    </div>
  );
}

function waited(since: string, now: string) {
  const d = Math.floor(daysBetween(since, now));
  return d <= 0 ? "Today" : `${d} day${d === 1 ? "" : "s"}`;
}
