"use client";
import { CalendarClock, ChevronDown, ChevronRight, ClipboardX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, MobileHeader, primaryButtonClass, SummaryStrip, UnderlineTabs } from "@/components/mobile";
import { PhotoThumb } from "@/components/photo";
import { StatusBadge } from "@/components/status-badge";
import { CATEGORY_LABEL, DEMO_BUYER } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { BUYER_TABS, isOpen, STATUS_META } from "@/lib/status";
import { useDemo } from "@/lib/store";
import type { Case, CaseStatus } from "@/lib/types";

type TabId = (typeof BUYER_TABS)[number]["id"];

function nextDate(c: Case) {
  if (c.status === "REPAIR_BOOKED" && c.repairSlot) return `Repair ${fmtDateTime(c.repairSlot)}`;
  if ((c.status === "VISIT_SCHEDULED" || c.status === "EXTRA_INSPECTION") && c.visitSlot) return `Visit ${fmtDateTime(c.visitSlot)}`;
  return null;
}

export default function MyDefects() {
  const cases = useDemo((s) => s.cases);
  const [tab, setTab] = useState<TabId>("all");
  const [status, setStatus] = useState<CaseStatus | "">("");
  const mine = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id).reverse(), [cases]);
  const current = mine.filter((c) => !c.historical);

  const inTab = (c: Case, id: TabId) => {
    if (id === "previous") return !!c.historical;
    if (c.historical) return false;
    const t = BUYER_TABS.find((x) => x.id === id)!;
    return t.statuses === null || (t.statuses as readonly CaseStatus[]).includes(c.status);
  };
  const shown = mine.filter((c) => inTab(c, tab) && (!status || c.status === status));
  const statusesInTab = [...new Set(mine.filter((c) => inTab(c, tab)).map((c) => c.status))];

  return (
    <div>
      <MobileHeader title="My Defects" back="/buyer" />
      <div className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Defects Listing</h2>
          <p className="text-sm text-zinc-600">Track every defect you&apos;ve reported for unit {DEMO_BUYER.unitId}.</p>
        </div>
        <SummaryStrip
          items={[
            { label: "Total Defects", value: current.length },
            { label: "Ongoing", value: current.filter((c) => isOpen(c.status)).length },
            { label: "Total Closed", value: current.filter((c) => !isOpen(c.status)).length },
          ]}
        />

        <UnderlineTabs
          tabs={BUYER_TABS.map((t) => ({ id: t.id, label: t.label, count: mine.filter((c) => inTab(c, t.id)).length }))}
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
                {STATUS_META[s].buyer}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-white" />
        </div>

        {shown.length === 0 ? (
          <>
            <EmptyState icon={<ClipboardX className="size-16" strokeWidth={1.5} />} text="There are no defects here at the moment." />
            {tab !== "previous" && (
              <Link href="/buyer/report" className={primaryButtonClass}>
                Report a Defect
              </Link>
            )}
          </>
        ) : (
          <ul className="space-y-3">
            {shown.map((c) => {
              const when = nextDate(c);
              return (
                <li key={c.id}>
                  <Link href={`/buyer/cases/${c.id}`} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-zinc-200">
                    <PhotoThumb photo={c.photos[0]} className="size-20 shrink-0" label={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.summary}</p>
                      <p className="text-xs text-zinc-500">
                        {c.id} · {CATEGORY_LABEL[c.category]} · {fmtDate(c.createdAt)}
                      </p>
                      <StatusBadge status={c.status} buyer className="mt-1.5" />
                      {when && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                          <CalendarClock className="size-3.5" /> {when}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-4 self-center text-zinc-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
