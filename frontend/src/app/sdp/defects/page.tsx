"use client";
import { RotateCcw, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { RepairClockBadge } from "@/components/repair-clock";
import { PageTitle, Panel } from "@/components/sdp-ui";
import { StatusBadge, UrgencyBadge } from "@/components/status-badge";
import { BLOCKS, CATEGORY_LABEL, getTechnician, getUnit, RULES } from "@/lib/constants";
import { daysBetween, fmtDate } from "@/lib/dates";
import { isOpen, STATUS_META } from "@/lib/status";
import { useDemo } from "@/lib/store";
import type { Case, CaseStatus, Category } from "@/lib/types";

const selectCls = "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-base outline-none focus:border-brand";

/** Days until the unit's defect liability period ends (negative once ended), or null without a VP date. */
function dlpLeft(unitId: string, now: string): number | null {
  const end = getUnit(unitId).dlpExpiry;
  return end ? Math.ceil(daysBetween(now, `${end}T23:59:59+08:00`)) : null;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-base text-zinc-500">Loading…</p>}>
      <Defects />
    </Suspense>
  );
}

/** ?block=A (from the Overview's DLP card) opens the list on one block. */
function Defects() {
  const cases = useDemo((s) => s.cases);
  const now = useDemo((s) => s.now);
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [status, setStatus] = useState<CaseStatus | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [block, setBlock] = useState(params.get("block") ?? "");
  const [urgency, setUrgency] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases
      .filter((c) => (state === "all" ? true : state === "open" ? isOpen(c.status) : !isOpen(c.status)))
      .filter((c) => !status || c.status === status)
      .filter((c) => !category || c.category === category)
      .filter((c) => !block || getUnit(c.unitId).block === block)
      .filter((c) => !urgency || c.urgency === urgency)
      .filter((c) => !needle || `${c.id} ${c.unitId} ${c.summary} ${c.description}`.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [cases, q, state, status, category, block, urgency]);

  const reset = () => {
    setQ("");
    setState("open");
    setStatus("");
    setCategory("");
    setBlock("");
    setUrgency("");
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Defects" sub={`${rows.length} of ${cases.length} cases`} />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case, unit, text" className={`${selectCls} w-56 pl-8`} />
          </div>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-base">
            {(["open", "closed", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setState(s)}
                className={`rounded-md px-3 py-1.5 capitalize ${state === s ? "bg-white font-medium shadow-sm" : "text-zinc-500"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus | "")} className={selectCls} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | "")} className={selectCls} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={block} onChange={(e) => setBlock(e.target.value)} className={selectCls} aria-label="Block">
            <option value="">All blocks</option>
            {BLOCKS.map((b) => (
              <option key={b} value={b}>
                Block {b}
              </option>
            ))}
          </select>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={selectCls} aria-label="Urgency">
            <option value="">Any urgency</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-base text-zinc-500 hover:bg-zinc-100">
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-base">
            <thead>
              <tr className="border-b text-left text-sm uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3 font-medium">Case</th>
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 font-medium">Defect</th>
                <th className="py-2 pr-3 font-medium">Urgency</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">30-day clock</th>
                <th className="py-2 pr-3 font-medium">Technician</th>
                <th className="py-2 pr-3 font-medium">Reported</th>
                <th className="py-2 font-medium">Reopens</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((c: Case) => (
                <tr key={c.id} onClick={() => router.push(`/sdp/defects/${c.id}`)} className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2.5 pr-3 font-mono text-sm">{c.id}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-mono text-sm">{c.unitId}</span>
                    <DlpLeft days={dlpLeft(c.unitId, now)} />
                  </td>
                  <td className="py-2.5 pr-3">
                    {c.summary}
                    <span className="block text-sm text-zinc-500">{CATEGORY_LABEL[c.category]}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <UrgencyBadge urgency={c.urgency} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <RepairClockBadge c={c} now={now} />
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-600">{getTechnician(c.technicianId)?.name ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-zinc-600">{fmtDate(c.createdAt)}</td>
                  <td className="py-2.5 tabular-nums">{c.reopenCount || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-10 text-center text-base text-zinc-500">No cases match these filters.</p>}
          {rows.length > 200 && <p className="pt-3 text-sm text-zinc-500">Showing the latest 200. Narrow the filters to see more.</p>}
        </div>
      </Panel>
    </div>
  );
}

function DlpLeft({ days }: { days: number | null }) {
  if (days === null) return null;
  return (
    <span className={`block text-xs ${days < 0 ? "text-red-700" : days <= (RULES.dlpExpiringDays ?? 90) ? "text-amber-700" : "text-zinc-500"}`}>
      {days < 0 ? "DLP ended" : `DLP ${days}d left`}
    </span>
  );
}
