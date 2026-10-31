"use client";
import { ArrowRight, Layers, Radar, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Stars } from "@/components/rating";
import { HBars, Kpi, PageTitle, Panel, StackHeatmap } from "@/components/sdp-ui";
import { stackHeatmap, useAnalytics } from "@/lib/analytics";
import { BLOCKS, CATEGORY_LABEL, RULES, workerName } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import type { Category, DetectedIssue, Satisfaction, SystemicIssue } from "@/lib/types";
import { cn } from "@/lib/utils";

const selectCls = "h-10 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-brand";

function IssueStatus({ d, records }: { d: DetectedIssue; records: SystemicIssue[] }) {
  const record = records.find((r) => r.id === d.recordId);
  if (!record) return <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-700">Detected · not escalated yet</span>;
  const pending = record.approvalStatus === "pending";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium", pending ? "bg-violet-100 text-violet-800" : "bg-emerald-50 text-emerald-800")}>
      {pending ? <ShieldAlert className="size-4" /> : <ShieldCheck className="size-4" />}
      {record.id} · {pending ? "awaiting SDP approval" : record.status.replace("_", " ")}
    </span>
  );
}

export default function Analytics() {
  const cases = useDemo((s) => s.cases);
  const records = useDemo((s) => s.systemicIssues);
  const router = useRouter();
  const a = useAnalytics();
  const detected = useMemo(() => a?.detected ?? [], [a]);
  const threshold = a?.systemicConfidence ?? 1;
  const issues = detected.filter((d) => d.confidence >= threshold);
  const watchlist = detected.filter((d) => d.confidence < threshold);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [block, setBlock] = useState("A");
  const [category, setCategory] = useState<Category | "all">("all");

  const selected = detected.find((d) => d.key === selectedKey) ?? issues[0] ?? detected[0];
  const issueMode = !showAll && !!selected;
  const viewBlock = issueMode ? selected.block : block;
  const viewCategory = issueMode ? selected.category : category;
  // Cheap (150 cells), so it is simply recomputed on each render.
  const heat = stackHeatmap(a?.unitStats ?? [], viewBlock, viewCategory, issueMode ? new Set(selected.units) : undefined);

  if (!a)
    return (
      <div className="mx-auto max-w-7xl">
        <PageTitle title="Analytics" sub="Systemic issue detection: recurring defects that share a cause" />
        <p className="rounded-2xl bg-white p-6 text-base text-zinc-600 ring-1 ring-zinc-200">Analytics are calculated by the backend. Start it to see them.</p>
      </div>
    );
  const k = a.kpis;
  const cats = a.byCategory;
  const blocks = a.byBlock;
  const top = a.topRecurring;

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Analytics" sub="Systemic issue detection: recurring defects that share a cause" />

      {/* How the detection works, with live numbers */}
      <ol className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { n: k.total, label: "Defect cases", sub: "Seeded history + live" },
          { n: `${RULES.stackClusterThreshold}+ units`, label: "Cluster rule", sub: "Same block, stack & category" },
          { n: issues.length, label: "Systemic issues detected", sub: `${issues.filter((d) => d.recordId).length} escalated · ${watchlist.length} on watchlist` },
          { n: selected ? `${selected.block}-${selected.stack}` : "—", label: "Shown on heatmap", sub: selected ? CATEGORY_LABEL[selected.category] : "No cluster" },
        ].map((x, i) => (
          <li key={x.label} className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/70">
            <p className="text-3xl font-semibold tabular-nums">{x.n}</p>
            <p className="mt-1 text-base font-medium">{x.label}</p>
            <p className="text-sm text-zinc-500">{x.sub}</p>
            {i < 3 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-6 -translate-y-1/2 rounded-full bg-zinc-50 text-zinc-400 sm:block" />}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-2" title="Systemic issues detected">
          {issues.length === 0 ? (
            <p className="text-base text-zinc-500">No clusters reach the threshold.</p>
          ) : (
            <ul className="space-y-3">
              {issues.map((d) => (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKey(d.key);
                      setShowAll(false);
                    }}
                    className={cn(
                      "w-full rounded-xl p-4 text-left ring-1 transition",
                      issueMode && d.key === selected.key ? "bg-red-50/60 ring-2 ring-brand" : "bg-white ring-zinc-200 hover:ring-zinc-400",
                    )}
                  >
                    <p className="flex items-start gap-2 text-base font-semibold leading-snug">
                      <Radar className="mt-0.5 size-5 shrink-0 text-brand" /> {d.headline}
                    </p>
                    <p className="mt-1.5 text-sm text-zinc-600">
                      {d.units.length} units · {d.reopened} reopen(s) · {d.openCases} open now
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-zinc-100">
                        <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round(d.confidence * 100)}%` }} />
                      </div>
                      <span className="text-sm tabular-nums text-zinc-600">{Math.round(d.confidence * 100)}% confidence</span>
                    </div>
                    <div className="mt-3">
                      <IssueStatus d={d} records={records} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {watchlist.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Watchlist · below {Math.round(threshold * 100)}% confidence</p>
              <ul className="mt-2 space-y-1">
                {watchlist.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKey(d.key);
                        setShowAll(false);
                      }}
                      className={cn("w-full rounded-lg px-3 py-2 text-left text-base hover:bg-zinc-50", issueMode && d.key === selected.key && "bg-zinc-100")}
                    >
                      {CATEGORY_LABEL[d.category]} · Block {d.block} / Stack {d.stack}
                      <span className="text-zinc-500"> · {d.units.length} units · {Math.round(d.confidence * 100)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/sdp/systemic" className="mt-4 inline-flex items-center gap-1 text-base font-semibold text-brand">
            <Layers className="size-4" /> All systemic issue records
          </Link>
        </Panel>

        <Panel
          className="lg:col-span-3"
          title={issueMode ? `Block ${selected.block} / Stack ${selected.stack}: ${CATEGORY_LABEL[selected.category].toLowerCase()} cluster` : `Block ${block}: all reported defects`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {!issueMode && (
                <>
                  <select value={block} onChange={(e) => setBlock(e.target.value)} className={selectCls} aria-label="Block">
                    {BLOCKS.map((b) => (
                      <option key={b} value={b}>
                        Block {b}
                      </option>
                    ))}
                  </select>
                  <select value={category} onChange={(e) => setCategory(e.target.value as Category | "all")} className={selectCls} aria-label="Category">
                    <option value="all">All categories</option>
                    {Object.entries(CATEGORY_LABEL).map(([key, v]) => (
                      <option key={key} value={key}>
                        {v}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {selected && (
                <button type="button" onClick={() => setShowAll(!showAll)} className="h-10 rounded-lg px-3 text-base font-medium text-brand ring-1 ring-brand/40 hover:bg-red-50">
                  {issueMode ? "Show all defects" : "Back to detected issue"}
                </button>
              )}
            </div>
          }
        >
          <p className="mb-4 text-base text-zinc-600">
            {issueMode
              ? `Coloured cells are the ${selected.units.length} units in this cluster (floors × stacks); everything else is greyed out. New linked cases flash amber, then red.`
              : "Floors (rows) × stacks (columns). Colour = reports + reopens per unit."}
          </p>
          <StackHeatmap
            rows={heat}
            viewKey={`${viewBlock}|${viewCategory}|${issueMode ? selected.key : "all"}`}
            highlightStack={issueMode ? selected.stack : undefined}
            onCell={(cell) => {
              const latest = cases.filter((c) => c.unitId === cell.unitId).at(-1);
              if (latest) router.push(`/sdp/defects/${latest.id}`);
            }}
          />
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Reopen rate" value={`${(k.reopenRate * 100).toFixed(1)}%`} />
        <Kpi label="Avg days to close" value={k.avgDaysToClose.toFixed(1)} />
        <Kpi label="Units with repeat defects" value={top.length} hint="Same unit, same category" />
        <Kpi label="Open defects" value={k.open} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Top recurring problems">
          <ol className="space-y-2">
            {top.map((t, i) => (
              <li key={`${t.unitId}-${t.category}`} className="flex items-center gap-3 rounded-lg p-2.5 ring-1 ring-zinc-200">
                <span className="grid size-8 place-items-center rounded-full bg-zinc-100 text-base font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">
                    <span className="font-mono">{t.unitId}</span> · {CATEGORY_LABEL[t.category]}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {t.count} reports{t.reopens ? ` · ${t.reopens} reopen(s)` : ""}
                    {t.open && " · open now"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Defects by category">
          <HBars data={cats} height={340} />
        </Panel>
        <Panel title="Defects by block">
          <HBars data={blocks} dataKey="total" height={170} />
          <table className="mt-4 w-full text-base">
            <thead>
              <tr className="text-left text-sm text-zinc-500">
                <th className="font-medium">Block</th>
                <th className="text-right font-medium">Total</th>
                <th className="text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.name} className="border-t border-zinc-100">
                  <td className="py-2">{b.name}</td>
                  <td className="text-right tabular-nums">{b.total}</td>
                  <td className="text-right tabular-nums">{b.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {a.satisfaction && <BuyerSatisfaction s={a.satisfaction} />}
    </div>
  );
}

/** Ratings buyers give after signing off a repair. */
function BuyerSatisfaction({ s }: { s: Satisfaction }) {
  const most = Math.max(1, ...s.distribution.map((d) => d.count));
  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
        <Star className="size-5 text-amber-500" /> Buyer satisfaction
      </h2>
      {s.count === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-base text-zinc-600 ring-1 ring-zinc-200">No ratings yet. Buyers are asked to rate the repair when they sign off.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Average rating" value={`${s.average.toFixed(1)} / 5`} hint={`${s.count} rating(s)`} accent />
            <Kpi label="Response rate" value={`${Math.round(s.responseRate * 100)}%`} hint="Of buyer sign-offs" />
            <Kpi label="Happy (4–5★)" value={s.distribution.filter((d) => d.stars >= 4).reduce((n, d) => n + d.count, 0)} />
            <Kpi label="Unhappy (1–2★)" value={s.low} hint={s.low ? "Worth a follow-up call" : undefined} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Rating breakdown">
              <ul className="space-y-2">
                {s.distribution.map((d) => (
                  <li key={d.stars} className="flex items-center gap-3 text-base">
                    <span className="w-8 tabular-nums text-zinc-600">{d.stars}★</span>
                    <div className="h-3 flex-1 rounded-full bg-zinc-100">
                      <div className="h-3 rounded-full bg-amber-400" style={{ width: `${(d.count / most) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right tabular-nums text-zinc-600">{d.count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="By category (lowest first)">
              <ul className="divide-y divide-zinc-100">
                {s.byCategory.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-base">
                    <span>{c.name}</span>
                    <span className="flex items-center gap-2 text-sm text-zinc-600">
                      <Stars value={c.average} /> {c.average.toFixed(1)} · {c.count}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Latest feedback">
              <ul className="space-y-3">
                {s.recent.map((r) => (
                  <li key={r.caseId} className="rounded-lg p-2.5 ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/sdp/defects/${r.caseId}`} className="font-mono text-sm hover:underline">
                        {r.caseId} · {r.unitId}
                      </Link>
                      <Stars value={r.stars} />
                    </div>
                    {r.comment && <p className="mt-1 text-base text-zinc-700">&ldquo;{r.comment}&rdquo;</p>}
                    <p className="mt-1 text-sm text-zinc-500">
                      {r.technicianId ? `${workerName(r.technicianId)} · ` : ""}
                      {fmtDate(r.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}
