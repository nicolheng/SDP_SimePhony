"use client";
import { ClipboardX } from "lucide-react";
import { useMemo, useState } from "react";
import { useRecentActivity } from "@/components/case-views";
import { DefectCard } from "@/components/defect-card";
import { EmptyState, MobileHeader, SummaryStrip, UnderlineTabs } from "@/components/mobile";
import { DEMO_BUYER } from "@/lib/constants";
import { BUYER_TABS, isOpen } from "@/lib/status";
import { useDemo } from "@/lib/store";
import type { Case, CaseStatus } from "@/lib/types";

type TabId = (typeof BUYER_TABS)[number]["id"];

export default function MyDefects() {
  const cases = useDemo((s) => s.cases);
  const [tab, setTab] = useState<TabId>("all");
  // Most recently updated first (latest progress on the case), not by report date.
  const own = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id), [cases]);
  const { sorted: mine } = useRecentActivity(own);

  const inTab = (c: Case, id: TabId) => {
    const t = BUYER_TABS.find((x) => x.id === id)!;
    return t.statuses === null || (t.statuses as readonly CaseStatus[]).includes(c.status);
  };
  const shown = mine.filter((c) => inTab(c, tab));

  return (
    <div>
      <MobileHeader title="My Defects" back="/buyer" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Defects Listing</h2>
          <p className="text-sm text-zinc-600">Track every defect you&apos;ve reported.</p>
        </div>
        <SummaryStrip
          items={[
            { label: "Total Defects", value: mine.length },
            { label: "Ongoing", value: mine.filter((c) => isOpen(c.status)).length },
            { label: "Total Closed", value: mine.filter((c) => !isOpen(c.status)).length },
          ]}
        />

        <UnderlineTabs
          tabs={BUYER_TABS.map((t) => ({ id: t.id, label: t.label, count: mine.filter((c) => inTab(c, t.id)).length }))}
          value={tab}
          onChange={setTab}
        />

        {shown.length === 0 ? (
          <EmptyState icon={<ClipboardX className="size-16" strokeWidth={1.5} />} text="There are no defects here at the moment." />
        ) : (
          <ul className="space-y-3">
            {shown.map((c) => (
              <li key={c.id}>
                <DefectCard c={c} href={`/buyer/cases/${c.id}`} buyer />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
