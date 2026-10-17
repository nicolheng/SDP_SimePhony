"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { HBars, Kpi, PageTitle, Panel, StackHeatmap } from "@/components/sdp-ui";
import { byBlock, byCategory, kpis, stackHeatmap, topRecurring } from "@/lib/analytics";
import { BLOCKS, CATEGORY_LABEL } from "@/lib/constants";
import { useDemo } from "@/lib/store";
import type { Category } from "@/lib/types";

const selectCls = "h-8 rounded-lg border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-brand";

export default function Analytics() {
  const cases = useDemo((s) => s.cases);
  const router = useRouter();
  const [block, setBlock] = useState("A");
  const [category, setCategory] = useState<Category | "all">("water_leak");
  const k = useMemo(() => kpis(cases), [cases]);
  const cats = useMemo(() => byCategory(cases), [cases]);
  const blocks = useMemo(() => byBlock(cases), [cases]);
  const top = useMemo(() => topRecurring(cases, 8), [cases]);
  const heat = useMemo(() => stackHeatmap(cases, block, category), [cases, block, category]);
  const hottest = useMemo(() => {
    const totals = new Map<string, number>();
    heat.flat().forEach((c) => totals.set(c.stack, (totals.get(c.stack) ?? 0) + (c.count > 0 ? 1 : 0)));
    return [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [heat]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Analytics" sub="Recurring problems and where they cluster" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Reopen rate" value={`${(k.reopenRate * 100).toFixed(1)}%`} />
        <Kpi label="Avg days to close" value={k.avgDaysToClose.toFixed(1)} />
        <Kpi label="Units with repeat defects" value={top.length} hint="Same unit, same category" />
        <Kpi label="Hottest stack" value={hottest && hottest[1] > 0 ? `${block}-${hottest[0]}` : "—"} hint={hottest ? `${hottest[1]} affected units` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Building stack heatmap"
          action={
            <div className="flex gap-2">
              <select value={block} onChange={(e) => setBlock(e.target.value)} className={selectCls} aria-label="Block">
                {BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    Block {b}
                  </option>
                ))}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category | "all")} className={selectCls} aria-label="Category">
                <option value="all">All categories</option>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <p className="mb-3 text-xs text-zinc-500">Floors (rows) × stacks (columns). Colour = reports + reopens per unit over 18 months. Click a unit to open its latest case.</p>
          <StackHeatmap
            rows={heat}
            highlightStack={hottest?.[0]}
            onCell={(cell) => {
              const latest = cases.filter((c) => c.unitId === cell.unitId).at(-1);
              if (latest) router.push(`/sdp/defects/${latest.id}`);
            }}
          />
        </Panel>

        <Panel className="lg:col-span-2" title="Top recurring problems">
          <ol className="space-y-2">
            {top.map((t, i) => (
              <li key={`${t.unitId}-${t.category}`} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-zinc-200">
                <span className="grid size-6 place-items-center rounded-full bg-zinc-100 text-xs font-semibold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="font-mono">{t.unitId}</span> · {CATEGORY_LABEL[t.category]}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {t.count} reports{t.reopens ? ` · ${t.reopens} reopen(s)` : ""}
                    {t.open && " · open now"}
                  </p>
                </div>
              </li>
            ))}
            {top.length === 0 && <p className="text-sm text-zinc-500">No repeat defects.</p>}
          </ol>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Defects by category">
          <HBars data={cats} height={320} />
        </Panel>
        <Panel title="Defects by block" action={<Link href="/sdp/defects" className="text-xs font-semibold text-brand">Defect list →</Link>}>
          <HBars data={blocks} dataKey="total" height={160} />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="font-medium">Block</th>
                <th className="text-right font-medium">Total</th>
                <th className="text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.name} className="border-t border-zinc-100">
                  <td className="py-1.5">{b.name}</td>
                  <td className="text-right tabular-nums">{b.total}</td>
                  <td className="text-right tabular-nums">{b.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
