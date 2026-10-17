"use client";
import Link from "next/link";
import { useMemo } from "react";
import { PageTitle, Panel } from "@/components/sdp-ui";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_CLS: Record<string, string> = {
  open: "bg-red-50 text-red-700",
  under_inspection: "bg-violet-50 text-violet-700",
  monitoring: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-700",
};

export default function SystemicIssues() {
  const issues = useDemo((s) => s.systemicIssues);
  const list = useMemo(() => [...issues].reverse(), [issues]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Systemic issues" sub="Recurring or clustered defects the agents detected — tracked as business issues, not just tickets." />
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((si) => (
          <Panel key={si.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs text-zinc-500">{si.id}</p>
                <h2 className="text-lg font-semibold">{si.title}</h2>
                <p className="text-sm text-zinc-600">
                  {CATEGORY_LABEL[si.category]} · Block {si.block} / Stack {si.stack}
                </p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[si.status])}>{si.status.replace("_", " ")}</span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ["Related cases", si.relatedCases.length],
                ["Reopened", si.reopenedCount],
                ["Confidence", `${Math.round(si.confidence * 100)}%`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-zinc-50 p-3">
                  <dd className="text-xl font-semibold tabular-nums">{v}</dd>
                  <dt className="text-[11px] text-zinc-500">{k}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm">
              <span className="font-medium">Recommended action:</span> {si.recommendedAction}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Detected {fmtDate(si.detectedAt)} · approval: {si.approvalStatus}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {si.relatedCases.slice(0, 12).map((id) => (
                <Link key={id} href={`/sdp/defects/${id}`} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:bg-zinc-200">
                  {id}
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
