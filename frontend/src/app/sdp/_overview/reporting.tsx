"use client";
import { HBars, Kpi, Panel, TrendLine } from "@/components/sdp-ui";
import { useAnalytics } from "@/lib/analytics";
import { CATEGORY_LABEL } from "@/lib/constants";
import { StatutoryClocks } from "./statutory";

/** Overview › Analytics: reporting only (KPIs, trend, recurring units, category and block breakdowns).
 *  Systemic detection and the stack heatmap live on the Systemic Issues page. */
export function Reporting() {
  const a = useAnalytics();
  if (!a) return <p className="rounded-2xl bg-white p-6 text-base text-zinc-600 ring-1 ring-zinc-200">Analytics are calculated by the backend. Start it to see them.</p>;
  const k = a.kpis;
  const top = a.topRecurring;
  const blocks = a.byBlock;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Open Defects" value={k.open} hint={`${k.highOpen} high urgency`} accent />
        <Kpi label="Closed" value={k.closed} hint="All cases to date" />
        <Kpi label="Reopened" value={k.reopened} hint={`${(k.reopenRate * 100).toFixed(1)}% reopen rate`} />
        <Kpi label="Avg Days to Close" value={k.avgDaysToClose.toFixed(1)} hint="Verified repairs" />
        <Kpi label="Units with Repeat Defects" value={top.length} hint="Same unit, same category" />
      </div>

      <Panel title="New Defects per Month" className="mt-6">
        <TrendLine data={a.monthly} />
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Top Recurring Problems">
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
        <Panel title="Defects by Category">
          <HBars data={a.byCategory} height={340} />
        </Panel>
        <Panel title="Defects by Block">
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

      {a.statutory && <StatutoryClocks s={a.statutory} />}
    </>
  );
}
