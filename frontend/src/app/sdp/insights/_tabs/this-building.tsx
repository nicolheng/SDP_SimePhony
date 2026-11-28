"use client";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EChart } from "@/components/echart";
import { CONTRACTOR_COLOURS, categoriesOption, hbarOption, monthlyOption, radarOption, ratingsOption, stagesOption } from "@/components/insight-charts";
import { Stars } from "@/components/rating";
import { Panel } from "@/components/sdp-ui";
import { BUYERS, CAME_BACK, CATEGORIES, CONTRACTOR_RADAR, CONTRACTORS, HEALTH, LEAK_SOURCES, MONTHLY, STAGES, WHAT_CHANGED, type Tone } from "@/lib/insights-data";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CaseChips, Eyebrow, TONE, ToneChip } from "./bits";

// The data is fixed, so the chart options are built once (a new object would re-run the chart's entry animation
// every time the store polls).
const OPT = {
  monthly: monthlyOption(MONTHLY),
  stages: stagesOption(STAGES),
  categories: categoriesOption(CATEGORIES),
  leaks: hbarOption(LEAK_SOURCES, "Leaks"),
  radar: radarOption(CONTRACTOR_RADAR),
  ratings: ratingsOption(BUYERS.distribution),
};

const TONE_TEXT: Record<Tone, string> = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-700", neutral: "text-zinc-900" };
const TONE_ICON: Record<Tone, string> = { good: "text-emerald-600", warn: "text-amber-500", bad: "text-red-600", neutral: "text-zinc-400" };

/** Insights › This Building: how the project is doing, why, and who is responsible. */
export function ThisBuilding() {
  return (
    <div className="space-y-6">
      <WhatChanged />
      <Health />
      <Funnel />
      <TimeLost />
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Where Defects Come From" className="min-w-0 lg:col-span-3">
          <p className="-mt-2 mb-2 text-sm text-zinc-500">Confirmed defects per category, and how many came back after the repair.</p>
          <EChart option={OPT.categories} height={400} />
        </Panel>
        <Panel title="Where Water Leaks Show Up" className="min-w-0 lg:col-span-2">
          <p className="-mt-2 mb-3 text-sm text-zinc-500">The 26 confirmed leaks, the biggest category, by where the buyer saw them.</p>
          <EChart option={OPT.leaks} height={180} />
          <p className="mt-3 text-base text-zinc-700">
            <span className="font-semibold">10 of 26</span> came through the ceiling from the unit above: the cause is upstairs, not in the unit that reported it.
          </p>
          <Link href="/sdp/systemic" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            See the leak cluster on Systemic Issues <ArrowRight className="size-4" />
          </Link>
        </Panel>
      </div>
      <Contractors />
      <Buyers />
      <DetailViews />
    </div>
  );
}

