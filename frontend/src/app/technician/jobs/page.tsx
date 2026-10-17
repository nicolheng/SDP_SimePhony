"use client";
import { ChevronDown, ClipboardX } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, MobileHeader, SummaryStrip, UnderlineTabs } from "@/components/mobile";
import { STATUS_META, TECH_TABS, TECH_TODO } from "@/lib/status";
import type { Case, CaseStatus } from "@/lib/types";
import { JobCard } from "../job-card";
import { jobSlot, useMyJobs } from "../use-my-jobs";

type TabId = (typeof TECH_TABS)[number]["id"];

const inTab = (c: Case, id: TabId) => {
  if (id === "history") return !!c.historical;
  if (c.historical) return false;
  const t = TECH_TABS.find((x) => x.id === id)!;
  return t.statuses === null || (t.statuses as readonly CaseStatus[]).includes(c.status);
};

export default function MyJobs() {
  const { tech, jobs } = useMyJobs();
  const [tab, setTab] = useState<TabId>("todo");
  const [status, setStatus] = useState<CaseStatus | "">("");
  const live = jobs.filter((c) => !c.historical);

  const shown = useMemo(() => {
    const list = jobs.filter((c) => inTab(c, tab) && (!status || c.status === status));
    // Upcoming work soonest first; finished work newest first.
    const upcoming = tab === "todo" || tab === "inspection" || tab === "repair";
    return list.sort((a, b) => (upcoming ? jobSlot(a).localeCompare(jobSlot(b)) : jobSlot(b).localeCompare(jobSlot(a))));
  }, [jobs, tab, status]);
  const statusesInTab = [...new Set(jobs.filter((c) => inTab(c, tab)).map((c) => c.status))];

  return (
    <div>
      <MobileHeader title="My Jobs" back="/technician" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Jobs Listing</h2>
          <p className="text-sm text-zinc-600">Defects assigned to {tech.name}.</p>
        </div>
        <SummaryStrip
          items={[
            { label: "Assigned", value: live.length },
            { label: "To do", value: live.filter((c) => TECH_TODO.includes(c.status)).length },
            { label: "Completed", value: live.filter((c) => c.status === "CLOSED" || c.status === "INVALID").length },
          ]}
        />

        <UnderlineTabs
          tabs={TECH_TABS.map((t) => ({ id: t.id, label: t.label, count: jobs.filter((c) => inTab(c, t.id)).length }))}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setStatus("");
          }}
        />

        <div className="relative inline-flex">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus | "")}
            className="h-9 appearance-none rounded-lg bg-brand pl-3 pr-8 text-sm font-medium text-white outline-none"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statusesInTab.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-white" />
        </div>

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
