"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageTitle } from "@/components/sdp-ui";
import { PROJECT_NAME } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { useDemo } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Ratings } from "./_overview/ratings";
import { Reporting } from "./_overview/reporting";

const TABS = [
  { id: "analytics", label: "Analytics" },
  { id: "ratings", label: "Ratings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Page() {
  return (
    <Suspense fallback={<p className="text-base text-zinc-500">Loading…</p>}>
      <SdpOverview />
    </Suspense>
  );
}

/** ?tab=ratings opens Ratings; Analytics is the default (the old /sdp/analytics and /sdp/satisfaction pages redirect here). */
function SdpOverview() {
  const now = useDemo((s) => s.now);
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "analytics";

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Overview" sub={`${PROJECT_NAME} · as of ${fmtDate(now)}`} />
      <div className="mb-6 flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.replace(t.id === "analytics" ? "/sdp" : `/sdp?tab=${t.id}`, { scroll: false })}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-base font-medium transition",
              tab === t.id ? "border-brand text-brand" : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "analytics" && <Reporting />}
      {tab === "ratings" && <Ratings />}
    </div>
  );
}
