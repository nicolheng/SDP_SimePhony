"use client";
import { Bell, BookOpen, ChevronRight, ClipboardCheck, ClipboardList, Clock, Headphones, Mail, Phone, PlusCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BrandMark } from "@/components/brand";
import { useRecentActivity } from "@/components/case-views";
import { BuildingBanner } from "@/components/illustrations";
import { QuickAction, SectionHead, SummaryStrip } from "@/components/mobile";
import { StatusBadge } from "@/components/status-badge";
import { DEMO_BUYER, getUnit, PROJECT_NAME } from "@/lib/constants";
import { relative } from "@/lib/dates";
import { buyerNeedsAction, isOpen, STATUS_META } from "@/lib/status";
import { useDemo } from "@/lib/store";

const MANUAL_STEPS = [
  "Report the defect with a photo and pick an inspection slot.",
  "A technician inspects and confirms whether it is a defect.",
  "Book a repair slot; the technician fixes it.",
  "Check the repair with our checklist and sign off.",
];

export default function BuyerHome() {
  const cases = useDemo((s) => s.cases);
  const messages = useDemo((s) => s.messages);
  const now = useDemo((s) => s.now);
  const own = useMemo(() => cases.filter((c) => c.buyerId === DEMO_BUYER.id && !c.historical), [cases]);
  const { sorted: mine } = useRecentActivity(own);
  const ongoing = mine.filter((c) => isOpen(c.status));
  const closed = mine.filter((c) => !isOpen(c.status));
  const action = mine.filter(buyerNeedsAction);
  const updates = useMemo(() => messages.filter((m) => mine.some((c) => c.id === m.caseId)).length, [messages, mine]);
  const unit = getUnit(DEMO_BUYER.unitId);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 flex h-[84px] items-center rounded-b-[1.75rem] bg-ink px-4 text-white">
        <BrandMark size="sm" className="size-11" />
        <div className="ml-auto flex items-center gap-4">
          <Link href="/buyer/inbox" className="relative" aria-label="Inbox">
            <Bell className="size-6" />
            {updates > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold">{updates}</span>}
          </Link>
          <Link href="/buyer/profile" className="grid size-10 place-items-center rounded-full bg-zinc-300 text-zinc-500" aria-label="Profile">
            <UserRound className="size-6" />
          </Link>
        </div>
      </header>

      <div className="space-y-7 px-4 pt-5">
        <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
          <div className="h-24">
            <BuildingBanner />
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-zinc-500">Hi, {DEMO_BUYER.name.split(" ")[0]}</p>
              <p className="font-semibold">{PROJECT_NAME}</p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              Unit <span className="block font-mono text-sm font-semibold text-zinc-900">{unit.id}</span>
            </div>
          </div>
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
          <ul className="mt-3 divide-y divide-zinc-100">
            {ongoing.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link href={`/buyer/cases/${c.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.summary}</p>
                    <p className="text-xs text-zinc-500">
                      {c.id} · {relative(c.createdAt, now)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} buyer />
                  <ChevronRight className="size-4 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
          {ongoing.length === 0 && (
            <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
              No ongoing defects.
            </div>
          )}
        </section>

        <section>
          <SectionHead title="User Manual" href="/buyer/manual" more="Read guide" />
          <ol className="space-y-2.5 rounded-2xl bg-zinc-50 p-4">
            {MANUAL_STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm text-zinc-700">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
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
