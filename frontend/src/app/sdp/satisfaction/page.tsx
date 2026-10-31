"use client";
import Link from "next/link";
import { Stars } from "@/components/rating";
import { Kpi, PageTitle, Panel } from "@/components/sdp-ui";
import { useAnalytics } from "@/lib/analytics";
import { workerName } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import type { Satisfaction } from "@/lib/types";

export default function Ratings() {
  const a = useAnalytics();
  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Ratings" sub="How satisfied buyers are with repairs, rated when they sign off" />
      {a?.satisfaction ? (
        <BuyerSatisfaction s={a.satisfaction} />
      ) : (
        <p className="rounded-2xl bg-white p-6 text-base text-zinc-600 ring-1 ring-zinc-200">Ratings are read from the backend. Start it to see them.</p>
      )}
    </div>
  );
}

/** Ratings buyers give after signing off a repair. */
function BuyerSatisfaction({ s }: { s: Satisfaction }) {
  const most = Math.max(1, ...s.distribution.map((d) => d.count));
  return (
    <section>
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
