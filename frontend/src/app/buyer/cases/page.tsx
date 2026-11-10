"use client";
import { CheckCircle2, ClipboardX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useRecentActivity } from "@/components/case-views";
import { DefectCard } from "@/components/defect-card";
import { EmptyState, MobileHeader, SummaryStrip, UnderlineTabs } from "@/components/mobile";
import { DEMO_BUYER } from "@/lib/constants";
import { Overlay } from "@/components/overlay";
import { UnitSignOffPanel, useSignoffOverdue, useUnitSignoff } from "@/components/unit-signoff";
import { submitVerification } from "@/lib/api";
import { useBuyerUnit } from "@/lib/session";
import { awaitingBuyerVerify, BUYER_TABS, inPendingTab, isOpen } from "@/lib/status";
import { useDemo, useOffline } from "@/lib/store";
import type { Case, CaseStatus } from "@/lib/types";

type TabId = (typeof BUYER_TABS)[number]["id"];

export default function Page() {
  return (
    <Suspense fallback={<MobileHeader title="My Defects" back="/buyer" />}>
      <MyDefects />
    </Suspense>
  );
}

/** ?tab=pending (from the home page's Sign Off button) opens the defects waiting for the buyer to verify. */
function MyDefects() {
  const cases = useDemo((s) => s.cases);
  const params = useSearchParams();
  const unitId = useBuyerUnit();
  const [tab, setTab] = useState<TabId>(() => BUYER_TABS.find((t) => t.id === params.get("tab"))?.id ?? "all");
  // Most recently updated first (latest progress on the case), not by report date.
  const own = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id), [cases]);
  const { sorted: mine } = useRecentActivity(own);

  const inTab = (c: Case, id: TabId) => {
    if (id === "pending") return inPendingTab(c);
    // A repaired defect stays Ongoing until the developer approves it, then moves to Pending.
    if (id === "ongoing" && inPendingTab(c)) return false;
    const t = BUYER_TABS.find((x) => x.id === id)!;
    return t.statuses === null || (t.statuses as readonly CaseStatus[]).includes(c.status);
  };
  const shown = mine.filter((c) => inTab(c, tab));

  // Pending tab: tick defects and verify them together (the same "Fixed" as on each Verify Repair page).
  const unit = useUnitSignoff(unitId);
  const overdue = useSignoffOverdue(unitId);
  const canVerify = !!unit?.canVerify && !overdue;
  const offline = useOffline();
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verifiable = tab === "pending" ? shown.filter(awaitingBuyerVerify).map((c) => c.id) : [];
  const selected = picked.filter((id) => verifiable.includes(id));
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  async function verifySelected() {
    setVerifying(true);
    let done = 0;
    for (const id of selected) {
      try {
        await submitVerification(id, "FIXED", "", null);
        done++;
      } catch (err) {
        toast.error(`${id}: ${err instanceof Error ? err.message : "could not be verified"}`);
      }
    }
    if (done) toast.success(`${done} repair${done > 1 ? "s" : ""} verified`);
    setPicked([]);
    setConfirming(false);
    setVerifying(false);
  }

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
            { label: "Closed", value: mine.filter((c) => !isOpen(c.status)).length },
          ]}
        />

        <UnitSignOffPanel unitId={unitId} />

        <UnderlineTabs
          tabs={BUYER_TABS.map((t) => ({ id: t.id, label: t.label, count: mine.filter((c) => inTab(c, t.id)).length }))}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPicked([]);
          }}
        />

        {verifiable.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canVerify}
              onClick={() => setPicked(selected.length === verifiable.length ? [] : verifiable)}
              className="text-xs font-semibold text-brand disabled:text-zinc-400"
            >
              {selected.length === verifiable.length ? "Clear selection" : "Select all"}
            </button>
            <button
              type="button"
              disabled={!canVerify || !selected.length || offline}
              onClick={() => setConfirming(true)}
              className="ml-auto h-9 rounded-lg bg-brand px-3 text-xs font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
            >
              Verify Selected ({selected.length})
            </button>
          </div>
        )}

        {shown.length === 0 ? (
          <EmptyState icon={<ClipboardX className="size-16" strokeWidth={1.5} />} text="There are no defects here at the moment." />
        ) : (
          <ul className="space-y-3">
            {shown.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                {tab === "pending" &&
                  (verifiable.includes(c.id) ? (
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      disabled={!canVerify}
                      onChange={() => toggle(c.id)}
                      aria-label={`Select ${c.id}`}
                      className="size-5 shrink-0 accent-[var(--brand)]"
                    />
                  ) : (
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="Verified" />
                  ))}
                <div className="min-w-0 flex-1">
                  <DefectCard c={c} href={`/buyer/cases/${c.id}`} buyer />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirming && (
        <Overlay label="Verify repairs" onClick={() => !verifying && setConfirming(false)} className="flex items-end bg-black/40">
          <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 pb-6 shadow-xl">
            <h2 className="text-base font-semibold">
              Verify {selected.length} repair{selected.length > 1 ? "s" : ""}?
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              I confirm that I have inspected {selected.length > 1 ? "these repairs" : "this repair"} and the defect{selected.length > 1 ? "s have" : " has"} been
              rectified. To report a repair that is not fixed, open it and use Verify Repair instead.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={verifying} onClick={() => setConfirming(false)} className="h-11 rounded-xl text-sm font-semibold text-zinc-700 ring-1 ring-zinc-300">
                Cancel
              </button>
              <button type="button" disabled={verifying || offline} onClick={verifySelected} className="flex h-11 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50">
                {verifying ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