function WhatChanged() {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">What Changed</h2>
      <ul className="space-y-2">
        {WHAT_CHANGED.map((w) => {
          const Icon = TONE[w.tone].icon;
          return (
            <li key={w.text} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/70">
              <Icon className={cn("size-5 shrink-0", TONE_ICON[w.tone])} />
              <span className="text-base text-zinc-800">{w.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Health() {
  // Live, so it matches the Approvals badge in the sidebar: the manager sees the backlog size, staff work the list on Actions.
  const approvals = useDemo((s) => s.approvals);
  const cases = useDemo((s) => s.cases);
  const waiting = useMemo(
    () =>
      approvals.filter((a) => a.status === "pending").length +
      cases.filter((c) => c.status === "PENDING_REVIEW" || (c.status === "PENDING_SIGNOFF" && (!c.signoff?.developer || c.signoffOverdueAt))).length,
    [approvals, cases],
  );

  return (
    <section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {HEALTH.map((h) => (
          <div key={h.label} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/70">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">{h.label}</p>
            <p className={cn("mt-1 text-4xl font-semibold tabular-nums", TONE_TEXT[h.tone])}>{h.value}</p>
            <p className="mt-1 text-sm text-zinc-500">{h.detail}</p>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              <ToneChip tone={h.tone}>{h.status}</ToneChip>
              <span className="text-xs text-zinc-500">{h.baseline}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="New Reports per Month" className="min-w-0 lg:col-span-2">
          <EChart option={OPT.monthly} height={260} />
        </Panel>
        <Panel title="Team Backlog" className="flex flex-col">
          <p className="text-5xl font-semibold tabular-nums">{waiting}</p>
          <p className="mt-1 text-base text-zinc-600">{waiting === 1 ? "decision" : "decisions"} waiting on SDP staff right now</p>
          <p className="mt-4 text-sm text-zinc-500">Cases held for review, extra inspections and sign-offs. Staff work through them on Actions.</p>
          <Link href="/sdp" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand hover:underline">
            Open Actions <ArrowRight className="size-4" />
          </Link>
        </Panel>
      </div>
    </section>
  );
}

/** Where every report ended up: each one lands in exactly one part of the bar, so the parts add up to 123. */
function Funnel() {
  const confirmed = CAME_BACK.of;
  const reports = 123;
  const parts = [
    { label: "Fixed first time", n: confirmed - CAME_BACK.reopened, bar: "bg-zinc-400", text: "text-white" },
    { label: "Came back after repair", n: CAME_BACK.reopened, bar: "bg-brand", text: "text-white" },
    { label: "Not a defect", n: reports - confirmed, bar: "bg-zinc-200", text: "text-zinc-700" },
  ];
  return (
    <Panel title="Where Every Report Ended Up">
      <p className="-mt-2 mb-4 text-sm text-zinc-500">All {reports} reports. Each one is in exactly one part of the bar.</p>
      <div className="flex h-10 gap-0.5 overflow-hidden rounded-lg">
        {parts.map((p) => (
          <div
            key={p.label}
            title={`${p.label}: ${p.n}`}
            className={cn("flex items-center justify-center text-sm font-semibold tabular-nums", p.bar, p.text)}
            style={{ width: `${(p.n / reports) * 100}%` }}
          >
            {p.n}
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-start gap-2.5">
            <span className={cn("mt-1.5 size-3 shrink-0 rounded-full", p.bar)} />
            <span>
              <span className="block text-base font-medium">{p.label}</span>
              <span className="text-sm text-zinc-500">
                {p.n} reports · {Math.round((p.n / reports) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-base text-zinc-700">
        Of the {CAME_BACK.reopened} that came back:{" "}
        {CAME_BACK.byCategory.map((c, i) => (
          <span key={c.name}>
            {i > 0 && ", "}
            <span className="font-semibold">{c.count}</span> {c.name.toLowerCase()}
          </span>
        ))}
        .
      </p>
    </Panel>
  );
}

function TimeLost() {
  const total = STAGES.reduce((n, s) => n + s.days, 0);
  const slowest = STAGES.reduce((a, b) => (b.days > a.days ? b : a));
  const dot = (key: string, i: number) => (key === slowest.key ? "bg-brand" : i === 0 ? "bg-zinc-400" : "bg-zinc-300");
  return (
    <Panel title="Where Time Is Lost">
      <p className="-mt-2 mb-4 text-sm text-zinc-500">Average days per stage for the 90 closed cases: {total.toFixed(1)} days from report to close.</p>
      <EChart option={OPT.stages} height={40} />
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className={cn("mt-1.5 size-3 shrink-0 rounded-full", dot(s.key, i))} />
            <span>
              <span className="block text-base font-medium">{s.label}</span>
              <span className="text-sm text-zinc-500">
                {s.days.toFixed(1)} days · {Math.round((s.days / total) * 100)}% of the time
                {s.key === slowest.key && <span className="font-semibold text-brand"> · slowest step</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Contractors() {
  const [open, setOpen] = useState<string | null>(CONTRACTORS[0].name);
  const per100 = (c: (typeof CONTRACTORS)[number]) => (c.defects / c.units) * 100;
  const rate = (c: (typeof CONTRACTORS)[number]) => c.reopened / c.defects;
  const best = CONTRACTORS.reduce((a, b) => (rate(b) < rate(a) ? b : a));

  return (
    <Panel title="Contractor Scorecard">
      <p className="-mt-2 mb-4 text-sm text-zinc-500">
        Further out on the radar is worse. Every figure links to its cases, so it can back a claim against the contractor.
      </p>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <EChart option={OPT.radar} height={340} onClick={(name) => CONTRACTORS.some((c) => c.name === name) && setOpen(name)} />
        </div>
        <ul className="space-y-3 lg:col-span-3">
          {CONTRACTORS.map((c, i) => {
            const isOpen = open === c.name;
            const r = rate(c);
            return (
              <li key={c.name} className={cn("rounded-2xl ring-1 transition", isOpen ? "ring-zinc-300" : "ring-zinc-200 hover:ring-zinc-300")}>
                <button type="button" onClick={() => setOpen(isOpen ? null : c.name)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 p-4 text-left">
                  <span className="flex min-w-40 items-center gap-2.5">
                    <span className="size-3 rounded-full" style={{ background: CONTRACTOR_COLOURS[i] }} />
                    <span>
                      <span className="block font-semibold">{c.name}</span>
                      <span className="text-sm text-zinc-500">
                        Block {c.block} · {c.units} units
                      </span>
                    </span>
                  </span>
                  <Stat label="Defects" value={c.defects} />
                  <Stat label="Per 100 units" value={per100(c).toFixed(0)} />
                  <Stat label="Came back" value={`${Math.round(r * 100)}%`} strong={r >= 0.15} />
                  <Stat label="Top problem" value={c.topProblem} />
                  <ChevronDown className={cn("ml-auto size-5 text-zinc-400 transition", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-200 px-4 pb-4 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold">{c.evidence.headline}</p>
                      {c === best ? <ToneChip tone="good">Lowest reopen rate</ToneChip> : r >= 0.15 && <ToneChip tone="bad">{Math.round(r * 100)}% came back</ToneChip>}
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-zinc-700">
                      {c.evidence.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Eyebrow>Cases</Eyebrow>
                      <CaseChips ids={c.evidence.caseIds} max={9} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link href={`/sdp/defects?block=${c.block}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                        All Block {c.block} cases <ArrowRight className="size-4" />
                      </Link>
                      <span className="text-sm text-zinc-500">Export evidence pack · Roadmap</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

function Stat({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <span>
      <span className="block text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={cn("text-base font-semibold tabular-nums", strong && "text-brand")}>{value}</span>
    </span>
  );
}

function Buyers() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="What Buyers Feel" className="min-w-0">
        <div className="flex items-end gap-4">
          <p className="text-5xl font-semibold tabular-nums">{BUYERS.average.toFixed(1)}</p>
          <div className="pb-1.5">
            <Stars value={BUYERS.average} />
            <p className="text-sm text-zinc-500">{Math.round(BUYERS.responseRate * 100)}% of buyers rate the repair at sign-off</p>
          </div>
        </div>
        <EChart option={OPT.ratings} height={180} className="mt-4" />
      </Panel>
      <Panel title="What Drives Low Ratings">
        <ul className="space-y-4">
          {BUYERS.drivers.map((d) => (
            <li key={d.label}>
              <div className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  {d.stars < 3 ? <AlertTriangle className="size-4 text-brand" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
                  {d.label}
                </span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">
                  <Stars value={d.stars} /> {d.stars.toFixed(1)}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-zinc-100">
                <div className={cn("h-2 rounded-full", d.stars < 3 ? "bg-brand" : "bg-emerald-500")} style={{ width: `${(d.stars / 5) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-base text-zinc-700">
          A late repair costs about <span className="font-semibold">2.4 stars</span> and a repeat visit about <span className="font-semibold">1.7</span>. Speed and
          fixing it the first time matter more than anything else.
        </p>
      </Panel>
    </div>
  );
}

function DetailViews() {
  const links = [
    { href: "/sdp/insights?tab=statutory", label: "Statutory clocks", sub: "DLP per block, every overdue repair" },
    { href: "/sdp/insights?tab=ratings", label: "All ratings", sub: "Live buyer ratings and comments" },
    { href: "/sdp/defects", label: "All defects", sub: "Search and filter every case" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="group flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 hover:ring-brand">
          <span>
            <span className="block text-base font-medium">{l.label}</span>
            <span className="text-sm text-zinc-500">{l.sub}</span>
          </span>
          <ArrowRight className="size-5 text-zinc-400 group-hover:text-brand" />
        </Link>
      ))}
    </div>
  );
}
