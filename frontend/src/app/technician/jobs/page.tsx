"use client";
import { ClipboardX } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, MobileHeader, SummaryStrip, UnderlineTabs } from "@/components/mobile";
import { isOpen, TECH_TABS, TECH_TODO } from "@/lib/status";
import type { Case, CaseStatus } from "@/lib/types";
import { JobCard } from "../job-card";
import { jobSlot, useMyJobs } from "../use-my-jobs";

type TabId = (typeof TECH_TABS)[number]["id"];

const inTab = (c: Case, id: TabId) => {
  const t = TECH_TABS.find((x) => x.id === id)!;
  return t.statuses === null || (t.statuses as readonly CaseStatus[]).includes(c.status);
};

export default function MyJobs() {
  const { jobs } = useMyJobs();
  const [tab, setTab] = useState<TabId>("todo");

  const shown = useMemo(() => {
    const list = jobs.filter((c) => inTab(c, tab));
    // Upcoming work soonest first; everything else newest first.
    return list.sort((a, b) => (tab === "todo" ? jobSlot(a).localeCompare(jobSlot(b)) : jobSlot(b).localeCompare(jobSlot(a))));
  }, [jobs, tab]);

  return (
    <div>
      <MobileHeader title="My Jobs" back="/technician" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Jobs Listing</h2>
          <p className="text-sm text-zinc-600">Track every defect assigned to you.</p>
        </div>
        <SummaryStrip
          items={[
            { label: "Total Jobs", value: jobs.length },
            { label: "To Do", value: jobs.filter((c) => TECH_TODO.includes(c.status)).length },
            { label: "Total Closed", value: jobs.filter((c) => !isOpen(c.status)).length },
          ]}
        />

        <UnderlineTabs tabs={TECH_TABS.map((t) => ({ id: t.id, label: t.label, count: jobs.filter((c) => inTab(c, t.id)).length }))} value={tab} onChange={setTab} />

        {shown.length === 0 ? (
          <EmptyState icon={<ClipboardX className="size-16" strokeWidth={1.5} />} text="There are no jobs here at the moment." />
        ) : (
          <ul className="space-y-3">
            {shown.map((c) => (
              <li key={c.id}>
                <JobCard c={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
