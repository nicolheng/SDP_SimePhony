"use client";
import { EChart } from "@/components/echart";
import { hbarOption } from "@/components/insight-charts";
import { Panel } from "@/components/sdp-ui";
import { AVOIDABLE, CAME_BACK, LEAK_SOURCES, LESSONS_SCOPE, RECOMMENDATIONS, WORST_STACK } from "@/lib/insights-data";
import { cn } from "@/lib/utils";
import { CaseChips, Eyebrow } from "./bits";

// Built once: the data is fixed, and a new option object would replay the entry animation on every store poll.
const OPT = {
  cameBack: hbarOption(CAME_BACK.byCategory, "Reopened"),
  avoidable: hbarOption(AVOIDABLE.byCategory, "Reports"),
  leaks: hbarOption(LEAK_SOURCES, "Leaks"),
};

/** Insights › Next Building (issue H): what went wrong, why, and what to change before building again. */
export function NextBuilding() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-zinc-100 p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-2xl font-semibold tracking-tight">Lessons for the Next Building</h2>
        <p className="mt-1 text-base text-zinc-600">{LESSONS_SCOPE}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Headline value={`${Math.round((CAME_BACK.reopened / CAME_BACK.of) * 100)}%`} label="of repairs came back" sub={`${CAME_BACK.reopened} of ${CAME_BACK.of} confirmed defects`} />
          <Headline value="7 of 17" label="repeat repairs were water leaks" sub="The category that came back most" />
          <Headline value={`${Math.round((AVOIDABLE.count / AVOIDABLE.of) * 100)}%`} label="of reports were not a defect" sub={`${AVOIDABLE.count} of ${AVOIDABLE.of} reports`} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="What Came Back">
          <p className="-mt-2 mb-2 text-sm text-zinc-500">The {CAME_BACK.reopened} defects that were reopened after the repair.</p>
          <EChart option={OPT.cameBack} height={190} />
        </Panel>
        <Panel title="Where We Did Worst">
          <StackDiagram />
        </Panel>
        <Panel title="Avoidable Reports">
          <p className="-mt-2 mb-2 text-sm text-zinc-500">Reports a technician found were not a defect.</p>
          <EChart option={OPT.avoidable} height={190} />
          <blockquote className="mt-3 border-l-2 border-zinc-300 pl-3 text-sm text-zinc-600">&ldquo;{AVOIDABLE.example}&rdquo;</blockquote>
        </Panel>
      </div>

      <Panel title="Root Cause: Where the Water Comes From">
        <p className="-mt-2 mb-2 text-sm text-zinc-500">Water leaks are the biggest category (26 confirmed). Grouped by where the buyer saw the leak.</p>
        <div className="grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <EChart option={OPT.leaks} height={190} />
          </div>
          <ul className="space-y-3 text-base text-zinc-700 lg:col-span-2">
            <li>
              <span className="font-semibold">Wet areas upstairs.</span> A ceiling leak starts in the bathroom or floor trap of the unit above, so the fix belongs
              in the design detail, not in the unit that reported it.
            </li>
            <li>
              <span className="font-semibold">Pipe joints.</span> Shaft and riser leaks show up after handover, once the pipes are boxed in and hard to test.
            </li>
          </ul>
        </div>
      </Panel>

      <Panel title="Recommendations">
        <ol className="divide-y divide-zinc-100">
          {RECOMMENDATIONS.map((r, i) => (
            <li key={r.action} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-base font-semibold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-lg font-semibold">{r.action}</p>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm font-medium text-zinc-700">{r.owner}</span>
                </div>
                <p className="mt-1 text-base text-zinc-700">{r.evidence}</p>
                <div className="mt-2">
                  <CaseChips ids={r.caseIds} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <p className="text-sm text-zinc-500">Roadmap: compare lessons across projects, and export them as a PDF for the design team.</p>
    </div>
  );
}

function Headline({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <p className="text-4xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-base text-zinc-800">{label}</p>
      <p className="text-sm text-zinc-500">{sub}</p>
    </div>
  );
}

/** One stack drawn as floors, top to bottom: brand = a repair came back, light red = reported, grey = no report. */
function StackDiagram() {
  return (
    <div>
      <p className="text-base font-semibold">{WORST_STACK.title}</p>
      <p className="mb-4 text-sm text-zinc-500">{WORST_STACK.sub}</p>
      <div className="mx-auto w-full max-w-56 space-y-1">
        {WORST_STACK.floors.map((f) => (
          <div
            key={f.unit}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-1.5 text-sm",
              f.cameBack ? "bg-brand text-white" : f.reports ? "bg-red-100 text-red-900" : "bg-zinc-100 text-zinc-500",
            )}
          >
            <span className="font-mono">{f.unit}</span>
            <span className="tabular-nums">
              {f.reports ? `${f.reports} report${f.reports > 1 ? "s" : ""}` : "none"}
              {f.cameBack ? ` · ${f.cameBack} back` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-600">
        <Key className="bg-brand" label="Came back" />
        <Key className="bg-red-100" label="Reported" />
        <Key className="bg-zinc-100" label="No report" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Eyebrow>Cases</Eyebrow>
        <CaseChips ids={["H-0001", "H-0002", "H-0003", "H-0004", "H-0005", "H-0006", "C-0014"]} max={7} />
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded-sm", className)} /> {label}
    </span>
  );
}
