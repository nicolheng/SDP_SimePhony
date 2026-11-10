"use client";
import { Bell, BookOpen, ChevronRight, ClipboardCheck, ClipboardList, Clock, Headphones, Mail, Phone, PlusCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AssetPicker } from "@/components/asset-picker";
import { HomeSignOffButton } from "@/components/unit-signoff";
import { Avatar, BrandMark } from "@/components/brand";
import { useRecentActivity } from "@/components/case-views";
import { BuildingBanner } from "@/components/illustrations";
import { QuickAction, SectionHead, SummaryStrip } from "@/components/mobile";
import { DEMO_BUYER, getUnit, PROJECT_NAME } from "@/lib/constants";
import { setBuyerUnit, useBuyerUnit } from "@/lib/session";
import { buyerNeedsAction, isOpen, STATUS_META } from "@/lib/status";
import { useDemo } from "@/lib/store";

export default function BuyerHome() {
  const cases = useDemo((s) => s.cases);
  const messages = useDemo((s) => s.messages);
  const own = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id), [cases]);
  const { sorted: mine } = useRecentActivity(own);
  const ongoing = mine.filter((c) => isOpen(c.status));
  const closed = mine.filter((c) => !isOpen(c.status));
  const action = mine.filter(buyerNeedsAction);
  const updates = useMemo(() => messages.filter((m) => mine.some((c) => c.id === m.caseId)).length, [messages, mine]);
  const unitId = useBuyerUnit();
  const unit = getUnit(unitId);
  const [picking, setPicking] = useState(false);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 flex h-[84px] items-center rounded-b-[1.75rem] bg-ink px-4 text-white">
        <BrandMark size="sm" className="size-11" />
        <div className="ml-auto flex items-center gap-4">
          <Link href="/buyer/inbox" className="relative" aria-label="Inbox">
            <Bell className="size-6" />
            {updates > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold">{updates}</span>}
          </Link>
          <Link href="/buyer/profile" className="rounded-full ring-2 ring-white/80" aria-label="Profile">
            <Avatar who="buyer" className="size-10" />
          </Link>
        </div>
      </header>

      <div className="space-y-7 px-4 pt-5">
        <div>
          <p className="mb-2 text-lg font-semibold">Hi, {DEMO_BUYER.name.split(" ")[0]}</p>
          <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
            <div className="h-24">
              <BuildingBanner />
            </div>
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="whitespace-nowrap font-semibold">{PROJECT_NAME}</p>
                <p className="text-xs text-zinc-500">
                  Unit <span className="font-mono font-semibold text-zinc-900">{unit.id}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand/40 hover:bg-red-50"
                >
                  Select Another Asset
                </button>
                <HomeSignOffButton unitId={unitId} />
              </div>
            </div>
          </div>
          {picking && <AssetPicker value={unitId} onPick={setBuyerUnit} onClose={() => setPicking(false)} />}
        </div>

        <section>
          <SectionHead title="Quick Access" />
          <div className="grid grid-cols-4 gap-2">
            <QuickAction href="/buyer/report" icon={<PlusCircle className="size-6" />} label="Report Defect" />
            <QuickAction href="/buyer/cases" icon={<ClipboardList className="size-6" />} label="My Defects" badge={action.length} />
            <QuickAction href="/buyer/inspection-sheet" icon={<ClipboardCheck className="size-6" />} label="Inspection Sheet" />
            <QuickAction href="/buyer/manual" icon={<BookOpen className="size-6" />} label="User Manual" />
          </div>
        </section>

        <section>
          <SectionHead title="My Defects" href="/buyer/cases" />
          <SummaryStrip
            items={[
              { label: "Total Defects", value: mine.length },
              { label: "Ongoing", value: ongoing.length },
              { label: "Closed", value: closed.length },
            ]}
          />
          {action.length > 0 && (
            <Link href={`/buyer/cases/${action[0].id}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">!</span>
              <span className="flex-1 text-sm">
                <span className="font-semibold">Action needed:</span> {STATUS_META[action[0].status].buyer.toLowerCase()} for {action[0].id}
              </span>
              <ChevronRight className="size-4 text-amber-700" />
            </Link>
          )}
        </section>

        <section id="support">
          <SectionHead title="Support Team" />
          <div className="rounded-2xl p-4 ring-1 ring-zinc-200">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-red-50 text-brand">
                <Headphones className="size-5" />
              </span>
              <div>
                <p className="font-semibold">Defect Customer Care</p>
                <p className="text-xs text-zinc-500">We&apos;re here to help with your defect cases</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-700">
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 text-zinc-400" /> 1-800-00-0000 <span className="text-xs text-zinc-400">(demo)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 text-zinc-400" /> defects.support@example.com <span className="text-xs text-zinc-400">(demo)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="size-4 text-zinc-400" /> Mon–Fri, 9:00 am – 6:00 pm
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
