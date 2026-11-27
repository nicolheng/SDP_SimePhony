"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageTitle } from "@/components/sdp-ui";
import { PROJECT_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Ratings } from "../_overview/ratings";
import { Statutory } from "../_overview/statutory";
import { NextBuilding } from "./_tabs/next-building";
import { ThisBuilding } from "./_tabs/this-building";

const TABS = [
  { id: "this", label: "This Building" },
  { id: "next", label: "Next Building" },
] as const;
type Tab = (typeof TABS)[number]["id"];
// Detail views linked from This Building (the old Overview tabs). Not in the tab bar.
const DETAILS = { statutory: { title: "", View: Statutory }, ratings: { title: "All Ratings", View: Ratings } } as const;

export default function Page() {
  return (
    <Suspense fallback={<p className="text-base text-zinc-500">Loading…</p>}>
      <Insights />
    </Suspense>
  );
}

/** For managers: how this project is doing and who caused the problems (This Building), and what to change before
 * building again (Next Building). Figures are hardcoded for the finals in lib/insights-data.ts. */
function Insights() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "this";
  const detail = DETAILS[params.get("tab") as keyof typeof DETAILS];

  if (detail)
    return (
      <div className="mx-auto max-w-7xl">
        <Link href="/sdp/insights" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="size-4" /> Insights
        </Link>
        {detail.title && <PageTitle title={detail.title} sub={PROJECT_NAME} />}
        <detail.View />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Insights" sub={`${PROJECT_NAME} · all blocks, defect liability period to date`} />
      <div className="mb-6 flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.replace(t.id === "this" ? "/sdp/insights" : `/sdp/insights?tab=${t.id}`, { scroll: false })}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-base font-medium transition",
              tab === t.id ? "border-brand text-brand" : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "this" ? <ThisBuilding /> : <NextBuilding />}
    </div>
  );
}
